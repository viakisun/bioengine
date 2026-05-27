// SkinMeshPlant — SSOT Phase 4 sibling of ShowcasePlant.
//
// Same ShowcasePlantHandle interface, same lifecycle, same materials,
// same cotyledons / fruit / calyx / flower path. Only the stem-like
// mesh pipeline is different:
//
//   ShowcasePlant: organ-by-organ
//     - stem mesh per axis (createStemMeshFromSegments)
//     - petiole tube per leaf (createCurvedTube)
//     - peduncle/rachis/pedicel tubes per truss (createTrussNodeFromBase)
//     - leaf blade INCLUDES embedded petiole/rachis/petiolule cylinders
//   SkinMeshPlant: single continuous skin mesh
//     - one PlantSkinMesh (SDF + smin + marching cubes) covers
//       mainStem + petiole + peduncle + rachis + pedicel as a single
//       watertight surface — junction filleting is automatic.
//     - leaf blade omits the petiole cylinder (covered by the skin mesh)
//     - truss organs (fruit body / calyx / flower) are the same per-mesh
//       primitives ShowcasePlant uses
//
// Per plan SSOT Phase 4 "완전한 분기": ShowcasePlant.ts is untouched.
// This file owns its own state, dispose registry, and mesh build.

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import {
  SeededRandom,
  overlayPhysiologyFruits,
  getCultivar,
} from '@farmsim/tomato-engine';
import { computePlantGeometry, type PlantBase, type AxisBase } from '../plant/PlantBase';
import { getStemMaterial } from '../plant/StemGenerator';
import { createTrussFruitOrgansOnly } from '../plant/TrussGenerator';
import { buildCotyledonChunk } from '@farmsim/tomato-geometry';
import type {
  GrowthEngine,
  PlantState,
} from '@farmsim/tomato-engine';
import { createSkeletonOverlay, type SkeletonOverlayHandle } from './SkeletonOverlay';
import { useTwinStore } from '../store/twinStore';
import { buildTomatoSkeletonGraph } from '../plant/skeleton/buildTomatoSkeletonGraph';
import { buildPlantSkinMesh } from '../plant/skin/buildPlantSkinMesh';
// Iter 17 SSOT #173: legacy per-leaf createLeafMeshFromNode pipeline. Same
// approach SupportingPlant/ShowcasePlant already use successfully — each
// leaf becomes its own Mesh rotated by phyllotaxis azimuth + droop, so the
// canopy has 3D volume from every camera angle. The previous single-mesh
// Leaf Module v0.1 (buildLeafBladeMesh) locked all leaflet planes to
// horizontal via pickInitialBinormal = cross(tangent, world_up), producing
// the "half the canopy disappears at parallel-camera angles" symptom.
import { createLeafMeshFromNode, getLeafMaterial, getYellowLeafMaterial } from '../plant/LeafGenerator';
import type { ShowcasePlantHandle } from './ShowcasePlant';

// SkinMeshPlant implements the same surface API as ShowcasePlant so it
// can be swapped 1:1 by BabylonEngine.
export type SkinMeshPlantHandle = ShowcasePlantHandle;

interface PartGroup {
  leaves: Mesh[];
  fruits: Mesh[];
  stem: Mesh | null;        // single skin mesh covers mainStem + petiole + truss tier
  cotyledons: Mesh[];
}

// ── Cotyledon material (local cache — independent from ShowcasePlant) ──

let cachedCotyledonMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getCotyledonMaterial(scene: Scene): PBRMaterial {
  let mat = cachedCotyledonMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('skinplant_cotyledonMat', scene);
    mat.albedoColor = Color3.FromHexString('#4aaa30');
    mat.metallic = 0;
    mat.roughness = 0.8;
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    cachedCotyledonMaterial.set(scene, mat);
  }
  return mat;
}

