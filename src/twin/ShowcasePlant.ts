import { createLogger } from '../utils/logger';
const log = createLogger('skinplant');
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { SeededRandom, overlayPhysiologyFruits, getCultivar } from '@farmsim/tomato-engine';
import { computePlantGeometry, type PlantBase, type AxisBase } from '../plant/PlantBase';
import {
  createLeafMeshFromNode,
  getLeafMaterial,
  getYellowLeafMaterial,
  getDiseasedLeafMaterial,
} from '../plant/LeafGenerator';
import { createStemMesh, createStemMeshFromSegments, getStemMaterial, createCurvedTube } from '../plant/StemGenerator';
import { createTrussNode, createTrussNodeFromBase } from '../plant/TrussGenerator';
import { buildCotyledonChunk } from '@farmsim/tomato-geometry';
import type { GrowthEngine, PlantState } from '@farmsim/tomato-engine';
import { createSkeletonOverlay, type SkeletonOverlayHandle } from './SkeletonOverlay';
import { useTwinStore } from '../store/twinStore';

/**
 * Live, GrowthEngine-driven plant that rebuilds on every day-scrub.
 *
 * Reads PlantState from the engine — heights, droop, leaf mass, stem
 * radius, ripening stage — so what you see is exactly what the
 * simulation says. Renders all 6 lifecycle stages:
 *   1. Cotyledon (떡잎)  day 3–25
 *   2. Early true leaf    leafMaturity < 0.4
 *   3. Compound developing 0.4–0.7
 *   4. Compound mature    > 0.7
 *   5. Senescent          yellowing > 0.3 → yellow material
 *   6. Pruned             leafMaturity < 0.05 → skipped
 *
 * + waterStress: extra droop, picks slightly-diseased material if high
 * + diseaseLoad: swaps to brown-spotted texture
 */
export interface ShowcasePlantHandle {
  root: TransformNode;
  /**
   * Rebuild the visual. If `physiology` is provided (Single-Plant
   * Analysis mode), the truss/fruit data is overlaid from the TOMGRO
   * PhysiologyState so the visual matches the academic model. Without
   * it, the legacy sigmoid path is used (Greenhouse mode).
   */
  update: (day: number, physiology?: import('@farmsim/tomato-engine').PlantPhysiologyState) => void;
  setVisible: (v: boolean) => void;
  setSegmentationMode: (on: boolean) => void;
  /** Plan 3a — toggle wireframe + node-marker skeleton view. While ON,
   *  the lush mesh is hidden so the user can verify the biology.
   *  Equivalent to `setSkeletonEnabled(on) + setLushEnabled(!on)`. */
  setSkeletonMode: (on: boolean) => void;
  /** ProgressiveLoad 용 — lush mesh visibility 만 독립 토글. */
  setLushEnabled: (v: boolean) => void;
  /** ProgressiveLoad 용 — skeleton overlay visibility 만 독립 토글.
   *  ON 시 plantBase 가 lastState 로부터 계산되어 skeleton 에 push. */
  setSkeletonEnabled: (v: boolean) => void;
  /** Plan 3a Phase ζ — push new SkeletonConfig (thickness/color/toggles). */
  setSkeletonConfig: (cfg: import('../store/twinStore').SkeletonConfig) => void;
  currentState: () => PlantState | null;
}

interface PartGroup {
  leaves: Mesh[];
  fruits: Mesh[];
  stem: Mesh | null;
  cotyledons: Mesh[];
}

let cachedCotyledonMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getCotyledonMaterial(scene: Scene): PBRMaterial {
  let mat = cachedCotyledonMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('cotyledonMat', scene);
    mat.albedoColor = Color3.FromHexString('#4aaa30');
    mat.metallic = 0;
    mat.roughness = 0.8;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    cachedCotyledonMaterial.set(scene, mat);
  }
  return mat;
}

function applyCotyledonChunk(scene: Scene, name: string, size: number) {
  const chunk = buildCotyledonChunk({ size });
  const vd = new VertexData();
  vd.positions = chunk.positions;
  vd.normals = chunk.normals;
  vd.uvs = chunk.uvs;
  vd.indices = chunk.indices;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  return mesh;
}

