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
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
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
import { ACTIVE_BOTANICAL } from '@farmsim/tomato-engine/ModelRegistry';
import { DEFAULT_COTYLEDON_SPEC } from '@farmsim/tomato-engine/BotanicalSpec';
import { createSkeletonOverlay, type SkeletonOverlayHandle } from './SkeletonOverlay';
import { createSemanticOverlay, type SemanticOverlayHandle } from './SemanticOverlay';
import { useTwinStore } from '../store/twinStore';
// Iter 20 — petiole-stem junction debug overlay.
import { createPetioleJunctionOverlay, type OverlayOptions } from './dockingOverlay/PetioleJunctionOverlay';
import { buildPetioleJunctionPairs } from './dockingOverlay/dockingPairs';
// SSOT #185/#186 — coordinate transforms + leaf anchor utility.
import {
  toMeshLocal, toWorld, meshLocalToPlantLocal, worldToPlantLocal,
  type MeshLocalV3,
} from '../plant/coordinates';
// Iter 18B PR 9 (SSOT #180) — single Skeleton Engine entry. Direct import
// of buildTomatoSkeletonGraph is no longer allowed from consumers.
import {
  buildPlantSkeleton,
  isLeafOrganVisible,
  isTrussOrganVisible,
  validateSkeleton,
} from '../plant/skeleton/SkeletonEngine';
import { buildPlantSkinMesh } from '../plant/skin/buildPlantSkinMesh';
// Iter 18B PR 13 — Skin Engine façade. Stem family mesh now flows through
// defaultSkinEngine.render(). Leaf/truss/cotyledon loops remain here for
// closure-captured currentMeshes lifecycle (façade boundary partial — see
// SSOT #181 doc).
import { defaultSkinEngine } from '../plant/skin/defaultSkinEngine';
// Iter 17 SSOT #173: legacy per-leaf createLeafMeshFromNode pipeline. Same
// approach SupportingPlant/ShowcasePlant already use successfully — each
// leaf becomes its own Mesh rotated by phyllotaxis azimuth + droop, so the
// canopy has 3D volume from every camera angle. The previous single-mesh
// Leaf Module v0.1 (buildLeafBladeMesh) locked all leaflet planes to
// horizontal via pickInitialBinormal = cross(tangent, world_up), producing
// the "half the canopy disappears at parallel-camera angles" symptom.
// Iter 18B PR 4 — switch to createLeafBladeOnlyMesh. SkinMeshPlant은 SDF
// skeleton mesh가 petiole tube를 그리므로 leaf mesh 안의 중복 petiole
// cylinder는 불필요. ShowcasePlant는 createLeafMeshFromNode 계속 사용 (legacy).
import { createLeafBladeOnlyMesh, getLeafMaterial, getYellowLeafMaterial } from '../plant/LeafGenerator';
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

