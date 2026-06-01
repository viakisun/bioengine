// PlantSkeletonGraph — SSOT Phase 3: directed graph of plant skeleton.
//
// PlantBase carries organ centerline data per organ type. This module
// promotes that data to a formal node+edge graph so:
//   - PlantSkinMeshBuilder can iterate all stem-like edges as a single
//     bone list (input to SDF + marching cubes).
//   - Phase 5 cut/detach can identify which edge was cut and what
//     subtree falls (via parentEdgeId chain + attachedOrganIds).
//   - Phase 8 dataset export can label each vertex by semanticLabel.
//
// SSOT 4.4 — Skeleton is not a debug overlay. It is the real botanical
// centerline. Both SkeletonOverlay (wire) and PlantSkinMesh (surface)
// consume the same graph.
//
// Crop-agnostic types. Crop-specific builders (e.g. buildTomatoSkeletonGraph)
// live in adjacent files.

import type { V3 } from '../sdf/CapsuleSDF';
import type { PlantLocalV3 } from '../coordinates/types';
import type { PlantGenome } from '@farmsim/tomato-engine/PlantGenome';
import type { CultivarSample } from '@farmsim/tomato-engine/Cultivar';

/**
 * Botanical edge type. SSOT 4.4 enum. Extends naturally as new crops
 * arrive (tendril / runner / fruitPeduncle for cucumber/paprika).
 */
export type SkeletonEdgeType =
  | 'mainStem'
  | 'sideShoot'
  | 'petiole'
  | 'peduncle'
  | 'rachis'         // truss 엽축 (peduncle 끝 → knuckle chain)
  | 'pedicel'
  // Iter 36 v5 Phase J — compound leaf 계층 구조.
  //   사용자 botanical 계층: petiole → leaf-rachis → petiolule → leaflet
  //   "소엽은 다시 짧은 소엽자루로 엽축에 붙고" (사용자 인용).
  | 'leaf-rachis'    // 잎중앙축 (leaf-blade-root → rachis-tip 가상 노드)
  | 'petiolule'      // 소엽자루 (rachis 위 점 → primary leaflet)
  // Iter 36 v5 Phase N (★ NEW) — Bipinnate vein hierarchy (Option D).
  //   사용자 ASCII: "소엽 → 소엽2" — primary leaflet 안에 secondary leaflet 분기.
  //   토마토 잎은 일부 bipinnate (이중복엽) — 큰 소엽이 다시 작은 소엽으로 분기.
  | 'lateral-vein'   // 옆맥 — primary leaflet의 stalk (rachis 위 → primary)
  | 'sub-vein';      // 잔맥 — primary leaflet → secondary leaflet (NEW)

/**
 * Iter 26 PR 1-1 (SSOT #187) — Botanical role of a skeleton node.
 *
 * Distinguishes "where on the plant" a node sits, independent of which edges
 * happen to meet at it. Used by:
 *   - SkinEngine to pick mesh anchor (leaf-blade-root attaches LeafBladeOnly mesh).
 *   - SkeletonOverlay marker styling (via node.visualHint).
 *   - AcceptanceProbe to spot-check expected topology.
 *
 * Crop-agnostic. Tomato populator emits the values below; other crops may
 * extend the union when added.
 */