export function createShowcasePlant(
  scene: Scene,
  engine: GrowthEngine,
  seed: number,
  worldPosition: Vector3
): ShowcasePlantHandle {
  // root = shared wrapper. BabylonEngine 의 wind sway 가 여기 적용됨.
  // 그 안에 lushGroup (lush meshes only) + skeleton overlay root 가 sibling.
  // setSkeletonMode 가 lushGroup 만 disable 하므로 skeleton 은 영향 X.
  const root = new TransformNode(`showcase_${seed}`, scene);
  root.position.copyFrom(worldPosition);
  const lushGroup = new TransformNode(`showcase_lush_${seed}`, scene);
  lushGroup.parent = root;

  const leafMat = getLeafMaterial(scene);
  const yellowLeafMat = getYellowLeafMaterial(scene);
  const diseasedLeafMat = getDiseasedLeafMaterial(scene);
  const cotyledonMat = getCotyledonMaterial(scene);
  const stemMat = getStemMaterial(scene);

  let currentMeshes: Mesh[] = [];
  let currentTransformNodes: TransformNode[] = [];
  let currentParts: PartGroup = { leaves: [], fruits: [], stem: null, cotyledons: [] };
  let lastState: PlantState | null = null;
  let lastBuildDay = -999;
  const REBUILD_THRESHOLD_DAYS = 0.5;

  // Highlight layer for segmentation-mode color outlines
  const highlight = new HighlightLayer('showcase_hl', scene);
  highlight.innerGlow = false;
  highlight.outerGlow = true;
  highlight.blurHorizontalSize = 0.6;
  highlight.blurVerticalSize = 0.6;

  let segmentationOn = false;
  let skeletonOn = false;
  // Plan 3b Phase η-1 — skeleton overlay 를 ShowcasePlant.root 의 child 로.
  // 그래야 lush mesh 와 *같은 world transform* 으로 렌더 (X offset bug 방지).
  const skeleton: SkeletonOverlayHandle = createSkeletonOverlay(scene, root);

  // Plan 3b Phase η-2 — 진단 로그 (store.debugDiagnostics ON 일 때만).
  function diag(): boolean {
    return useTwinStore.getState().debugDiagnostics;
  }
  // 타입은 Mesh / AbstractMesh 호환 위해 import 의 AbstractMesh 사용 안 하고
  // 메소드 호출만 하니 widening 으로 처리.
  function logBbox(label: string, meshes: ReadonlyArray<import('@babylonjs/core/Meshes/abstractMesh').AbstractMesh>): void {
    let n = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const m of meshes) {
      try {
        // 최신 Babylon AbstractMesh.refreshBoundingInfo 시그니처:
        // (applySkeletonOrOptions: boolean | IMeshDataOptions, applyMorph: boolean) => this
        m.refreshBoundingInfo(false, false);
        const b = m.getBoundingInfo().boundingBox;
        const lo = b.minimumWorld; const hi = b.maximumWorld;
        if (Number.isFinite(lo.y) && Number.isFinite(hi.y)) {
          n++;
          minX = Math.min(minX, lo.x); maxX = Math.max(maxX, hi.x);
          minY = Math.min(minY, lo.y); maxY = Math.max(maxY, hi.y);
          minZ = Math.min(minZ, lo.z); maxZ = Math.max(maxZ, hi.z);
        }
      } catch { /* ignore */ }
    }
    if (n === 0) { log.debug(`${label}: 0 meshes`); return; }
    log.debug(
      `[diag:4]   ${label}: n=${n} world-bbox min=(${minX.toFixed(3)}, ${minY.toFixed(3)}, ${minZ.toFixed(3)}) ` +
      `max=(${maxX.toFixed(3)}, ${maxY.toFixed(3)}, ${maxZ.toFixed(3)})`,
    );
  }

  function applySegmentationHighlights() {
    highlight.removeAllMeshes();
    if (!segmentationOn) return;
    for (const leaf of currentParts.leaves) {
      highlight.addMesh(leaf, Color3.FromHexString('#6ee7b7'));
    }
    for (const fruit of currentParts.fruits) {
      highlight.addMesh(fruit, Color3.FromHexString('#fbbf24'));
    }
    if (currentParts.stem) {
      highlight.addMesh(currentParts.stem, Color3.FromHexString('#60a5fa'));
    }
  }

  function disposeAll() {
    // BUG fix: previously called dispose(false, true) which means
    // "doNotRecurse=false, disposeMaterialAndTextures=true". The shared
    // leafMat / stemMat / cotyledonMat are looked up via WeakMap caches
    // (LeafGenerator.getLeafMaterial, etc.) and reused across every
    // plant in the scene. Disposing them here killed the material on
    // every rebuild, so after the first rebuild the leaves rendered
    // against a disposed material and degenerated visually (user
    // observation: "first load shows leaves, scrubbing the timeline
    // makes them disappear").
    //
    // Pass `disposeMaterialAndTextures = false`. Material lifecycle is
    // owned by the LeafGenerator caches, not by individual meshes.
    for (const m of currentMeshes) m.dispose(false, false);
    for (const n of currentTransformNodes) {
      for (const child of n.getChildMeshes(false)) child.dispose(false, false);
      n.dispose(false, false);
    }
    currentMeshes = [];
    currentTransformNodes = [];
    currentParts = { leaves: [], fruits: [], stem: null, cotyledons: [] };
    highlight.removeAllMeshes();
  }

  function buildFromState(state: PlantState, plantBase: PlantBase) {
    disposeAll();
    lastState = state;

    if (state.nodes.length === 0 && !state.hasCotyledons) return;

    const genome = engine.getGenome(seed)!;

    // === Cotyledons (떡잎) ===
    // Two opposing planes that fade in (day 3-8), peak (8-15), fade out (15-25).
    if (state.hasCotyledons && state.cotyledonSize > 0.01) {
      const cotSize = 0.03 * state.cotyledonSize; // ~3cm at peak (was 0.015×2)
      const cotY = state.nodes.length > 0
        ? (state.nodes[0].heightCm / 100) * 0.3
        : 0.03;
      for (const side of [-1, 1] as const) {
        const cot = applyCotyledonChunk(
          scene,
          `showcase_cot_${seed}_${side}`,
          cotSize
        );
        cot.parent = lushGroup;
        cot.position = new Vector3(side * cotSize * 0.5, cotY, 0);
        // tilt slightly outward + face up
        cot.rotation = new Vector3(-0.3 * side, side * 0.5, 0);
        cot.material = cotyledonMat;
        // Fade alpha as cotyledon shrinks past peak
        cotyledonMat.alpha = Math.max(0.5, Math.min(1, state.cotyledonSize * 1.4));
        cotyledonMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
        currentMeshes.push(cot);
        currentParts.cotyledons.push(cot);
      }
    }

    // === Stems + leaves + trusses — iterate all axes (main + side shoots) ===
    // Plan 3b: single source of truth. Plan 3c-1: 곁가지 도 자체 leaf 생물학.
    // 한 함수 (buildAxisVisuals) 에서 axis 1개의 stem + leaf + truss 모두
    // 처리 — main 과 side shoot 코드 중복 제거.
    const isDiseased = state.diseaseLoad > 0.3;
    const leafMatForPlant = isDiseased ? diseasedLeafMat : leafMat;

    // v4.0 — every position / azimuth / visibility decision comes from
    // PlantBase. The NodeState lookup is for genome/RNG-driven mesh
    // construction details only (LeafGenerator, TrussGenerator), not
    // for placement.
    const rawAxes = state.allAxes ?? [state.mainAxis];
    const baseAxes: AxisBase[] = [plantBase.mainAxis, ...plantBase.sideShoots];

    const buildAxisVisuals = (
      axisBase: AxisBase,
      rawAxis: import('@farmsim/tomato-engine').StemAxis,
      axisIdx: number,
    ) => {
      const isMain = axisIdx === 0;
      const stemOpts = isMain
        ? { radialSegments: 12, nodeBulge: 0.15, verticalStripeCount: 8, stripeDepth: 0.06 }
        : { radialSegments: 10, nodeBulge: 0.10, verticalStripeCount: 8, stripeDepth: 0.05 };

      const origin = isMain ? undefined : null;

      // === Stem === — PlantBase StemSegment[] drives both lush and skeleton.
      if (axisBase.stemCurve.length >= (isMain ? 2 : 1)) {
        const stem = createStemMeshFromSegments(
          `showcase_stem_${seed}_a${axisIdx}`,
          scene,
          axisBase.stemCurve,
          { ...stemOpts, origin },
        );
        if (stem) {
          stem.parent = lushGroup;
          stem.material = stemMat;
          currentMeshes.push(stem);
          if (isMain) currentParts.stem = stem;
        }
      }

      // === Leaves === — visibility/position from PlantBase, mesh from NodeState.
      for (const leafBase of axisBase.leaves) {
        if (!leafBase.visibility.visible) continue;
        const rawNode = rawAxis.nodes[leafBase.nodeIdx];
        if (!rawNode) continue;

        // Leaf 가 충분히 자라지 않은 케이스 (sizeFactor 매우 작음) 면
        // petiole 도 blade 도 거의 안 보이는데 petiole 의 minimum 굵기
        // (1mm) 가 그대로면 sky 에 막대만 floating. 둘 다 skip.
        if (leafBase.sizeFactor < 0.12) continue;

        // Petiole tube — petioleCurve (PlantBase.ts buildLeafBase) 의 4 control
        // points 따라 catmull-rom tube. lush mesh 에 petiole 시각화
        // (이전엔 skeleton overlay 에서만 wire 로 보임). 굵기는 sizeFactor
        // 에 직접 비례 — 작은 잎은 자연스럽게 가는 줄.
        if (leafBase.petioleCurve && leafBase.petioleCurve.length >= 4) {
          const petCps = leafBase.petioleCurve.map((p) => new Vector3(p.x, p.y, p.z));
          const sf = Math.max(0.12, Math.min(1, leafBase.sizeFactor));
          const petBase = 0.0012 * sf;   // sf=1 → 1.2mm, sf=0.12 → 0.14mm
          const petTip = petBase * 0.6;
          const petRadii = [petBase, petBase * 0.85, petBase * 0.7, petTip];
          const petioleMesh = createCurvedTube(
            `showcase_petiole_${seed}_a${axisIdx}_n${leafBase.nodeIdx}`,
            scene,
            petCps,
            petRadii,
            { radialSegments: 5 },
          );
          if (petioleMesh) {
            petioleMesh.material = stemMat;
            petioleMesh.parent = lushGroup;
            currentMeshes.push(petioleMesh);
          }
        }

        const leafRng = new SeededRandom(seed * 1000 + axisIdx * 99991 + leafBase.nodeIdx * 13 + 7);
        const leaf = createLeafMeshFromNode(
          `showcase_leaf_${seed}_a${axisIdx}_n${leafBase.nodeIdx}`,
          scene,
          rawNode,
          genome,
          state.day,
          leafRng,
        );
        leaf.material = leafBase.yellowing > 0.4 ? yellowLeafMat : leafMatForPlant;
        leaf.parent = lushGroup;
        // Leaf blade 는 petiole tip 에서 시작. 이전엔 attachPosition (stem 표면)
        // 에서 회전된 plane 이라 blade base 가 stem 근처에 박힌 듯한 시각.
        // petiole tip 으로 옮기면 stem → petiole → blade 의 연결이 자연스러움.
        const bladeAnchor = leafBase.petioleCurve && leafBase.petioleCurve.length > 0
          ? leafBase.petioleCurve[leafBase.petioleCurve.length - 1]
          : leafBase.attachPosition;
        leaf.position = new Vector3(bladeAnchor.x, bladeAnchor.y, bladeAnchor.z);
        const q = Quaternion.RotationAxis(Vector3.Up(), leafBase.azimuthRad).multiply(
          Quaternion.RotationAxis(new Vector3(0, 0, 1), -leafBase.droopRad),
        );
        leaf.rotationQuaternion = q;
        currentMeshes.push(leaf);
        currentParts.leaves.push(leaf);
      }

      // === Trusses === — v4.1 3-tier cymose. visibility/positions/stage
      // 모두 PlantBase 의 floralSites 에서. Mesh 생성은 TrussGenerator
      // .createTrussNodeFromBase 가 peduncle / rachis / per-site pedicel
      // + organ 을 모두 처리. legacy createTrussNode 는 fallback.
      for (const trussBase of axisBase.trusses) {
        if (!trussBase.visibility.visible) continue;
        const trussRng = new SeededRandom(seed * 7919 + axisIdx * 88883 + trussBase.nodeIdx * 31);

        const useV41 = !!trussBase.floralSites && !!trussBase.peduncleCurve && !!trussBase.rachisCurve;
        let trussNode;
        if (useV41) {
          // v4.1 — single source of truth, no positioning here.
          trussNode = createTrussNodeFromBase(
            `showcase_truss_${seed}_a${axisIdx}_n${trussBase.nodeIdx}`,
            scene, trussBase, trussRng,
            { tubeDivisions: 8 },  // close-up hero LOD — smoother peduncle/rachis/pedicel curves
          );
          trussNode.parent = lushGroup;
          // PlantBase pre-baked world coords, no extra positioning.
        } else {
          // Legacy v4.0 fallback (Phase F removes). PlantBase v4.1 always
          // populates floralSites/peduncleCurve/rachisCurve, so this path
          // should not be reachable. Dev warn to catch regressions.
          if (import.meta.env?.DEV) {
            log.warn(
              `ShowcasePlant trussNode legacy fallback hit `
              + `for axis ${axisIdx} truss n${trussBase.nodeIdx}. `
              + `PlantBase should populate v4.1 fields.`,
            );
          }
          const rawNode = rawAxis.nodes[trussBase.nodeIdx];
          if (!rawNode || !rawNode.truss) continue;
          trussNode = createTrussNode(
            `showcase_truss_${seed}_a${axisIdx}_n${trussBase.nodeIdx}`,
            scene, rawNode.truss, genome, trussBase.azimuthRad, trussRng,
          );
          trussNode.parent = lushGroup;
          trussNode.position = new Vector3(
            trussBase.worldOrigin.x,
            trussBase.worldOrigin.y,
            trussBase.worldOrigin.z,
          );
        }
        trussNode.getChildMeshes().forEach((m) => {
          if (m.name.includes('_body')) {
            currentParts.fruits.push(m as Mesh);
          }
        });
        currentTransformNodes.push(trussNode);
      }
    };

    // Drive across PlantBase axes — main + each side shoot.
    for (let a = 0; a < baseAxes.length; a++) {
      const raw = rawAxes[a];
      if (!raw) continue;
      buildAxisVisuals(baseAxes[a], raw, a);
    }

    applySegmentationHighlights();
  }

  return {
    root,
    update(day, physiology) {
      if (diag()) {
        log.debug(`showcase.update(day=${day.toFixed(2)}, physiology=${physiology ? 'yes' : 'no'})`);
      }
      // Single-plant mode (physiology supplied): always rebuild —
      // ignore the day-threshold throttle so 1-minute scrubs visibly
      // update fruit color/size. The mesh rebuild is light enough at
      // 1 plant.
      if (!physiology && Math.abs(day - lastBuildDay) < REBUILD_THRESHOLD_DAYS) return;
      lastBuildDay = day;
      let state = engine.computeState(seed, day);
      if (physiology) {
        // Overlay TOMGRO truss/fruit data onto the sigmoid base state.
        state = overlayPhysiologyFruits(state, physiology);
      }
      // v4.0 — compute PlantBase once (geometric truth) and feed both
      // the lush mesh build and the skeleton overlay. Identical world
      // coords on both views by construction.
      const cultivarName = engine.getCultivarFor(seed)?.name ?? 'tomimaru-muchoo';
      const plantBase = computePlantGeometry(state, {
        genome: engine.getGenome(seed)!,
        cultivar: getCultivar(cultivarName),
        physiologyState: physiology,
      });
      buildFromState(state, plantBase);
      skeleton.update(plantBase);

      if (diag()) {
        const apex = state.nodes[state.nodes.length - 1];
        log.debug(`nodes=${state.nodes.length} allAxes=${state.allAxes?.length ?? '?'}`);
        if (apex && apex.position) {
          log.debug(`apex — heightCm=${apex.heightCm.toFixed(1)} position=(${apex.position.x.toFixed(3)}, ${apex.position.y.toFixed(3)}, ${apex.position.z.toFixed(3)})`);
        }
      }
    },
    setVisible(v) {
      root.setEnabled(v);
    },
    setSegmentationMode(on) {
      if (segmentationOn === on) return;
      segmentationOn = on;
      applySegmentationHighlights();
    },
    setLushEnabled(v) {
      // lushGroup 만 토글. skeleton 은 영향 없음.
      // root 자체는 변경 X — wind sway 와 worldPosition 은 lush/skeleton 양쪽이
      // 공유해야 하므로 root 가 아닌 lushGroup 으로 hide.
      lushGroup.setEnabled(v);
      // Dev-mode ownership audit. 모든 ShowcasePlant lush mesh는 lushGroup의
      // (간접) 자손이어야 함 — 다른 부모에 leak되면 토글 무시되어 skeleton
      // 모드에서 fruit body가 보이는 등의 시각 회귀 발생.
      if (import.meta.env?.DEV && !v) {
        const PREFIXES = [
          'showcase_fruit_', 'showcase_truss_', 'showcase_stem_',
          'showcase_leaf_', 'showcase_cot_', 'showcase_sidestem_',
        ];
        const orphans = scene.meshes.filter(
          (m) => PREFIXES.some((p) => m.name.startsWith(p)) && m.isEnabled(),
        );
        if (orphans.length > 0) {
          log.warn(
            `${orphans.length} mesh(es) still enabled after `
            + `setLushEnabled(false). Check parenting to lushGroup. Names:`,
            orphans.map((m) => m.name).slice(0, 10),
          );
        }
      }
    },
    setSkeletonEnabled(v) {
      if (skeletonOn === v) return;
      skeletonOn = v;
      // ON 시 plantBase 를 lastState 로부터 계산해서 skeleton 에 push.
      if (v && lastState) {
        const cultivarName = engine.getCultivarFor(seed)?.name ?? 'tomimaru-muchoo';
        const physiology = engine.getPhysiologyState(seed) ?? undefined;
        const plantBase = computePlantGeometry(lastState, {
          genome: engine.getGenome(seed)!,
          cultivar: getCultivar(cultivarName),
          physiologyState: physiology,
        });
        skeleton.update(plantBase);
      }
      skeleton.setVisible(v);
    },
    setSkeletonMode(on) {
      // Legacy combined toggle — skeleton ON 일 때 lush OFF.
      this.setSkeletonEnabled(on);
      this.setLushEnabled(!on);
      if (diag()) {
        log.debug(`setSkeletonMode(${on})`);
        const lushStem = scene.meshes.filter(
          (m) => m.name.startsWith('showcase_stem_') || m.name.startsWith('showcase_sidestem_'),
        );
        const skelMesh = scene.meshes.filter((m) => m.name.startsWith('skel_'));
        log.debug(`mesh tally — lush stem: ${lushStem.length}, skel: ${skelMesh.length}`);
        logBbox('lush', lushStem);
        logBbox('skel', skelMesh);
      }
    },
    setSkeletonConfig(cfg) {
      skeleton.setConfig(cfg);
    },
    currentState: () => lastState,
  };
}