function applyCotyledonChunk(scene: Scene, name: string, size: number): Mesh {
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

// ── Skin mesh material (vertex-color driven) ───────────────────────────

let cachedSkinMaterial: WeakMap<Scene, PBRMaterial> = new WeakMap();
function getSkinMeshMaterial(scene: Scene): PBRMaterial {
  let mat = cachedSkinMaterial.get(scene);
  if (!mat) {
    mat = new PBRMaterial('skinplant_unifiedStemMat', scene);
    mat.albedoColor = new Color3(1, 1, 1);  // white — vertex color drives
    mat.metallic = 0;
    mat.roughness = 0.75;
    cachedSkinMaterial.set(scene, mat);
  }
  return mat;
}

// ── Main factory ──────────────────────────────────────────────────────

export function createSkinMeshPlant(
  scene: Scene,
  engine: GrowthEngine,
  seed: number,
  worldPosition: Vector3,
): SkinMeshPlantHandle {
  const root = new TransformNode(`skinplant_${seed}`, scene);
  root.position.copyFrom(worldPosition);
  const lushGroup = new TransformNode(`skinplant_lush_${seed}`, scene);
  lushGroup.parent = root;

  const cotyledonMat = getCotyledonMaterial(scene);
  const skinMat = getSkinMeshMaterial(scene);
  // Iter 17 — legacy leaf materials (matches SupportingPlant/ShowcasePlant).
  const leafMat = getLeafMaterial(scene);
  const yellowLeafMat = getYellowLeafMaterial(scene);
  void getStemMaterial;  // import-graph stability — kept for parity, not used directly

  let currentMeshes: Mesh[] = [];
  let currentTransformNodes: TransformNode[] = [];
  let currentParts: PartGroup = { leaves: [], fruits: [], stem: null, cotyledons: [] };
  let lastState: PlantState | null = null;
  let lastBuildDay = -999;
  const REBUILD_THRESHOLD_DAYS = 0.5;

  const highlight = new HighlightLayer('skinplant_hl', scene);
  highlight.innerGlow = false;
  highlight.outerGlow = true;
  highlight.blurHorizontalSize = 0.6;
  highlight.blurVerticalSize = 0.6;

  let segmentationOn = false;
  let skeletonOn = false;
  const skeleton: SkeletonOverlayHandle = createSkeletonOverlay(scene, root);

  function diag(): boolean {
    return useTwinStore.getState().debugDiagnostics;
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

  function buildFromState(state: PlantState, plantBase: PlantBase, cultivarKey: string) {
    disposeAll();
    lastState = state;

    if (state.nodes.length === 0 && !state.hasCotyledons) return;

    void engine.getGenome(seed)!; // present for future callers

    // === Cotyledons (떡잎) — identical to ShowcasePlant ===
    if (state.hasCotyledons && state.cotyledonSize > 0.01) {
      const cotSize = 0.03 * state.cotyledonSize;
      const cotY = state.nodes.length > 0
        ? (state.nodes[0].heightCm / 100) * 0.3
        : 0.03;
      for (const side of [-1, 1] as const) {
        const cot = applyCotyledonChunk(
          scene,
          `skinplant_cot_${seed}_${side}`,
          cotSize,
        );
        cot.parent = lushGroup;
        cot.position = new Vector3(side * cotSize * 0.5, cotY, 0);
        cot.rotation = new Vector3(-0.3 * side, side * 0.5, 0);
        cot.material = cotyledonMat;
        cotyledonMat.alpha = Math.max(0.5, Math.min(1, state.cotyledonSize * 1.4));
        cotyledonMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
        currentMeshes.push(cot);
        currentParts.cotyledons.push(cot);
      }
    }

    // === Single Mesh / Single VertexData — stem family tube network ===
    //   PlantSkeletonGraph → embedded-branch tube network → 1 Babylon Mesh.
    //   No junction stitching; child tubes start inside parent (no start cap).
    //   Topology is disjoint within the single buffer (SSOT plan 결정).
    const graph = buildTomatoSkeletonGraph(plantBase, { curveDivisions: 2 });
    const skin = buildPlantSkinMesh(scene, graph, {
      radialSegments: 8,
      rootRadiusScale: 1.15,
      parentSwellingScale: 1.10,
    });

    console.log(
      `[skinplant] graph: nodes=${graph.nodes.size} edges=${graph.edges.size} | ` +
      `tube: edges=${skin.stats.edgeCount} branches=${skin.stats.branchCount} ` +
      `verts=${skin.stats.vertexCount} tris=${skin.stats.triangleCount} ` +
      `buildMs=${skin.stats.buildMs.toFixed(1)}`,
    );
    // Iter 18A SSOT #176 — per-edge-type fidelity audit dump.
    const edgeTypes = ['mainStem', 'sideShoot', 'petiole', 'peduncle', 'rachis', 'pedicel'] as const;
    const typeRows = edgeTypes.map((t) => {
      const inGraph = skin.stats.edgesByType[t] ?? 0;
      const emitted = skin.stats.emittedByType[t] ?? 0;
      const bio = skin.stats.biologicalRadiusByType[t];
      const ren = skin.stats.renderRadiusByType[t];
      const fmt = (r: typeof bio) => r
        ? `bio[${(r.min * 1000).toFixed(2)}/${(r.median * 1000).toFixed(2)}/${(r.max * 1000).toFixed(2)}mm n=${r.count}]`
        : 'bio=∅';
      const renFmt = ren
        ? `ren[${(ren.min * 1000).toFixed(2)}/${(ren.median * 1000).toFixed(2)}/${(ren.max * 1000).toFixed(2)}mm]`
        : 'ren=∅';
      return `  ${t.padEnd(10)} graph=${String(inGraph).padStart(3)} emitted=${String(emitted).padStart(3)} ${fmt(bio)} ${renFmt}`;
    });
    console.log(`[skinplant] per-edge-type breakdown:\n${typeRows.join('\n')}`);
    if (skin.stats.floatingCandidateCount > 0) {
      console.warn(
        `[skinplant] ⚠ floating candidates=${skin.stats.floatingCandidateCount}: `
        + skin.stats.floatingCandidateIds.slice(0, 8).join(', ')
        + (skin.stats.floatingCandidateIds.length > 8 ? ' …' : ''),
      );
    }
    // Expose for browser-side inspection (dev-only debug — does not affect rendering).
    (window as unknown as { __skinplantStats?: typeof skin.stats }).__skinplantStats = skin.stats;
    if (skin.stats.vertexCount > 0) {
      // Rename the mesh to include the seed for ownership audit prefixes.
      skin.mesh.name = `skinplant_skin_${seed}`;
      skin.mesh.parent = lushGroup;
      skin.mesh.material = skinMat;
      skin.mesh.useVertexColors = true;
      // Phase 5 cut hook — face groups primary, vertex tags debug.
      skin.mesh.metadata = {
        faceGroups: skin.faceGroups,
        edgeIdByIdx: skin.edgeIdByIdx,
        vertexEdgeTag: skin.vertexEdgeTag,
      };
      currentMeshes.push(skin.mesh);
      currentParts.stem = skin.mesh;
    }

    // === Leaf blades — legacy per-leaf createLeafMeshFromNode pattern ===
    //   Iter 17 SSOT #173: replaces single-mesh Leaf Module v0.1
    //   (buildLeafBladeMesh) which locked all leaflet planes to horizontal
    //   via pickInitialBinormal = cross(tangent, up). Per-leaf meshes get
    //   rotated by their own phyllotaxis azimuth + droop, so the canopy is
    //   3D-volumetric and visible from any camera angle.
    const genome = engine.getGenome(seed)!;
    const leafAxes: AxisBase[] = [plantBase.mainAxis, ...plantBase.sideShoots];
    let leafMeshCount = 0;
    for (let axisIdx = 0; axisIdx < leafAxes.length; axisIdx++) {
      const axisBase = leafAxes[axisIdx];
      for (const leafBase of axisBase.leaves) {
        if (!leafBase.visibility.visible) continue;
        const node = state.nodes[leafBase.nodeIdx];
        if (!node || node.leafMaturity < 0.05) continue;
        // Petiole tip = leaf blade attach point (matches SupportingPlant).
        const tip = leafBase.petioleCurve && leafBase.petioleCurve.length > 0
          ? leafBase.petioleCurve[leafBase.petioleCurve.length - 1]
          : leafBase.attachPosition;
        const leafRng = new SeededRandom(seed * 1009 + axisIdx * 9173 + leafBase.nodeIdx * 31 + 11);
        const leafMesh = createLeafMeshFromNode(
          `skinplant_leaf_${seed}_a${axisIdx}_n${leafBase.nodeIdx}`,
          scene, node, genome, state.day, leafRng,
        );
        leafMesh.parent = lushGroup;
        leafMesh.position = new Vector3(tip.x, tip.y, tip.z);
        leafMesh.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), leafBase.azimuthRad)
          .multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), -leafBase.droopRad));
        leafMesh.material = node.yellowing > 0.4 ? yellowLeafMat : leafMat;
        currentMeshes.push(leafMesh);
        currentParts.leaves.push(leafMesh);
        leafMeshCount++;
      }
    }
    console.log(`[skinplant.leaf] per-leaf meshes=${leafMeshCount} (legacy createLeafMeshFromNode)`);
    void cultivarKey;

    // === Truss organs (fruit body / calyx / flower only) — unchanged ===
    const baseAxes: AxisBase[] = [plantBase.mainAxis, ...plantBase.sideShoots];
    for (let axisIdx = 0; axisIdx < baseAxes.length; axisIdx++) {
      const axisBase = baseAxes[axisIdx];
      for (const trussBase of axisBase.trusses) {
        if (!trussBase.visibility.visible) continue;
        if (!trussBase.floralSites) continue;
        const trussRng = new SeededRandom(
          seed * 7919 + axisIdx * 88883 + trussBase.nodeIdx * 31,
        );
        const trussNode = createTrussFruitOrgansOnly(
          `skinplant_truss_${seed}_a${axisIdx}_n${trussBase.nodeIdx}`,
          scene, trussBase, trussRng,
        );
        trussNode.parent = lushGroup;
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
        console.log(
          `[diag:1] skinplant.update(day=${day.toFixed(2)}, physiology=${physiology ? 'yes' : 'no'})`,
        );
      }
      if (!physiology && Math.abs(day - lastBuildDay) < REBUILD_THRESHOLD_DAYS) return;
      lastBuildDay = day;
      let state = engine.computeState(seed, day);
      if (physiology) {
        state = overlayPhysiologyFruits(state, physiology);
      }
      const cultivarName = engine.getCultivarFor(seed)?.name ?? 'tomimaru-muchoo';
      const plantBase = computePlantGeometry(state, {
        genome: engine.getGenome(seed)!,
        cultivar: getCultivar(cultivarName),
        physiologyState: physiology,
      });
      buildFromState(state, plantBase, cultivarName);
      skeleton.update(plantBase);
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
      lushGroup.setEnabled(v);
      if (import.meta.env?.DEV && !v) {
        const PREFIXES = [
          'skinplant_skin_', 'skinplant_fruit_', 'skinplant_truss_',
          'skinplant_leaf_', 'skinplant_cot_',
        ];
        const orphans = scene.meshes.filter(
          (m) => PREFIXES.some((p) => m.name.startsWith(p)) && m.isEnabled(),
        );
        if (orphans.length > 0) {
          console.warn(
            `[skinplant lush ownership] ${orphans.length} mesh(es) still enabled `
            + `after setLushEnabled(false). Names:`,
            orphans.map((m) => m.name).slice(0, 10),
          );
        }
      }
    },
    setSkeletonEnabled(v) {
      if (skeletonOn === v) return;
      skeletonOn = v;
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
      this.setSkeletonEnabled(on);
      this.setLushEnabled(!on);
    },
    setSkeletonConfig(cfg) {
      skeleton.setConfig(cfg);
    },
    currentState: () => lastState,
  };
}