export type SkeletonNodeType =
  | 'main-stem-node'
  | 'side-shoot-node'
  | 'petiole-root'
  | 'petiole-tip'
  | 'leaf-blade-root'
  | 'truss-root'
  | 'peduncle-node'
  | 'rachis-node'
  | 'pedicel-root'
  | 'pedicel-tip'
  | 'fruit-root'
  | 'flower-root'
  | 'calyx-root'
  // Iter 36 v5 Phase B (★ NEW) — compound leaf morphology + axillary bud.
  | 'leaflet-node'           // per-leaflet position (terminal/primary/secondary/intercalary)
  | 'bud-node'               // axillary bud (dormant/activated/growing)
  // Iter 36 v5 Phase M (★ NEW) — 발아 + 생장점 botanical 구조.
  | 'cotyledon-node'         // 떡잎 — 발아 시 처음 나오는 2개 잎 (left/right)
  | 'apex-node'              // 생장점 (apical meristem) — 새 잎이 emerge하는 mainStem top
  // Iter 36 v5 Phase O (★ NEW) — rachis 위 leaflet 부착점.
  //   사용자 의도: 잎줄기에 _여러 마디_가 있고 각 마디에서 좌우 소엽 분기.
  //   현재 lateral-vein/petiolule이 _terminal node 하나_에서 시작 (별모양) → 분산.
  | 'rachis-attach-node'    // rachis 위 부착점 (rachisU 0.18, 0.35, 0.55, ...)
  // Iter 37 Q3.1 (★ NEW) — Stage 1 primordium marker.
  //   사용자 botanical: "줄기 옆 작은 초록 돌기, 가느다란 순". leafMaturity < 0.05.
  | 'primordium-node';      // Stage 1 잎 — 작은 light green sphere (잎자루 시작부)

/**
 * Iter 36 v5 Phase B — Compound leaf leaflet position type.
 *
 * Botanical reference (사용자 제공):
 *   - terminal: 잎 끝 큰 소엽 (1개)
 *   - primary: 좌우 큰 소엽 (1-4 pairs)
 *   - secondary: primary 근처 작은 소엽 (0-8)
 *   - intercalary: 큰 소엽 사이 작은 소엽 (0-10)
 */
export type LeafletPosition = 'terminal' | 'primary' | 'secondary' | 'intercalary';

/**
 * Iter 36 v5 Phase B — Per-leaflet node data (skeleton).
 *
 * Conservative 분리 (사용자 결정): _구조 데이터만_. shapeProfile / serration /
 * lobeNoise / asymmetry / wrinkle / poseVariation은 _rendering engine 내부_
 * procedural (src/scene/leaf-engine/).
 */
export interface LeafletNodeRef {
  /** parent leaf-blade-root node ID (skeleton 자기 참조). */
  parentLeafNodeId: string;
  /** 4 botanical position types. */
  position: LeafletPosition;
  /** 엽축(rachis)상 0-1 normalized 위치 (root=0, tip=1). */
  rachisU: number;
  /** terminal 대비 크기 비율 (botanical 표 §3). */
  sizeFactor: number;
  /** resolved target size (m). */
  targetSizeM: number;
}

/**
 * Iter 36 v5 Phase B — Leaf blade metadata (skeleton leaf-blade-root에 부착).
 *
 * 잎 전체 procedural variation의 baseline. Rendering engine이 이 값들을 read
 * 하고 internally procedural noise를 적용해 mesh variation 생성.
 *
 * 사용자 botanical reference §7 (age presets) + §8 (correlation rules).
 */
export interface LeafBladeRef {
  /** 잎 전체 길이 (m). 0.02-0.30 range (young 2cm → complex 30cm). */
  leafLengthM: number;
  /** petiole 길이 비율 (0.20-0.38). */
  petioleRatioM: number;
  /** rachis 길이 (m). = leafLength × 0.60-0.80. */
  rachisLengthM: number;
  /** 큰 좌우 소엽 pairs (1-4). */
  primaryPairs: number;
  /** 큰 소엽 사이 작은 소엽 수 (0-10). */
  intercalaryCount: number;
  /** primary 근처 작은 소엽 수 (0-8). */
  secondaryCount: number;
  /** rachis bend 진폭 (leafLength 대비 0-0.12). */
  rachisBendAmp: number;
  /** Age preset — 5종 (사용자 botanical §7). */
  agePreset: 'young' | 'mature' | 'old' | 'complex' | 'potato-leaf';
  /** 0-1 correlation seed (사용자 §8). leafletCount + serration + asymmetry 묶음 산식. */
  complexity: number;
  /** 잎 전체 droop 각도 (deg). 어린 잎 음수 (위로), 오래된 잎 양수 (아래로). */
  droopDeg: number;
  /** 엽축 전체 비틀림 각도 (deg, -15~15). */
  twistDeg: number;
}

