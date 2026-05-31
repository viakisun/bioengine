// LeafOrganGraph — Plant Morphology Engine, Leaf Module v0.1.
//
// 잎의 morphology SSOT. rachisGuide / leaflet midrib / leafletShapeProfile은
// 모두 persistent (ephemeral rendering helper 금지 — SSOT 원칙 #4).
//
// StemFamilyGraph(PlantSkeletonGraph)와 분리. petiole은 stem-family edge를
// id로 reference만 한다 (중복 skeleton 방지). leaf rachis 자체는 본 모듈이
// 영구 소유 (후속 모듈에서 stem-family tube 렌더에 합류하더라도 reference만 추가).

import type { V3 } from '../sdf/CapsuleSDF';

// ── Schema versions ───────────────────────────────────────────────────

export type LeafOrganGraphSchemaVersion = 'leafOrgan.v1';
export type LeafShapeSchemaVersion = 'leafShape.v1';
export type LeafRngVersion = 'pmeng-rng.v1';

// ── Graph root ────────────────────────────────────────────────────────

export interface LeafOrganGraph {
  schemaVersion: LeafOrganGraphSchemaVersion;
  compoundLeaves: CompoundLeafOrgan[];
}

// ── Compound leaf ─────────────────────────────────────────────────────

export interface CompoundLeafOrgan {
  /** 'leaf:axis{axisIdx}:n{nodeIdx}' — stable, seed-derived. */
  id: string;
  /** PlantSkeletonGraph(stem-family) edge to which this leaf attaches. */
  parentStemEdgeId: string;
  /** PlantSkeletonGraph node id at attach point. */
  attachNodeId: string;

  /** Reference to the petiole edge in stem-family. Data not owned here. */
  petioleEdgeId?: string;

  /** Persistent rachis guide — owned. Not ephemeral. */
  rachisGuide: RachisGuide;

  /** Lateral pairs + terminal. */
  leaflets: LeafletMorphologyNode[];

  // Growth + research metadata
  maturity: number;
  ageDays: number;
  /** Per-leaf yellowing 0..1 (senescence). Vertex-color baked. */
  yellowing: number;
  /** Per-leaf water stress 0..1. Shifts color toward stress hue + extra droop. */
  waterStress: number;
  /** Sum of leaflet polygon areas — botanical validation report (V9). */
  leafAreaM2Computed: number;
  genome: LeafGenomeSample;
}

// ── Rachis guide (persistent) ─────────────────────────────────────────

export interface RachisGuide {
  /** 'rachis:axis{axisIdx}:n{nodeIdx}'. */
  id: string;
  /** root (petiole tip) → terminal leaflet attach point. */
  guidePath: LeafBone[];
  arcLengthM: number;
  /** Cantilever droop angle (deg) — research metric. */
  droopAngleDeg: number;
}

// ── Leaflet (lateral / terminal) ──────────────────────────────────────

export interface LeafletMorphologyNode {
  /** 'leaflet:axis{ax}:n{n}:L{i}' or ':T' for terminal. */
  id: string;
  /** RachisGuide.id reference. */
  parentRachisId: string;
  /** 0..1 along rachisGuide. */
  attachOnRachisT: number;
  /** Petiolule (leaflet stalk) — null if sessile. */
  petioluleGuide?: LeafBone[];
  /** Midrib centerline (root → tip). */
  midribPath: LeafBone[];
  side: LeafletSide;
  shapeProfile: LeafletShapeProfile;
  /** Geometry-weak in v0.1; full validation data for v2+. */
  serrationStrength: number;
  lobeStrength: number;
  // Per-leaflet research metrics (V9 report mode):
  lengthM: number;
  maxHalfWidthM: number;
  areaM2Computed: number;
}

export type LeafletSide = 'left' | 'right' | 'terminal';

// ── Bone (capsule segment) ────────────────────────────────────────────

export interface LeafBone {
  p0: V3;
  p1: V3;
  /** Small guide/midrib radius (0.2-0.6 mm). Not blade width. */
  r0: number;
  r1: number;
}

// ── Leaflet shape profile (full v1 schema; v0.1 partially active) ────

export interface LeafletShapeProfile {
  lengthM: number;
  maxHalfWidthM: number;
  widthProfile: WidthProfileSpec;
  marginProfile: MarginProfileSpec;
  surfaceProfile: SurfaceProfileSpec;
}

/**
 * Width profile — peakT + sharpness authoring schema.
 * basePower / tipPower는 evaluator 내부에서 derived:
 *   basePower = max(0.3, peakT × sharpness)
 *   tipPower  = max(0.3, (1 - peakT) × sharpness)
 */
export interface WidthProfileSpec {
  /** v0.1: 'beta' only. 'bezier' / 'sampled' stub for v2+. */
  mode: 'beta' | 'bezier' | 'sampled';
  /** Peak位置 0.30-0.55. */
  peakT: number;
  /** 1.0 (flat) ~ 6.0 (pointy) — single knob. */
  sharpness: number;
  /** left/right ratio. 1.0 = symmetric. */
  asymmetry: number;
}

export interface MarginProfileSpec {
  serrationDepth: number;      // 0..1 (geometry-weak v0.1)
  serrationFrequency: number;  // teeth count along edge
  lobeDepth: number;           // 0..1 (data only v0.1)
  waviness: number;            // 0..1 (data only v0.1)
}

export interface SurfaceProfileSpec {
  cupAmount: number;       // transverse cup (active v0.1)
  twistAmount: number;     // axial twist (data only v0.1, v2 enable)
  droopAmount: number;     // longitudinal droop (active v0.1)
  edgeCurlAmount: number;  // tip curl (data only v0.1, v2 enable)
}

// ── Per-plant random sample ───────────────────────────────────────────

export interface LeafGenomeSample {
  /** Seeded from PlantGenome. Emitted in metadata for reproducibility. */
  seed: number;
  /** RNG implementation version — 후속 교체 시 재현성 추적. */
  rngVersion: LeafRngVersion;
  leafletCountBias: number;
  asymmetryBias: number;
  lengthScale: number;
  widthScale: number;
  droopBias: number;
}

// ── Mesh output types (consumed by buildLeafBladeMesh) ────────────────

export interface LeafletFaceGroup {
  indexStart: number;
  indexCount: number;
  leafletId: string;
  compoundLeafId: string;
  side: LeafletSide;
  role: 'blade_surface';
  /** Base/tip row degenerate triangles — known V10 exception ranges. */
  allowedDegenerateIndexRanges?: Array<{
    indexStart: number;
    indexCount: number;
    reason: 'base_collapse' | 'tip_collapse';
  }>;
}

export interface LeafBladeMeshStats {
  compoundLeafCount: number;
  leafletCount: number;
  vertexCount: number;
  triangleCount: number;
  buildMs: number;
}
