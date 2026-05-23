import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { SeededRandom, overlayPhysiologyFruits } from '@farmsim/tomato-engine';
import {
  createLeafMeshFromNode,
  getLeafMaterial,
  getYellowLeafMaterial,
  getDiseasedLeafMaterial,
} from '../plant/LeafGenerator';
import { createStemMesh, getStemMaterial } from '../plant/StemGenerator';
import { createTrussNode } from '../plant/TrussGenerator';
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
   *  the lush mesh is hidden so the user can verify the biology (apex,
   *  node bulge, side shoots, pruning) without visual noise. */
  setSkeletonMode: (on: boolean) => void;
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
  const root = new TransformNode(`showcase_${seed}`, scene);
  root.position.copyFrom(worldPosition);

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
    if (n === 0) { console.log(`[diag:4]   ${label}: 0 meshes`); return; }
    console.log(
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

  function buildFromState(state: PlantState) {
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
        cot.parent = root;
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

    // === Stem (main axis) ===
    if (state.nodes.length >= 2) {
      const stemRng = new SeededRandom(seed * 13);
      const stem = createStemMesh(`showcase_stem_${seed}`, scene, state.nodes, stemRng);
      if (stem) {
        stem.parent = root;
        stem.material = stemMat;
        currentMeshes.push(stem);
        currentParts.stem = stem;
      }
    }

    // === Side shoot stems (Plan 3b Phase ζ-4) ===
    // plant.allAxes 의 order >= 1 axis 들. 각각 자체 stem mesh.
    // 부모 attachment 위치 (mainAxis.nodes[parentNodeIdx].position) 에서 시작.
    if (state.allAxes && state.allAxes.length > 1) {
      for (let a = 1; a < state.allAxes.length; a++) {
        const sideAxis = state.allAxes[a];
        if (!sideAxis.nodes || sideAxis.nodes.length < 1) continue;
        // 부모 axis 의 분기 node 좌표 — origin
        const parentAxisIdx = sideAxis.parentAxisIdx ?? 0;
        const parentAxis = state.allAxes[parentAxisIdx];
        const parentNode = parentAxis?.nodes[sideAxis.parentNodeIdx ?? 0];
        const origin = parentNode?.position
          ? { x: parentNode.position.x, y: parentNode.position.y, z: parentNode.position.z }
          : null;
        // 곁가지 nodes 가 1개여도 origin 까지 더하면 2 point — line drawable
        const sideRng = new SeededRandom(seed * 13 + a * 101);
        const sideStem = createStemMesh(
          `showcase_sidestem_${seed}_${a}`,
          scene,
          sideAxis.nodes.length >= 1 ? sideAxis.nodes : [],
          sideRng,
          { origin },
        );
        if (sideStem) {
          sideStem.parent = root;
          sideStem.material = stemMat;
          currentMeshes.push(sideStem);
        }
      }
    }

    // Select effective leaf material per plant-level health
    const isDiseased = state.diseaseLoad > 0.3;
    const leafMatForPlant = isDiseased ? diseasedLeafMat : leafMat;

    // === Leaves + truss — Plan 3b: node.position 직접 사용 ===
    // Skeleton 의 authoritative 3D 위치 → lush mesh 가 skeleton 과 동일
    // 형태. Mode 와 무관하게 같은 plant 의 같은 anatomy.
    for (const node of state.nodes) {
      if (node.leafMaturity < 0.05) continue;

      const azimuthRad = (node.phyllotaxisAngle * Math.PI) / 180;
      const droopRad = (node.droopExtra * Math.PI) / 180;

      const rng = new SeededRandom(seed * 1000 + node.index * 13 + 7);
      const leaf = createLeafMeshFromNode(
        `showcase_leaf_${seed}_${node.index}`,
        scene,
        node,
        genome,
        state.day,
        rng
      );
      leaf.material = node.yellowing > 0.4
        ? yellowLeafMat
        : leafMatForPlant;
      leaf.parent = root;
      leaf.position = new Vector3(node.position.x, node.position.y, node.position.z);

      const q = Quaternion.RotationAxis(Vector3.Up(), azimuthRad).multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), -droopRad)
      );
      leaf.rotationQuaternion = q;
      currentMeshes.push(leaf);
      currentParts.leaves.push(leaf);

      // Truss — 휜 줄기의 실제 위치에서 phyllotaxis 반대 방향으로 분기
      if (node.truss && (node.truss.fruits.length > 0 || node.truss.flowers.length > 0)) {
        const trussRng = new SeededRandom(seed * 7919 + node.index * 31);
        const trussNode = createTrussNode(
          `showcase_truss_${seed}_${node.index}`,
          scene,
          node.truss,
          genome,
          azimuthRad + Math.PI,
          trussRng
        );
        trussNode.parent = root;
        trussNode.position = new Vector3(
          node.position.x,
          node.position.y - 0.02,
          node.position.z,
        );

        trussNode.getChildMeshes().forEach((m) => {
          if (m.name.includes('_body')) {
            currentParts.fruits.push(m as Mesh);
          }
        });
        currentTransformNodes.push(trussNode);
      }
    }

    applySegmentationHighlights();
  }

  return {
    root,
    update(day, physiology) {
      if (diag()) {
        console.log(`[diag:1] showcase.update(day=${day.toFixed(2)}, physiology=${physiology ? 'yes' : 'no'})`);
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
      buildFromState(state);
      // Keep skeleton overlay in sync with current plant data.
      skeleton.update(state);

      if (diag()) {
        const apex = state.nodes[state.nodes.length - 1];
        console.log(`[diag:1]   nodes=${state.nodes.length} allAxes=${state.allAxes?.length ?? '?'}`);
        if (apex && apex.position) {
          console.log(`[diag:1]   apex — heightCm=${apex.heightCm.toFixed(1)} position=(${apex.position.x.toFixed(3)}, ${apex.position.y.toFixed(3)}, ${apex.position.z.toFixed(3)})`);
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
    setSkeletonMode(on) {
      if (skeletonOn === on) return;
      skeletonOn = on;
      if (diag()) {
        console.log(`[diag:2] setSkeletonMode(${on})`);
        const p = root.position;
        console.log(`[diag:2]   ShowcasePlant.root.position = (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`);
        const sn = scene.transformNodes.find((n) => n.name === 'skeletonOverlayRoot');
        if (sn) {
          console.log(`[diag:2]   SkeletonOverlay.root.position(local) = (${sn.position.x.toFixed(3)}, ${sn.position.y.toFixed(3)}, ${sn.position.z.toFixed(3)})`);
          console.log(`[diag:2]   SkeletonOverlay.root.parent = ${sn.parent?.name ?? 'null'}`);
        } else {
          console.log(`[diag:2]   SkeletonOverlay.root: not yet created (lazy)`);
        }
      }
      // Hide lush mesh while skeleton is on so user can verify biology.
      root.setEnabled(!on);
      skeleton.setVisible(on);
      if (on && lastState) skeleton.update(lastState);

      if (diag()) {
        const lushStem = scene.meshes.filter(
          (m) => m.name.startsWith('showcase_stem_') || m.name.startsWith('showcase_sidestem_'),
        );
        const skelMesh = scene.meshes.filter((m) => m.name.startsWith('skel_'));
        console.log(`[diag:4] mesh tally — lush stem: ${lushStem.length}, skel: ${skelMesh.length}`);
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