/**
 * Iter 36 v5 Phase B — Axillary bud node data (skeleton).
 *
 * 곁순 = 잎겨드랑이에서 나오는 새 순. activated 시 side-shoot edge로 _link_
 * (bud node _유지_ — lineage 추적, 사용자 v4 결정).
 *
 * dormant + activated 모두 skeleton overlay에 visible (작은 marker).
 * 실제 mesh는 side-shoot axis만 (현재 동작 보존).
 */
export interface BudNodeRef {
  /** parent main-stem-node ID. */
  parentNodeId: string;
  /** Botanical state (BudState from @farmsim/tomato-engine — string union). */
  state: string;
  /** activated 시 side-shoot edge ID로 link. dormant 시 undefined. */
  activatedAxisId?: string;
}

/**
 * Iter 26 PR 1-1 — Local orthonormal frame at a node (plant-local coords).
 *
 * - `tangent`: along the parent edge's growth direction at this node.
 * - `normal`: surface outward (away from parent stem axis); used by Skin to
 *   align child organ mesh (petiole growth direction, leaf blade face, etc.).
 *
 * Both unit-length in plant-local frame (SSOT #185). Populated in PR 2-1.
 */
export interface LocalFrame {
  tangent: PlantLocalV3;
  normal: PlantLocalV3;
}

/**
 * Iter 26 PR 1-1 (원칙 2) — Self-describing visualization hint.
 *
 * SkeletonOverlay serializes this hint directly; it does NOT decide color or
 * shape. To change a marker's appearance, change the value the populator
 * writes here — not the overlay code.
 *
 * Populated by buildTomatoSkeletonGraph based on node.type (PR 2-1).
 */
export interface NodeVisualHint {
  /** Hex color (e.g. '#8B4513' main-stem brown). */
  markerColor: string;
  markerShape: 'sphere' | 'disk' | 'ring' | 'arrow';
  /** Absolute marker radius in metres. */
  markerSizeM: number;
  /** Optional label string (e.g. 'L7 petiole-tip'). */
  label?: string;
  /** Whether overlay should draw the frame's tangent/normal arrows. */
  showFrame?: boolean;
}

/** Graph node — shared by adjacent edges (junction or endpoint). */
export interface SkeletonNode {
  id: string;                              // unique within graph
  /** plant-local (lushGroup-relative). SSOT #185 — see docs/architecture/
   *  COORDINATE_SYSTEMS.md. Verified by INV-01 (architecture invariant). */
  pos: V3;
  /** Stem radius at this node (interpolated from PlantBase). */
  radius: number;
  /** Incident edge ids (≥3 at a junction, 1 at a tip, 2 mid-edge). */
  edgeIds: string[];
  /** Iter 26 PR 1-1 — botanical role. Optional during migration; required
   *  after PR 2-1 (populator fills every node). */
  type?: SkeletonNodeType;
  /** Iter 26 PR 1-1 — local orthonormal frame for organ alignment. */
  frame?: LocalFrame;
  /** Iter 26 PR 1-1 (원칙 2) — self-describing overlay hint. */
  visualHint?: NodeVisualHint;
  /**
   * Iter 29 Phase 3 (SKELETON-PHYTOMER-01) — direct reference to PlantBase
   * growth state. Skin reads `node.phytomer.leaf.*` instead of legacy flat
   * NodeState fields or anchor.morphology/state. Optional during
   * migration; populator fills when SkeletonPopulator receives a PlantState.
   *
   * Plan §13.2: "SkeletonNode가 PhytomerNode를 _직접 참조_". Anchor wraps
   * spatial-transform only.
   */
  phytomer?: PhytomerNodeRef;
  /**
   * Iter 36 v5 Phase B (★ NEW) — per-leaflet data for leaflet-node type.
   * Populator fills for each leaflet position (terminal/primary/secondary/intercalary)
   * around each leaf-blade-root. Rendering engine (LeafGenerator + leaf-engine)
   * reads these to position individual leaflet meshes.
   */
  leafletRef?: LeafletNodeRef;
  /**
   * Iter 36 v5 Phase B (★ NEW) — leaf blade metadata for leaf-blade-root type.
   * Populator computes from age + cultivar preset distribution; rendering
   * engine uses for procedural variation (5 age presets + correlation rules).
   */
  leafBladeRef?: LeafBladeRef;
  /**
   * Iter 36 v5 Phase B (★ NEW) — axillary bud data for bud-node type.
   * dormant/activated 모두 skeleton에 존재 — activated 시 sideShoot edge ID
   * 로 link (lineage 추적, 사용자 v4 결정).
   */
  budRef?: BudNodeRef;
}