function applyCotyledonChunk(scene: Scene, name: string, size: number, widthLengthRatio?: number): Mesh {
  const chunk = buildCotyledonChunk({ size, widthLengthRatio });
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
  // Iter 26 PR 4-1 — cached graph for semantic overlay refresh on toggle.
  let lastGraph: import('../plant/skeleton/SkeletonEngine').PlantSkeletonGraph | null = null;
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
  // Iter 26 PR 4-1 (SSOT #187 원칙 2) — graph node visualHint marker overlay.
  // 기본 hidden. 사용자가 콘솔에서 `window.__semanticOverlay.setVisible(true)`로
  // 토글 (Iter 25 visual baseline과 충돌하지 않게 'd' 키와 분리).
  const semantic: SemanticOverlayHandle = createSemanticOverlay(scene, root);
  if (import.meta.env?.DEV) {
    (window as unknown as { __semanticOverlay?: SemanticOverlayHandle }).__semanticOverlay = semantic;
  }
  // Iter 20 — petiole-stem junction overlay (Skin mode instance).
  const dockingOverlay = createPetioleJunctionOverlay(scene, lushGroup);
  let dockingEnabled = false;
  let dockingOpts: OverlayOptions = {
    edgeTypes: ['petiole'],
    focus: 'all',  // stem-side(4) + leaf-side(2) 둘 다 표시
    labelMode: 'all',
    worstN: 5,
  };

  // Leaf wireframe debug mode — leaf mesh를 material 없이 wireframe으로
  // swap해 mesh 자체 모양/크기 시각 확인.
  let leafWireframeEnabled = false;
  let leafWireframeMat: StandardMaterial | null = null;
  function getLeafWireframeMat(): StandardMaterial {
    if (leafWireframeMat) return leafWireframeMat;
    const m = new StandardMaterial('skinplant_leaf_wireframe', scene);
    m.diffuseColor = new Color3(0.0, 0.95, 0.5);   // 형광 녹색
    m.emissiveColor = new Color3(0.0, 0.95, 0.5);
    m.disableLighting = true;
    m.wireframe = true;
    m.backFaceCulling = false;
    leafWireframeMat = m;
    return m;
  }
  function applyLeafWireframe(): void {
    for (const leaf of currentParts.leaves) {
      if (leafWireframeEnabled) {
        leaf.material = getLeafWireframeMat();
      } else {
        // restore: yellowing > 0.4 → yellowLeafMat, else leafMat (build flow와 동일)
        const mm = leaf.name.match(/_a(\d+)_n(\d+)$/);
        const ni = mm ? parseInt(mm[2], 10) : -1;
        const node = ni >= 0 && lastState ? lastState.nodes[ni] : null;
        leaf.material = node && node.yellowing > 0.4 ? yellowLeafMat : leafMat;
      }
    }
  }

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
      // Iter 29 Phase 2 — hardcoded 0.03 → BotanicalSpec.cotyledon.maxHalfLengthM.
      // 이전: max 6cm (Heuvelink 0.5-2cm 표준의 3-12배). default 0.008 (1.6cm full).
      const cotyledonSpec = ACTIVE_BOTANICAL.tomato?.cotyledon ?? DEFAULT_COTYLEDON_SPEC;
      const cotSize = cotyledonSpec.maxHalfLengthM * state.cotyledonSize;
      const cotY = state.nodes.length > 0
        ? (state.nodes[0].heightCm / 100) * 0.3
        : 0.03;
      for (const side of [-1, 1] as const) {
        const cot = applyCotyledonChunk(
          scene,
          `skinplant_cot_${seed}_${side}`,
          cotSize,
          cotyledonSpec.widthLengthRatio,
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
    // Iter 26 PR 2-2 — pass state + genome so populateAnchorMorphology can
    // fill organAnchor.morphology/state and graph.cultivarGenomeSnapshot.
    // Skin reads these (PR 3-1/3-2) instead of PlantBase/PlantState directly.
    const skeletonGenome = engine.getGenome(seed) ?? undefined;
    const graph = buildPlantSkeleton(plantBase, {
      curveDivisions: 2,
      state,
      genome: skeletonGenome,
    });
    lastGraph = graph;
    // Iter 18B PR 13 — stem family mesh via SkinEngine façade.
    // Iter 26 PR 5-1 (SSOT #187 원칙 4) — SkinEngine은 graph + scene + parent만
    // 받음. PlantBase/PlantState/cultivar는 모두 populator에서만 사용되어
    // graph에 흡수됨 (state → organAnchor.state, genome → cultivarGenomeSnapshot).
    void engine; void cultivarKey; void state; void plantBase; // (parameters still accepted by buildFromState for legacy callers)
    const engineResult = defaultSkinEngine.render(graph, {
      seed,
      scene, parent: lushGroup,
      // Iter 21 — rootRadiusScale 1.15 → 1.30. petiole 첫 ring을 더 굵게 하여
      // stem-petiole junction에 자연 collar 효과 강화 (visual emerge 완화).
      stemOpts: { radialSegments: 8, rootRadiusScale: 1.30, parentSwellingScale: 1.25 },
    });
    // Compatibility shim — preserve the existing `skin.faceGroups` shape so
    // the metadata block below doesn't need rewriting. defaultSkinEngine
    // already parented the mesh to opts.parent (lushGroup).
    const skin = {
      mesh: engineResult.stemMesh,
      stats: engineResult.stats,
      faceGroups: engineResult.stemFaceGroups,
      edgeIdByIdx: engineResult.stemEdgeIdByIdx,
      vertexEdgeTag: engineResult.stemVertexEdgeTag,
    };

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
    // Iter 18B PR 11 — extend __skinplantStats with skeleton validation + organ
    // anchor summary so the fidelity-assert harness can read everything from
    // one place. Backward-compatible: existing fields are untouched.
    const validation = validateSkeleton(graph);
    const extendedStats = {
      ...skin.stats,
      validation: {
        ok: validation.ok,
        errorCount: validation.findings.filter((f) => f.severity === 'error').length,
        warningCount: validation.findings.filter((f) => f.severity === 'warning').length,
        organAnchorCount: validation.summary.organAnchorCount,
        edgeCount: validation.summary.edgeCount,
        nodeCount: validation.summary.nodeCount,
        findings: validation.findings.slice(0, 20),  // cap for log size
      },
    };
    (window as unknown as { __skinplantStats?: typeof extendedStats }).__skinplantStats = extendedStats;
    // Iter 18B PR 14 — expose live graph for position-assert harness.
    // Maps are not JSON-serializable, but page.evaluate can iterate them.
    (window as unknown as { __skinplantGraph?: typeof graph }).__skinplantGraph = graph;
    // Iter 18A Phase 1.2 — view toggle (dev-only). Hides organ categories so
    // the user can isolate stem family / truss / leaf during fidelity audit.
    // Usage in devtools: window.__skinplantView('stem' | 'truss' | 'leaf' | 'full').
    (window as unknown as { __skinplantView?: (mode: 'stem' | 'truss' | 'leaf' | 'full') => void })
      .__skinplantView = (mode) => {
        const stemOn = mode === 'stem' || mode === 'full';
        const truOn = mode === 'truss' || mode === 'full';
        const leafOn = mode === 'leaf' || mode === 'full';
        if (currentParts.stem) currentParts.stem.setEnabled(stemOn);
        for (const m of currentParts.cotyledons) m.setEnabled(leafOn);
        for (const m of currentParts.leaves) m.setEnabled(leafOn);
        for (const m of currentParts.fruits) m.setEnabled(truOn);
        // Truss organs live under transform nodes; toggle the whole node.
        for (const n of currentTransformNodes) n.setEnabled(truOn);
        console.log(`[skinplant.view] mode=${mode} stem=${stemOn} leaf=${leafOn} truss=${truOn}`);
      };

    // Iter 18C — Petiole docking debug overlay (replaces earlier stub).
    // Usage: window.__skinplantPetioleDock({ enable, worstN, metric }).
    //
    // 6 coords per petiole edge (sphere 색상):
    //   BLACK   stemNodeWorld             = graph.nodes[startNodeId].pos
    //   ORANGE  plantBasePetioleRootWorld = leaf.petioleCurve[0]
    //   RED     graphPetioleRootWorld     = edge.bonePath[0].p0
    //   BLUE    renderedPetioleRootWorld  = stats.renderedRootByEdgeId[edge.id]
    //   CYAN    petioleTipWorld           = graph.nodes[endNodeId].pos
    //   YELLOW  leafBaseWorld             = leafMesh.position
    //
    // 4 connection lines (yellow color = warn if delta > 1mm):
    //   BLACK → RED   (= stem radius 기대값)
    //   ORANGE → RED  (= PlantBase ↔ Graph, 0 기대 / Case A)
    //   RED → BLUE    (= Graph ↔ Rendered, embed depth만큼 기대 / Case B/D)
    //   CYAN → YELLOW (= Petiole tip ↔ Leaf base, 0 기대 / Case C)
    //
    // 4 deltas (mm) per petiole exposed via __skinplantStats.dockingDiag.
    // Iter 18C — Petiole docking debug overlay. Owns its own dispose list
    // (rebuilds on every plant update; toggle re-enables after rebuild via
    // last-call replay).
    type DockingMesh = import('@babylonjs/core/Meshes/mesh').Mesh;
    let dockingMarkers: DockingMesh[] = [];
    const disposeDocking = () => {
      for (const m of dockingMarkers) m.dispose();
      dockingMarkers = [];
    };
    const mkSphere = (
      name: string, pos: { x: number; y: number; z: number }, color: Color3, diameter: number,
    ): DockingMesh => {
      const s = MeshBuilder.CreateSphere(name, { diameter, segments: 6 }, scene);
      s.parent = lushGroup;
      s.position = new Vector3(pos.x, pos.y, pos.z);
      const mat = new StandardMaterial(`${name}_mat`, scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color;
      mat.disableLighting = true;
      s.material = mat;
      s.isPickable = false;
      s.renderingGroupId = 3;
      dockingMarkers.push(s);
      return s;
    };
    const mkLine = (
      name: string,
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
      color: Color3,
    ): DockingMesh => {
      const line = MeshBuilder.CreateLines(name, {
        points: [new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z)],
      }, scene);
      line.parent = lushGroup;
      line.color = color;
      line.isPickable = false;
      line.renderingGroupId = 3;
      dockingMarkers.push(line);
      return line;
    };

    // 6-color palette (per plan)
    const C_BLACK  = new Color3(0.05, 0.05, 0.05);
    const C_ORANGE = new Color3(1.00, 0.55, 0.00);
    const C_RED    = new Color3(1.00, 0.10, 0.10);
    const C_BLUE   = new Color3(0.10, 0.45, 1.00);
    const C_CYAN   = new Color3(0.10, 0.95, 0.95);
    const C_YELLOW = new Color3(1.00, 0.95, 0.10);
    const C_WARN   = new Color3(1.00, 0.85, 0.20);

    interface DockingPerPetiole {
      edgeId: string;
      nodeIdx: number;
      stemNode: { x: number; y: number; z: number };
      plantBaseRoot: { x: number; y: number; z: number };
      graphRoot: { x: number; y: number; z: number };
      renderedRoot: { x: number; y: number; z: number } | null;
      tip: { x: number; y: number; z: number };
      leafBase: { x: number; y: number; z: number } | null;
      plantBaseGraphDelta_mm: number;
      graphRenderedDelta_mm: number | null;
      tipDelta_mm: number | null;
      centerToSurfaceDelta_mm: number;
      severity: 'green' | 'yellow' | 'red';
    }
    const d3 = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
    ): number => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
    const dMm = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
      d3(a, b) * 1000;
    const sev = (worst_mm: number): 'green' | 'yellow' | 'red' =>
      worst_mm <= 1 ? 'green' : worst_mm <= 3 ? 'yellow' : 'red';

    const buildDockingDiag = (): DockingPerPetiole[] => {
      const allAxes = [plantBase.mainAxis, ...plantBase.sideShoots];
      // Build axis-nodeIdx → leafBase lookup from PlantBase.
      const plantBaseByKey = new Map<string, { petioleCurve: { x: number; y: number; z: number }[] }>();
      allAxes.forEach((ax, axIdx) => {
        for (const leaf of ax.leaves) {
          plantBaseByKey.set(`a${axIdx}_n${leaf.nodeIdx}`, leaf as { petioleCurve: { x: number; y: number; z: number }[] });
        }
      });
      // Build leaf-mesh-by-key lookup.
      const leafMeshByKey = new Map<string, DockingMesh>();
      for (const m of currentParts.leaves) {
        const match = m.name.match(/_a(\d+)_n(\d+)$/);
        if (!match) continue;
        leafMeshByKey.set(`a${match[1]}_n${match[2]}`, m as DockingMesh);
      }
      const rendered = skin.stats.renderedRootByEdgeId ?? {};
      const out: DockingPerPetiole[] = [];
      for (const [edgeId, edge] of graph.edges) {
        if (edge.type !== 'petiole') continue;
        const match = edgeId.match(/^e:petiole:axis(\d+):n(\d+)$/);
        if (!match) continue;
        const axIdx = match[1];
        const nIdx = parseInt(match[2], 10);
        const key = `a${axIdx}_n${nIdx}`;
        const startNode = graph.nodes.get(edge.startNodeId);
        const endNode = graph.nodes.get(edge.endNodeId);
        const pb = plantBaseByKey.get(key);
        if (!startNode || !endNode || !edge.bonePath[0]) continue;
        const stemNode = startNode.pos;
        const plantBaseRoot = pb?.petioleCurve[0] ?? edge.bonePath[0].p0;
        const graphRoot = edge.bonePath[0].p0;
        const renderedRoot = rendered[edgeId] ?? null;
        const tip = endNode.pos;
        const leafMesh = leafMeshByKey.get(key);
        const leafBase = leafMesh ? { x: leafMesh.position.x, y: leafMesh.position.y, z: leafMesh.position.z } : null;
        const plantBaseGraphDelta_mm = dMm(plantBaseRoot, graphRoot);
        const graphRenderedDelta_mm = renderedRoot ? dMm(graphRoot, renderedRoot) : null;
        const tipDelta_mm = leafBase ? dMm(tip, leafBase) : null;
        const centerToSurfaceDelta_mm = dMm(stemNode, graphRoot);
        const worst = Math.max(
          plantBaseGraphDelta_mm,
          graphRenderedDelta_mm ?? 0,
          tipDelta_mm ?? 0,
        );
        out.push({
          edgeId, nodeIdx: nIdx,
          stemNode, plantBaseRoot, graphRoot, renderedRoot, tip, leafBase,
          plantBaseGraphDelta_mm, graphRenderedDelta_mm, tipDelta_mm, centerToSurfaceDelta_mm,
          severity: sev(worst),
        });
      }
      return out;
    };

    // Iter 20 — new unified docking overlay API (petiole-stem junction).
    // Replaces / supplements __skinplantPetioleDock (kept for backward compat).
    (window as unknown as { __dockingOverlay?: (opts: {
      enable: boolean;
      edgeTypes?: string[];
      focus?: 'stem-junction' | 'all';
      labelMode?: 'all' | 'worst' | 'none';
      worstN?: number;
    }) => void }).__dockingOverlay = (opts) => {
      dockingEnabled = opts.enable;
      const merged: OverlayOptions = { ...dockingOpts };
      if (opts.edgeTypes != null) merged.edgeTypes = opts.edgeTypes;
      if (opts.focus != null) merged.focus = opts.focus;
      if (opts.labelMode != null) merged.labelMode = opts.labelMode;
      if (opts.worstN != null) merged.worstN = opts.worstN;
      dockingOpts = merged;
      dockingOverlay.setOptions(merged);
      dockingOverlay.setVisible(opts.enable);
      // Iter 20 PR 5 — expose flag so BabylonEngine can enable conditional
      // shadow-build of skinMeshPlant when overlay is on in Skeleton mode.
      (window as unknown as { __dockingOverlayEnabled?: boolean }).__dockingOverlayEnabled = opts.enable;
      console.log(`[dockingOverlay] enable=${opts.enable} edgeTypes=${merged.edgeTypes?.join(',')} focus=${merged.focus} labelMode=${merged.labelMode}`);
    };

    // Leaf wireframe debug API — material 없이 mesh 자체 (vertex/edge)만 표시.
    (window as unknown as { __leafWireframe?: (enable: boolean) => void })
      .__leafWireframe = (enable) => {
      leafWireframeEnabled = enable;
      applyLeafWireframe();
      console.log(`[leafWireframe] ${enable ? 'ON' : 'OFF'} — ${currentParts.leaves.length} leaves`);
    };

    (window as unknown as { __skinplantPetioleDock?: (opts: {
      enable: boolean;
      worstN?: number;
      metric?: 'plantBaseGraphDelta' | 'graphRenderedDelta' | 'tipDelta';
    }) => void }).__skinplantPetioleDock = (opts) => {
      disposeDocking();
      const diag = buildDockingDiag();
      // Always publish JSON, even when not visualizing.
      const centerToSurfaceList = diag.map(d => d.centerToSurfaceDelta_mm).sort((a,b)=>a-b);
      const median = centerToSurfaceList.length === 0 ? 0
        : centerToSurfaceList[Math.floor(centerToSurfaceList.length / 2)];
      const summary = {
        totalCount: diag.length,
        worstPlantBaseGraphDelta_mm: Math.max(0, ...diag.map(d => d.plantBaseGraphDelta_mm)),
        worstGraphRenderedDelta_mm: Math.max(0, ...diag.map(d => d.graphRenderedDelta_mm ?? 0)),
        worstTipDelta_mm: Math.max(0, ...diag.map(d => d.tipDelta_mm ?? 0)),
        expectedCenterToSurfaceMedian_mm: median,
      };
      (window as unknown as { __skinplantStats?: Record<string, unknown> }).__skinplantStats!.dockingDiag = {
        perPetiole: diag, summary,
      };
      if (!opts.enable) {
        console.log('[skinplant.petioleDock] OFF — JSON published only');
        return;
      }
      // Decide which subset to render.
      const metric = opts.metric ?? 'tipDelta';
      const metricGet = (d: DockingPerPetiole): number => {
        switch (metric) {
          case 'plantBaseGraphDelta': return d.plantBaseGraphDelta_mm;
          case 'graphRenderedDelta':  return d.graphRenderedDelta_mm ?? 0;
          case 'tipDelta':            return d.tipDelta_mm ?? 0;
        }
      };
      const sorted = [...diag].sort((a, b) => metricGet(b) - metricGet(a));
      const worstN = opts.worstN ?? 5;
      const subset = worstN > 0 ? sorted.slice(0, worstN) : sorted;
      for (const d of subset) {
        mkSphere(`dock_stem_${d.edgeId}`, d.stemNode, C_BLACK, 0.006);
        mkSphere(`dock_pb_${d.edgeId}`, d.plantBaseRoot, C_ORANGE, 0.006);
        mkSphere(`dock_gr_${d.edgeId}`, d.graphRoot, C_RED, 0.006);
        if (d.renderedRoot) mkSphere(`dock_rd_${d.edgeId}`, d.renderedRoot, C_BLUE, 0.006);
        mkSphere(`dock_tip_${d.edgeId}`, d.tip, C_CYAN, 0.006);
        if (d.leafBase) mkSphere(`dock_lb_${d.edgeId}`, d.leafBase, C_YELLOW, 0.006);
        // Lines
        mkLine(`dock_l_center_${d.edgeId}`, d.stemNode, d.graphRoot, C_RED);
        mkLine(`dock_l_pb_${d.edgeId}`, d.plantBaseRoot, d.graphRoot,
          d.plantBaseGraphDelta_mm > 1 ? C_WARN : C_ORANGE);
        if (d.renderedRoot) mkLine(`dock_l_rd_${d.edgeId}`, d.graphRoot, d.renderedRoot,
          (d.graphRenderedDelta_mm ?? 0) > 1 ? C_WARN : C_BLUE);
        if (d.leafBase) mkLine(`dock_l_tip_${d.edgeId}`, d.tip, d.leafBase,
          (d.tipDelta_mm ?? 0) > 1 ? C_WARN : C_YELLOW);
        // Console label
        console.log(
          `[dock ${d.edgeId.replace('e:petiole:', '')}] `
          + `pb→gr=${d.plantBaseGraphDelta_mm.toFixed(2)}mm  `
          + `gr→rd=${(d.graphRenderedDelta_mm ?? -1).toFixed(2)}mm  `
          + `tip→leaf=${(d.tipDelta_mm ?? -1).toFixed(2)}mm  `
          + `(center→surface=${d.centerToSurfaceDelta_mm.toFixed(2)}mm)  `
          + `severity=${d.severity}`,
        );
      }
      console.log(
        `[skinplant.petioleDock] ON — ${subset.length}/${diag.length} petioles. `
        + `worstPB→GR=${summary.worstPlantBaseGraphDelta_mm.toFixed(2)}mm  `
        + `worstGR→RD=${summary.worstGraphRenderedDelta_mm.toFixed(2)}mm  `
        + `worstTip→Leaf=${summary.worstTipDelta_mm.toFixed(2)}mm  `
        + `medianCenter→Surface=${summary.expectedCenterToSurfaceMedian_mm.toFixed(2)}mm`,
      );
    };
    if (skin.stats.vertexCount > 0 && skin.mesh) {
      // Rename the mesh to include the seed for ownership audit prefixes.
      // (parent already set to lushGroup by defaultSkinEngine.render.)
      skin.mesh.name = `skinplant_skin_${seed}`;
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

    // === Leaf blades — Iter 26 PR 3-1 (SSOT #187 원칙 4 partial) ===
    //   Iter 17 SSOT #173 baseline: per-leaf mesh + phyllotaxis rotation.
    //   Iter 26 PR 3-1: enter via graph.organAnchors. Mesh position comes
    //   from graph (anchor node.pos == petioleCurve tip per INV-04).
    //   Yellowing material from anchor.state. Shape params (genome, leafBase
    //   azimuth/droop, NodeState morphology) still read from PlantBase /
    //   PlantState — full graph-only is PR 5-1.
    const genome = engine.getGenome(seed)!;
    const leafAxes: AxisBase[] = [plantBase.mainAxis, ...plantBase.sideShoots];
    let leafMeshCount = 0;
    for (const edge of graph.edges.values()) {
      if (!edge.organAnchors) continue;
      for (const anchor of edge.organAnchors) {
        if (anchor.kind !== 'leaf_blade') continue;
        const m = anchor.id.match(/^leaf_blade:axis(\d+):n(\d+)$/);
        if (!m) continue;
        const axisIdx = Number(m[1]);
        const nodeIdx = Number(m[2]);
        const axisBase = leafAxes[axisIdx];
        if (!axisBase) continue;
        const leafBase = axisBase.leaves.find((l) => l.nodeIdx === nodeIdx);
        if (!leafBase || !isLeafOrganVisible(leafBase)) continue;
        const node = state.nodes[nodeIdx];
        if (!node) continue;
        // SSOT #186 — Leaf anchor contract (docs/architecture/MESH_ANCHORS.md):
        // LeafGenerator normalizeLeafMeshVertices가 mesh-local origin을 첫
        // leaflet stem-side vertex로 정렬. mesh.position = petiole tip 설정 시
        // leaflets가 정확히 SDF petiole tip부터 emerge. 좌표계: plant-local.
        // Iter 27 — mesh.position은 anchor.meshAnchorNodeId (petiole tip) 사용.
        // anchor.anchorNodeId는 joint (stem attach node) — attachment line
        // alarm reference, mesh 위치와 무관.
        const meshNodeId = anchor.meshAnchorNodeId ?? anchor.anchorNodeId;
        const meshAnchorNode = graph.nodes.get(meshNodeId);
        if (!meshAnchorNode) continue;
        const tipPlantPos = meshAnchorNode.pos;
        const leafRng = new SeededRandom(seed * 1009 + axisIdx * 9173 + nodeIdx * 31 + 11);
        const leafMesh = createLeafBladeOnlyMesh(
          `skinplant_leaf_${seed}_a${axisIdx}_n${nodeIdx}`,
          scene, node, genome, state.day, leafRng,
        );
        leafMesh.parent = lushGroup;
        leafMesh.position = new Vector3(tipPlantPos.x, tipPlantPos.y, tipPlantPos.z);
        leafMesh.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), leafBase.azimuthRad)
          .multiply(Quaternion.RotationAxis(new Vector3(0, 0, 1), -leafBase.droopRad));
        // Iter 26 PR 3-1 — material yellowing from anchor.state (was node.yellowing).
        // Same numerical source (populator copied PlantState.yellowing into anchor.state).
        const yellowing = anchor.state?.yellowing ?? node.yellowing;
        leafMesh.material = yellowing > 0.4 ? yellowLeafMat : leafMat;
        currentMeshes.push(leafMesh);
        currentParts.leaves.push(leafMesh);
        leafMeshCount++;
      }
    }
    console.log(`[skinplant.leaf] per-leaf meshes=${leafMeshCount} (PR 3-1 graph-anchor entry)`);
    void cultivarKey;

    // === Truss organs — Iter 26 PR 3-2 (SSOT #187 원칙 4 partial) ===
    //   Entry via graph.edges (type === 'peduncle'); each peduncle's id
    //   parses to axisIdx/trussIdx. trussBase (fruit/flower/calyx organ
    //   state) still read from PlantBase — PR 5-1 strict cut.
    const baseAxes: AxisBase[] = [plantBase.mainAxis, ...plantBase.sideShoots];
    const seenTrussKeys = new Set<string>();
    for (const edge of graph.edges.values()) {
      if (edge.type !== 'peduncle') continue;
      const m = edge.id.match(/^e:peduncle:axis(\d+):t(\d+)$/);
      if (!m) continue;
      const axisIdx = Number(m[1]);
      const trussIdx = Number(m[2]);
      const key = `${axisIdx}:${trussIdx}`;
      if (seenTrussKeys.has(key)) continue;
      seenTrussKeys.add(key);
      const axisBase = baseAxes[axisIdx];
      if (!axisBase) continue;
      const trussBase = axisBase.trusses[trussIdx];
      // Iter 18A SSOT #176 predicate parity preserved.
      if (!trussBase || !isTrussOrganVisible(trussBase)) continue;
      const trussRng = new SeededRandom(
        seed * 7919 + axisIdx * 88883 + trussBase.nodeIdx * 31,
      );
      const trussNode = createTrussFruitOrgansOnly(
        `skinplant_truss_${seed}_a${axisIdx}_n${trussBase.nodeIdx}`,
        scene, trussBase, trussRng,
      );
      trussNode.parent = lushGroup;
      trussNode.getChildMeshes().forEach((cm) => {
        if (cm.name.includes('_body')) {
          currentParts.fruits.push(cm as Mesh);
        }
      });
      currentTransformNodes.push(trussNode);
    }

    applySegmentationHighlights();
    applyLeafWireframe();  // 매 rebuild 후 wireframe 토글 상태 재적용

    // SSOT #185/#186 — populate petiole-stem junction overlay every rebuild.
    // actualLeafMeshStart = leaf의 첫 leaflet stem-side vertex (mesh-local x_min)
    // → world → plant-local 변환. 좌표 변환은 coordinates/transforms utility 사용.
    // 참조: docs/architecture/{COORDINATE_SYSTEMS, MESH_ANCHORS}.md
    const lushWorldMatInv = lushGroup.getWorldMatrix().clone().invert();
    const leafMeshByKey = new Map<string, {
      position: { x: number; y: number; z: number };
      bboxMinLocal: { x: number; y: number; z: number };
      bboxMaxLocal: { x: number; y: number; z: number };
    }>();
    for (const m of currentParts.leaves) {
      const mm = m.name.match(/_a(\d+)_n(\d+)$/);
      if (!mm) continue;
      // Iter 28 — leaf mesh가 이 build에서 막 생성됨. position +
      // rotationQuaternion 설정 직후라 worldMatrix가 _stale_ (Babylon은 next
      // frame까지 자동 update 안 함). computeWorldMatrix(true)로 즉시
      // 강제 update — 안 하면 mesh-local→world 변환이 identity matrix를
      // 적용해 (0,0,0)을 반환, 그 결과 plant-local 변환이 -lushGroup 위치
      // (= -1.062 m)로 어긋남. SSOT #185 위반 alarm (dock_l_leafstart).
      m.computeWorldMatrix(true);
      // 첫 leaflet stem-side vertex = mesh-local x_min인 actual vertex.
      let anchorMeshLocal: MeshLocalV3 = toMeshLocal({ x: 0, y: 0, z: 0 });
      const verts = m.getVerticesData('position');
      if (verts && verts.length >= 3) {
        let minLx = Infinity;
        let minLy = 0, minLz = 0;
        for (let i = 0; i < verts.length; i += 3) {
          if (verts[i] < minLx) {
            minLx = verts[i];
            minLy = verts[i + 1];
            minLz = verts[i + 2];
          }
        }
        anchorMeshLocal = toMeshLocal({ x: minLx, y: minLy, z: minLz });
      }
      // mesh-local → plant-local (rotation + parent transform 적용).
      const anchorPlantPos = verts && verts.length >= 3
        ? meshLocalToPlantLocal(anchorMeshLocal, m.getWorldMatrix(), lushWorldMatInv)
        : worldToPlantLocal(toWorld(m.absolutePosition), lushWorldMatInv);
      leafMeshByKey.set(`a${mm[1]}_n${mm[2]}`, {
        position: { x: m.position.x, y: m.position.y, z: m.position.z },
        bboxMinLocal: { x: anchorPlantPos.x, y: anchorPlantPos.y, z: anchorPlantPos.z },
        bboxMaxLocal: { x: anchorPlantPos.x, y: anchorPlantPos.y, z: anchorPlantPos.z },
      });
    }
    const junctionPairs = buildPetioleJunctionPairs({
      graph,
      renderedRootByEdgeId: skin.stats.renderedRootByEdgeId,
      parentContextByEdgeId: skin.stats.parentContextByEdgeId,
      leafMeshByKey,
    });
    dockingOverlay.setData(junctionPairs);
    // Publish for capture spec / diagnosis report.
    (window as unknown as { __dockingJunctionPairs?: unknown }).__dockingJunctionPairs = junctionPairs;
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
      // Iter 26 PR 4-fix — SemanticOverlay는 기본 hidden (Iter 25 visual baseline 보호).
      // 마커는 매 build 후 갱신되지만 보이려면 사용자가 명시 토글 ('g' 키 또는
      // window.__semanticOverlay.setVisible(true)).
      if (lastGraph) semantic.update(lastGraph);
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
        if (lastGraph) semantic.update(lastGraph);
      }
      skeleton.setVisible(v);
      // Iter 26 PR 4-fix — SemanticOverlay는 'd' 키와 분리. 기본 hidden 유지.
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