/**
 * Iter 29 Phase 3 — structural reference to a PhytomerNode from
 * packages/tomato-engine. Kept as `unknown` shape here to avoid coupling
 * the skeleton schema to the engine package; populator narrows the type
 * via `as PhytomerNode` at the binding seam.
 *
 * Plan §3 (sleepy-growing-pretzel.md): the populator copies the engine
 * PhytomerNode reference. Skin reads canonical fields (`.leaf.currentAreaCm2`,
 * `.leaf.posture.droopDeg`, etc.) directly.
 */
export type PhytomerNodeRef = {
  index: number;
  initiationTT: number;
  visibleTT: number;
  ageTT: number;
  // Phytomer status (string union — kept loose for schema decoupling)
  status: string;
  // Internode state (target/current/expansion)
  internode: { targetLengthCm: number; currentLengthCm: number; expansionProgress: number };
  // Leaf organ state — canonical structural reference. Skin reads here.
  leaf: {
    nodeIndex: number;
    initiationTT: number;
    visibleTT: number;
    ageTT: number;
    targetAreaCm2: number;
    currentAreaCm2: number;
    expansionProgress: number;
    stage: string;
    leafletCount: number;
    morphology: {
      serrationDepth: number;
      lobeDepth: number;
      petioleLengthM: number;
      variationSeed: number;
    };
    posture: {
      azimuthDeg: number;
      petioleElevationDeg: number;
      droopDeg: number;
      twistDeg: number;
      curl: number;
    };
    senescence: {
      progress: number;
      colorDullness: number;
      visibleAreaFactor: number;
      curl: number;
      droopDeg: number;
    };
  };
  // Optional reproductive/sideShoot organ shells (Phase 2A).
  trussOrgan?: { initiationTT: number; ageTT: number; state: string };
  sideShootOrgan?: { initiationTT: number; ageTT: number; potential: number; activatedAtTT?: number };
};

/**
 * Iter 29 Phase 3 — quaternion as a structural 4-tuple (x, y, z, w).
 * Matches Babylon Quaternion's public surface so callers can assign a
 * Babylon Quaternion directly; kept structural to avoid pulling Babylon
 * into the skeleton schema package.
 */
export interface Quat4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Tapered capsule segment along an edge centerline. */
export interface SkeletonBone {
  p0: V3;
  p1: V3;
  r0: number;
  r1: number;
}

/**
 * Iter 18B PR 8 (SSOT #180) — Structured organ anchor.
 *
 * Replaces the legacy `attachedOrganIds: string[]` (Phase 5 cut hierarchy
 * support — kept for backward-compat) with a structured record that the
 * SkinEngine can consume directly to position non-edge organ meshes (leaf
 * blade, fruit body, calyx, flower) at the SkeletonGraph's anchor points.
 *
 * Each organ kind references the SkeletonNode where its mesh attaches
 * (typically the edge's endNode — petiole_tip for leaf, pedicel_tip for
 * fruit). PR 14 uses this to assert mesh.position ≈ anchor.pos for every
 * rendered organ.
 *
 * Note: SSOT #182 — leaflet-internal geometry (rib / vein / leaflet layout)
 * is intentionally mesh-local and has NO entry here.
 */
export type OrganAnchorKind = 'leaf_blade' | 'fruit' | 'flower' | 'calyx';

/**
 * Iter 26 PR 1-2 (SSOT #187) — Static morphology hint copied from the
 * cultivar / PlantBase at populate time. Captures what the organ "should
 * look like" independent of moment-to-moment simulation state.
 *
 * Skin consumes this to size meshes. Populated in PR 2-2.
 */
export interface AnchorMorphologyHint {
  kind: 'leaf' | 'fruit' | 'flower' | 'calyx';
  /** 0..1 size multiplier vs cultivar reference (e.g. leafSizeFactor). */
  sizeFactor?: number;
  /** 0..1 maturity along the organ's life (0 emerging, 1 fully mature). */
  maturity?: number;
  /** Leaf-specific: number of leaflets. */
  leafletCount?: number;
  /** Leaf-specific: 0..1 droop along petiole tip. */
  droopFactor?: number;
  /** Fruit-specific: target diameter in metres at maturity. */
  targetDiameterM?: number;
  /** Fruit-specific: 0..1 ripening (0 green, 1 fully red). */
  ripeness?: number;
  /** Iter 26 PR 2-2 (PR 2-AUDIT) — Fruit-specific: per-fruit CultivarSample
   *  snapshot (loculeCount, ribbingStrength, asymmetrySeed/Amp, mottleSeed,
   *  heightWidthRatio, blossomEndAdvanceFrac). Sampled once at set time; Skin
   *  reads this so it does not query FloralSiteBase.fruit.cultivarGenome. */
  fruitGenome?: CultivarSample;
  /** Iter 26 PR 2-2 — Leaf-specific: pre-composed gravity sag fraction
   *  (max(droopExtra/120, age/80) + waterStress*0.3). Populator computes once
   *  from PlantState so Skin reads value directly (원칙 4). */
  ageFracForGravity?: number;
}

/**
 * Iter 26 PR 1-2 (원칙 3) — Per-tick simulation state for this organ.
 *
 * Simulation truth flows here via SkeletonPopulator (PR 2-2). After populate,
 * Skin / Overlay / Acceptance read state from this graph field — not from
 * PlantState directly.
 */
export interface OrganState {
  growthStage?: 'emerging' | 'expanding' | 'mature' | 'senescing';
  /** Whether this organ should currently be rendered. */
  visibility: boolean;
  /** 0..1 vigor / health. */
  vigor?: number;
  /** Iter 26 PR 2-2 — Leaf-specific: 0..1 senescence (controls material
   *  selection in LeafGenerator). */
  yellowing?: number;
  /** Iter 26 PR 2-2 — Leaf-specific: 0..1 water stress (per-vertex tint). */
  waterStress?: number;
  /** Iter 26 PR 2-2 — Leaf-specific: 0..1 disease load (per-vertex tint). */
  diseaseLoad?: number;
}

/**
 * Iter 26 PR 1-2 (SSOT #187) — Skeleton nodes/edges traversed from this
 * organ's root to its mesh attachment point. Lets Skin/Overlay reconstruct
 * the full geometric path without re-querying the graph.
 *
 * Example (leaf): rootNodeId = petiole-root, attachmentNodeId = leaf-blade-root,
 * nodeChain = [petiole-root, petiole-tip, leaf-blade-root],
 * edgeChain = [petiole edge id].
 */
export interface OrganChain {
  /** Where the organ attaches to its parent stem (e.g. petiole-root node). */
  rootNodeId: string;
  /** Where the organ mesh anchors (e.g. leaf-blade-root node). */
  attachmentNodeId: string;
  /** The supporting edge (petiole / pedicel) id, if any. */
  supportEdgeId?: string;
  /** Inclusive node-id chain from root to attachment. */
  nodeChain: string[];
  /** Inclusive edge-id chain from root to attachment. */
  edgeChain: string[];
}

/**
 * Iter 26 PR 1-2 (원칙 2) — Self-describing visualization hint for organ
 * anchors. SkeletonOverlay renders the circle/label by reading this only.
 */
export interface AnchorVisualHint {
  markerColor: string;
  /** Display label (e.g. 'leaf#7 mature'). */
  label: string;
  /** Draw a dashed line from anchorNode to rootNode (organ chain hint). */
  showAttachmentLine?: boolean;
}

/**
 * Iter 29 Phase 3 (SKELETON-ANCHOR-PURE-01) — debug overlay hint.
 * Renderer-only, NEVER growth state. Position + label + color + line toggle.
 *
 * Plan §13.2: "growth state / morphology / organ size / senescence /
 * leafletCount 저장 _금지_. 위반 시 ANCHOR-PURE-01 fail."
 */
export interface AnchorDebugHint {
  /** Debug overlay marker color (hex). Renderer-only — not growth state. */
  markerColor?: string;
  /** Debug overlay label. Renderer-only. */
  label?: string;
  /** Whether SkeletonOverlay should draw the attachment line (Iter 27 alarm). */
  showAttachmentLine?: boolean;
}

export interface OrganAnchor {
  /** Stable id (string form for legacy attachedOrganIds passthrough). */
  id: string;
  kind: OrganAnchorKind;
  /**
   * Iter 27 의미 재정의 — **Joint anchor**. organ이 부모 줄기/knuckle에
   * 부착되는 지점의 SkeletonNode id (alarm reference).
   *
   * 정상 plant에서 `chain.rootNodeId` 와 _동일_ 노드를 가리켜야 한다 →
   * SemanticOverlay attachment line vertex 두 점이 같은 위치 → 라인 0 길이
   * → 시각상 안 보임 = 정상.
   *
   * 회귀 시 anchorNodeId ≠ chain.rootNodeId 매핑되면 라인 > 0 → 시각 alarm.
   *
   * (Iter 26까지 이 필드는 mesh.position 용도였음 — petiole/pedicel tip.
   * Iter 27부터 그 의미는 `meshAnchorNodeId`로 이관.)
   */
  anchorNodeId: string;
  /**
   * Iter 27 PR — **Mesh attach anchor**. organ mesh가 실제 놓이는 위치
   * (= `mesh.position` 좌표를 가져올 SkeletonNode).
   *
   * leaf: petiole tip 노드. fruit/flower/calyx: pedicel tip 노드.
   *
   * Optional during migration. 없으면 SkinMeshPlant이 anchorNodeId로
   * fallback (legacy 호환). populator는 항상 채움.
   */
  meshAnchorNodeId?: string;
  /**
   * Iter 29 Phase 3 (SKELETON-ANCHOR-TRANSFORM-01) — spatial transform
   * resolved by the populator. Phase 4: Skin reads `position` + `rotation`
   * directly; legacy node.pos lookup phased out.
   *
   * Plan §13.2: "anchors are SPATIAL TRANSFORM info only (where/how to
   * attach mesh)".
   */
  position?: V3;
  /**
   * Iter 29 Phase 3 (SKELETON-ANCHOR-TRANSFORM-01) — organ posture
   * quaternion (phyllotaxis × droop × twist composite). Computed by PlantBase
   * and _copied_ into the anchor by the populator. Skeleton does NOT
   * recompute (SKELETON-ANCHOR-POSTURE-01).
   *
   * Structural Quat4 — Babylon Quaternion is assignable directly.
   */
  rotation?: Quat4;
  /** Iter 26 PR 1-2 — geometric path on the graph for this organ. */
  chain?: OrganChain;
  /** Iter 26 PR 1-2 (원칙 2) — overlay self-description. */
  visualHint?: AnchorVisualHint;
  /**
   * Iter 29 Phase 3 (SKELETON-ANCHOR-PURE-01) — debug overlay hint.
   * Renderer-only. NEVER growth state / morphology / organ size / senescence /
   * leafletCount.
   *
   * Plan §13.2: "위반 시 ANCHOR-PURE-01 fail."
   */
  debugHint?: AnchorDebugHint;
}

/**
 * Iter 26 PR 1-3 (SSOT #187) — Render policy for a skeleton edge.
 *
 * Captures geometric + visual decisions that Skin used to make on its own
 * (render radius floor, embed depth, parent stem context at the junction,
 * material role). After PR 2-3 the populator fills this and Skin reads it,
 * so a single render path can be tweaked from one place.
 *
 * Mirrors the shape of `parentContextByEdgeId` in
 * StemFamilyTubeNetworkBuilder.stats — PR 2-3 unifies the two.
 */
export interface EdgeRenderPolicy {
  /** Radius envelope at this edge (m). */
  radius: {
    /** Cultivar/biology truth radius (before any render floor). */
    biological: number;
    /** Actual radius used at render time (after floors / clamps). */
    render: number;
    /** Optional minimum (e.g. 0.8mm) — biological·render compared against this. */
    min?: number;
  };
  /** Junction geometry where this edge meets its parent stem. */
  junction: {
    /** How far the child stem is embedded into the parent surface (m). */
    embedDepthM: number;
    /** Outward radial direction at the junction (plant-local unit vector). */
    radialDir: PlantLocalV3;
    /** Parent stem context at the junction point (PR 2-3 stats source). */
    parentContext?: {
      center: PlantLocalV3;
      tangent: PlantLocalV3;
      radius: number;
    };
  };
  /** Material role — drives shader / texture / color selection. */
  material?: {
    role: 'main-stem' | 'side-shoot' | 'petiole' | 'peduncle' | 'rachis' | 'pedicel'
      | 'leaf-rachis' | 'petiolule'
      // Iter 36 v5 Phase N — bipinnate vein hierarchy.
      | 'lateral-vein' | 'sub-vein';
  };
  /** Iter 26 PR 1-3 (원칙 2) — overlay self-description for this edge. */
  visualHint?: {
    color: string;
    lineWidth?: number;
  };
}

/** Edge — a contiguous stem-like organ. */
export interface SkeletonEdge {
  id: string;                              // unique within graph
  type: SkeletonEdgeType;
  startNodeId: string;                     // origin (attached to parent)
  endNodeId: string;                       // tip / attaches to child organ
  /** Densified centerline as a list of capsules (≥1). The first bone's
   *  p0 matches startNode.pos; the last bone's p1 matches endNode.pos. */
  bonePath: SkeletonBone[];
  /** Parent edge in the cut hierarchy. null for root (mainStem). When a
   *  user cuts this edge, this + all descendant edges fall together. */
  parentEdgeId: string | null;
  /** Whether a tool may cut this edge. mainStem is typically false. */
  cuttable: boolean;
  /** Human / dataset label. e.g. 'main stem', 'leaf 7 petiole'. */
  semanticLabel: string;
  /** Legacy — string ids of non-edge organs. Phase 5 cut hierarchy still
   *  reads this. New code should prefer `organAnchors`. */
  attachedOrganIds: string[];
  /** Iter 18B PR 8 — structured anchor records (SSOT #180). Optional during
   *  migration; populated by buildTomatoSkeletonGraph for petiole / pedicel
   *  edges. */
  organAnchors?: OrganAnchor[];
  /** Iter 26 PR 1-3 (SSOT #187) — render-side policy for this edge.
   *  Populated by buildTomatoSkeletonGraph in PR 2-3. */
  renderPolicy?: EdgeRenderPolicy;
}

export interface PlantSkeletonGraph {
  nodes: Map<string, SkeletonNode>;
  edges: Map<string, SkeletonEdge>;
  /** Root of the cut hierarchy. */
  rootEdgeId: string;
  /** Iter 26 PR 2-2 (SSOT #187 원칙 4) — Cultivar genome snapshot for leaf
   *  shape parameters (leafSerrationDepth/Freq, leafLobeDepth, leafWaviness,
   *  leafPetioleLength, leafSizeMultiplier 등). Skin reads this so it never
   *  imports PlantGenome directly. Populated only when populator is given
   *  a genome via BuildSkeletonOpts.genome. */
  cultivarGenomeSnapshot?: PlantGenome;
}

// ── Graph helpers ──────────────────────────────────────────────────────

/**
 * Walk parentEdgeId chain from edgeId up to the root. Returns the chain
 * including the start and root.
 */
export function edgeAncestors(graph: PlantSkeletonGraph, edgeId: string): string[] {
  const chain: string[] = [];
  let current: string | null = edgeId;
  while (current !== null) {
    chain.push(current);
    const edge = graph.edges.get(current);
    if (!edge) break;
    current = edge.parentEdgeId;
  }
  return chain;
}

/**
 * Build a reusable parent→children index for O(1) DFS traversal.
 *
 * Promoted from inside `edgeSubtree` so callers (e.g. tube builders) can
 * reuse a single index across many traversals without rebuilding it.
 */
export function buildChildIndex(graph: PlantSkeletonGraph): Map<string, string[]> {
  const children: Map<string, string[]> = new Map();
  for (const [eid, e] of graph.edges) {
    if (e.parentEdgeId === null) continue;
    const arr = children.get(e.parentEdgeId);
    if (arr) arr.push(eid);
    else children.set(e.parentEdgeId, [eid]);
  }
  return children;
}

/**
 * Collect edgeId + all descendants via BFS. Used at cut time: when an
 * edge is cut, this returns every edge whose parentEdgeId chain passes
 * through `edgeId`.
 */
export function edgeSubtree(graph: PlantSkeletonGraph, edgeId: string): string[] {
  const children = buildChildIndex(graph);
  const out: string[] = [];
  const queue: string[] = [edgeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    out.push(cur);
    const kids = children.get(cur);
    if (kids) queue.push(...kids);
  }
  return out;
}

/**
 * Iter 36 v5 Phase B — Collect all leaflet-node references for a given
 * leaf-blade-root parent node.
 *
 * Rendering engine (LeafGenerator) calls this to get the per-leaflet position
 * data (terminal/primary/secondary/intercalary) for procedural mesh build.
 * Returns empty array if no leaflet nodes exist (e.g. legacy populator).
 */
export function getLeafletNodesByParentLeaf(
  graph: PlantSkeletonGraph,
  parentLeafNodeId: string,
): LeafletNodeRef[] {
  const out: LeafletNodeRef[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'leaflet-node') continue;
    if (node.leafletRef?.parentLeafNodeId !== parentLeafNodeId) continue;
    out.push(node.leafletRef);
  }
  return out;
}

/**
 * Iter 39 Phase A — leaflet SkeletonNode (id + pos + leafletRef) 반환.
 *
 * `getLeafletNodesByParentLeaf`은 LeafletNodeRef만 반환해 _node.id / node.pos
 * 정보 손실_. Per-leaflet plane mesh가 graph node.pos를 직접 사용하므로 풀
 * SkeletonNode 보존 필수.
 *
 * 기존 helper는 leafEngine.buildCompoundLeaf 시그니처 (Phase B에서 widen 예정)
 * 호환 위해 그대로 유지.
 */
export function getLeafletSkeletonNodesByParentLeaf(
  graph: PlantSkeletonGraph,
  parentLeafNodeId: string,
): SkeletonNode[] {
  const out: SkeletonNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'leaflet-node') continue;
    if (node.leafletRef?.parentLeafNodeId !== parentLeafNodeId) continue;
    out.push(node);
  }
  return out;
}

/**
 * Flatten all bones from the graph into a single array, returning a
 * parallel array of edge ids (one per bone) for later vertex tagging.
 */
export function flattenBones(graph: PlantSkeletonGraph): {
  bones: SkeletonBone[];
  boneEdgeIds: string[];
} {
  const bones: SkeletonBone[] = [];
  const boneEdgeIds: string[] = [];
  for (const [eid, edge] of graph.edges) {
    for (const bone of edge.bonePath) {
      bones.push(bone);
      boneEdgeIds.push(eid);
    }
  }
  return { bones, boneEdgeIds };
}
