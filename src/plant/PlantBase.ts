/**
 * PlantBase — derived geometry cache (v4.0 SoT for rendering).
 *
 * NOT biological state. Regenerated from PlantState on demand.
 * Must never mutate PlantState. Must never create fruit count,
 * truss count, leaf maturity, pruning status, or any biological
 * event. Reads PlantState and places organs in scene-world space
 * — nothing else.
 *
 * All coordinates are scene-world (meters), all angles radians.
 *
 * Consumers (after v4.0):
 *   - SkeletonView (src/rendering/SkeletonOverlay)
 *   - PlantView (src/rendering/ShowcasePlant)
 *   - SupportingPlantView (src/rendering/SupportingPlant)
 *
 * After v4.0 any direct PlantState → Renderer organ interpretation
 * is a bug (see plan-tomato-truss-anatomy-magical-pancake.md).
 */

import type {
  PlantState,
  PlantGenome,
  Cultivar,
  StemAxis,
  NodeState,
  CultivarSample,
  BudState,
} from '@farmsim/tomato-engine';
import { layoutTruss, pedicelControlPoints, type TrussLayout } from './TrussGenerator';
import { ACTIVE_MODEL, ACTIVE_BOTANICAL } from '@farmsim/tomato-engine/ModelRegistry';
import { DEFAULT_COTYLEDON_SPEC } from '@farmsim/tomato-engine/BotanicalSpec';

// ── Boundary types ───────────────────────────────────────────────────

export type VisibilityReason =
  | 'active'
  | 'too_young'
  | 'senescent'
  | 'pruned'
  | 'aborted'
  | 'harvested';

export interface OrganVisibility {
  visible: boolean;
  reason: VisibilityReason;
}

const ACTIVE: OrganVisibility = { visible: true, reason: 'active' };

/** Ripening stage → base RGB color. Mirrors engine's STAGE_COLORS so
 *  cohort-driven path produces same colors as overlayPhysiologyFruits. */
const STAGE_COLORS_TUPLE: ReadonlyArray<readonly [number, number, number]> = [
  [34, 120, 30],    // 0 mature green
  [140, 148, 50],   // 1 breaker
  [185, 110, 60],   // 2 turning
  [210, 80, 65],    // 3 pink
  [215, 50, 40],    // 4 light-red
  [195, 30, 22],    // 5 red
];

// ── Plant geometry ───────────────────────────────────────────────────

export interface PlantBase {
  seed: number;
  day: number;
  geometryMode: 'free' | 'wire_compressed';

  mainAxis: AxisBase;
  /** Side shoots; recursive parent linkage via parentAxisIdx. */
  sideShoots: AxisBase[];
  cotyledons: CotyledonBase[];

  // Plant-level material hints
  diseaseLoad: number;
  waterStress: number;
}

export interface AxisBase {
  order: number;
  parentAxisIdx: number | null;
  parentNodeIdx: number | null;

  /** Stem centerline — world-space points, physics deflection already
   *  applied. Both views consume the same polyline. */
  stemCurve: StemSegment[];

  leaves: LeafBase[];
  trusses: TrussBase[];
  buds: BudMarker[];
}

export interface StemSegment {
  nodeIdx: number;
  position: { x: number; y: number; z: number };
  growthDir: { x: number; y: number; z: number };
  radius: number;
  age: number;
}

export interface LeafBase {
  nodeIdx: number;
  visibility: OrganVisibility;
  attachPosition: { x: number; y: number; z: number };
  azimuthRad: number;
  droopRad: number;
  /** leafSizeFactor × genome.leafSizeMultiplier (effective size). */
  sizeFactor: number;
  leafletCount: number;
  yellowing: number;
  /** Computed once; used by skeleton petiole wire AND lush leaf mesh. */
  petioleLengthM: number;
  /** Petiole centerline (4-cp Catmull-Rom). attach → tip with droop arch.
   *  [0]=attachPosition (sticks to stem), [3]=tip (leaf base). Both
   *  SkeletonOverlay and any future lush petiole tube must consume this
   *  same curve so the two views agree on curvature. */
  petioleCurve: { x: number; y: number; z: number }[];

  // Material hints (passed through from PlantState)
  waterStress: number;
  diseaseLoad: number;

  // ── Reference Pack-aligned orientation metrics (Iter 5 prep) ────────
  // 본 두 값은 ESTIMATE proxy. 실제 geometric calculation은 compound leaf
  // geometry (SkinMeshPlant)에서나 가능. 정식 구현 전까지의 임시 채움이며,
  // source 태그로 "추정값"임을 명시한다. dump-growth-checkpoints.ts +
  // extract-calibration-observations.ts가 consume.
  /** leafletCount 기반 추정 각도. clamp(30 + (count-1)*10, 0, 90).
   *  Reference Pack target band: 45-90° at day 30. */
  lateralSpreadDeg: number;
  /** 잎 자루의 수평 대비 elevation. droopRad는 positive-down 해석
   *  (처질수록 양수) → elevationDeg는 음수. */
  elevationDeg: number;
  /** estimate source 태그. 향후 mesh-derived 정식 구현 시 분기. */
  lateralSpreadSource: 'leaflet_count_estimate';
  elevationSource: 'droop_rad_proxy';
}

export interface TrussBase {
  nodeIdx: number;
  visibility: OrganVisibility;
  worldOrigin: { x: number; y: number; z: number };
  azimuthRad: number;

  // ── v4.0 legacy fields (will be removed in Phase F) ───────────────
  /** @deprecated v4.1: superseded by peduncleCurve + rachisCurve + floralSites. */
  layout: TrussLayout;
  /** @deprecated v4.1: superseded by rachisCurve (computed in Phase B). */
  rachisCurveWorld: { x: number; y: number; z: number }[];
  /** @deprecated v4.1: superseded by floralSites[].fruit. */
  fruits: FruitBase[];
  /** @deprecated v4.1: superseded by floralSites[].flower. */
  flowers: FlowerBase[];

  // ── v4.1 new fields (populated starting Phase B) ──────────────────
  /** Tier 1: peduncle world-space control points. */
  peduncleCurve?: { x: number; y: number; z: number }[];
  /** Tier 2: rachis world-space polyline (cymose zigzag). */
  rachisCurve?: { x: number; y: number; z: number }[];
  /** Per-floral-site knuckle positions (= rachisCurve[1..N]). */
  rachisKnuckles?: { x: number; y: number; z: number }[];
  /** Tier 3: floral sites — fixed positions, transient organ state. */
  floralSites?: FloralSiteBase[];
  /** Site count captured at truss emergence; floralSites.length === this for life. */
  initialSiteCount?: number;
}

export interface FruitBase {
  index: number;
  visibility: OrganVisibility;
  /** World-space center (toWorld already applied). */
  worldPosition: { x: number; y: number; z: number };
  diameterMm: number;
  ripenStage: number;
  ripenFraction: number;
  color: [number, number, number];
  cultivarGenome?: CultivarSample;
  /** Pedicel control points in world coords (4 points). */
  pedicelCurve: { x: number; y: number; z: number }[];
}

export interface FlowerBase {
  index: number;
  visibility: OrganVisibility;
  worldPosition: { x: number; y: number; z: number };
  bloomProgress: number;
}

// ── v4.1 floral-site schema (site-invariant, organ-transient) ───────

export type FloralStage =
  | 'bud'           // primordium, no petals yet
  | 'flowering'     // open flower, petals visible
  | 'petal-drop'    // petals senescing, ovary starting to swell
  | 'fruit-set'     // ovary clearly fruit, ≤ 6mm diameter
  | 'fruit-growing' // visible fruit, < ripenStage 1
  | 'ripening'      // color break onwards (ripenStage ≥ 1)
  | 'harvested'     // removed by management.harvest
  | 'aborted';      // aborted before set or starved later

export interface FlowerOrganState {
  bloomProgress: number;   // 0..1
  petalDrop: number;       // 0..1
  ovarySwell: number;      // 0..1
}

export interface FruitOrganState {
  /** Mesh body center — fruitTop + fruitAxisDir × radius × calyxOffsetFrac.
   *  fruitAxisDir 는 FloralSiteBase 의 unit vector (pedicelTangent 방향
   *  = fruitTop 에서 fruit body 안쪽으로). */
  fruitCenter: { x: number; y: number; z: number };
  diameterMm: number;
  ripenStage: number;
  ripenFraction: number;
  color: [number, number, number];
  cultivarGenome?: CultivarSample;
}

/**
 * One fruit/flower attachment site on the rachis. The site itself is
 * time-invariant once the truss has emerged — only `stage` + organ
 * data change as the floral primordium develops into a ripe fruit and
 * (optionally) gets harvested.
 *
 * Invariant: floralSites.length === TrussBase.initialSiteCount for the
 * life of the truss. Abortion / harvest only flip `stage` / `visibility`.
 */
export interface FloralSiteBase {
  /** Stable per (truss, site) — survives all stage changes. */
  index: number;
  visibility: OrganVisibility;

  // ── Time-invariant geometry ───────────────────────────────────────
  /** Rachis knuckle = pedicel start. */
  knuckle: { x: number; y: number; z: number };
  /** Pedicel 4 control points: knuckle → … → fruitTop. */
  pedicelCurve: { x: number; y: number; z: number }[];
  /** Abscission zone (knee) sampled at anatomy.pedicel.abscissionZoneFrac. */
  abscissionPosition: { x: number; y: number; z: number };
  /** Pedicel end = calyx base = "fruit top" / shoulder. */
  fruitTop: { x: number; y: number; z: number };
  /** Unit direction from fruitTop *into* the fruit body. NOT the
   *  outward sepal normal — named to avoid that confusion. */
  fruitAxisDir: { x: number; y: number; z: number };

  // ── Transient organ state ─────────────────────────────────────────
  stage: FloralStage;
  /** Present when stage ∈ {bud, flowering, petal-drop, fruit-set}.
   *  May coexist with `fruit` only during 'fruit-set'. */
  flower?: FlowerOrganState;
  /** Present when stage ∈ {fruit-set, fruit-growing, ripening, harvested}.
   *  May coexist with `flower` only during 'fruit-set'. */
  fruit?: FruitOrganState;
}

export interface BudMarker {
  nodeIdx: number;
  visibility: OrganVisibility;
  state: BudState;
  position: { x: number; y: number; z: number };
}

export interface CotyledonBase {
  side: -1 | 1;
  visibility: OrganVisibility;
  position: { x: number; y: number; z: number };
  sizeM: number;
  alpha: number;
}

// ── Compute ──────────────────────────────────────────────────────────

export interface ComputePlantGeometryOptions {
  genome: PlantGenome;
  cultivar?: Cultivar;
  geometryMode?: 'free' | 'wire_compressed';
  /** v4.2 — physiology cohort source for site-invariant truss building.
   *  When present, buildTrussBase uses physiology.trusses[i].fruits as
   *  the canonical floralSites (length never changes, marker-driven
   *  stage). Without it, falls back to visual truss arrays. */
  physiologyState?: import('@farmsim/tomato-engine').PlantPhysiologyState;
}

/** Single Y offset for truss attach (was -0.02 / -0.03 / -0.05 across
 *  ShowcasePlant / SupportingPlant / SkeletonOverlay before v4.0). */
const TRUSS_ATTACH_Y_OFFSET_M = -0.02;
/** Cotyledon visibility threshold (was 0.01 in ShowcasePlant, 0.05 in
 *  SupportingPlant — unified). */
const COTYLEDON_VISIBILITY_MIN = 0.01;

export function computePlantGeometry(
  plant: PlantState,
  options: ComputePlantGeometryOptions,
): PlantBase {
  const { genome, physiologyState } = options;

  const axes = plant.allAxes ?? [plant.mainAxis];

  // Build all axes; side-shoots inherit the cumulative deflection offset
  // their parent node carries so the shoot rides the bent main stem
  // instead of floating away in raw coords.
  const builtAxes: AxisBase[] = [];
  // Track truss order across main axis only (side shoots don't carry
  // physiology cohorts in current engine).
  let mainTrussOrderCounter = 0;
  for (let i = 0; i < axes.length; i++) {
    const axis = axes[i];
    let originOffset = { x: 0, y: 0, z: 0 };
    if (i > 0 && axis.parentAxisIdx != null && axis.parentNodeIdx != null) {
      const parentBuilt = builtAxes[axis.parentAxisIdx];
      const parentRawAxis = axes[axis.parentAxisIdx];
      const parentNodeIdx = axis.parentNodeIdx;
      const parentSeg = parentBuilt?.stemCurve.find((s) => s.nodeIdx === parentNodeIdx);
      const parentRawNode = parentRawAxis?.nodes[parentNodeIdx];
      if (parentSeg && parentRawNode) {
        originOffset = {
          x: parentSeg.position.x - parentRawNode.position.x,
          y: parentSeg.position.y - parentRawNode.position.y,
          z: parentSeg.position.z - parentRawNode.position.z,
        };
      }
    }
    const isMain = i === 0;
    builtAxes.push(buildAxisBase(
      axis,
      originOffset,
      genome,
      isMain ? physiologyState : undefined,  // physiology applies to main axis only
      isMain ? () => mainTrussOrderCounter++ : () => 0,
    ));
  }

  const mainAxis = builtAxes[0];
  const sideShoots = builtAxes.slice(1);

  return {
    seed: plant.seed,
    day: plant.day,
    geometryMode: options.geometryMode ?? plant.geometryMode ?? 'free',
    mainAxis,
    sideShoots,
    cotyledons: buildCotyledons(plant),
    diseaseLoad: plant.diseaseLoad,
    waterStress: plant.waterStress,
  };
}

function buildAxisBase(
  axis: StemAxis,
  originOffset: { x: number; y: number; z: number },
  genome: PlantGenome,
  physiologyState: import('@farmsim/tomato-engine').PlantPhysiologyState | undefined,
  nextTrussOrder: () => number,
): AxisBase {
  const stemCurve = buildStemCurve(axis, originOffset);
  const stemPosByNodeIdx = new Map<number, { x: number; y: number; z: number }>();
  for (const seg of stemCurve) stemPosByNodeIdx.set(seg.nodeIdx, seg.position);

  const leaves: LeafBase[] = [];
  const trusses: TrussBase[] = [];
  const buds: BudMarker[] = [];

  // Build a quick lookup for stem radius per node (centerline → surface offset).
  const stemRadiusByNodeIdx = new Map<number, number>();
  for (const seg of stemCurve) stemRadiusByNodeIdx.set(seg.nodeIdx, seg.radius);

  for (let i = 0; i < axis.nodes.length; i++) {
    const node = axis.nodes[i];
    const stemCenter = stemPosByNodeIdx.get(node.index) ?? node.position;
    const stemR = stemRadiusByNodeIdx.get(node.index) ?? 0;

    // Leaf petiole 은 stem 표면점 (= centerline + radius × outward(azimuth))
    // 에 부착. centerline 그대로면 petiole 가 stem 안쪽에서 출발해 잎이
    // 떠 있는 시각. truss 는 별도 — pedicel 의 자체 droop 이 stem 안쪽
    // attach 를 해소하므로 centerline 사용.
    const az = (node.phyllotaxisAngle * Math.PI) / 180;
    const leafAttachPos = stemR > 0
      ? {
          x: stemCenter.x + Math.cos(az) * stemR,
          y: stemCenter.y,
          z: stemCenter.z + Math.sin(az) * stemR,
        }
      : stemCenter;

    leaves.push(buildLeafBase(node, leafAttachPos, genome));

    if (node.truss) {
      // trussOrderIdx = 0-based emergence order on this axis (main only
      // supplies physiology — side shoots get visual fallback).
      const trussOrderIdx = nextTrussOrder();
      const physTruss = physiologyState
        ? physiologyState.trusses.find((t) => t.index === trussOrderIdx)
        : undefined;
      trusses.push(buildTrussBase(node, stemCenter, genome, physTruss, physiologyState?.TT ?? 0));
    }

    buds.push({
      nodeIdx: node.index,
      visibility: budVisibility(node.budState),
      state: node.budState,
      position: { ...stemCenter },
    });
  }

  return {
    order: axis.order,
    parentAxisIdx: axis.parentAxisIdx,
    parentNodeIdx: axis.parentNodeIdx,
    stemCurve,
    leaves,
    trusses,
    buds,
  };
}

/** Apply PhysicsModel deflection to node positions, return ordered
 *  segments. Identical to StemGenerator.buildControlSpine but without
 *  the per-render jitter (jitter is view-side only).
 *
 *  `originOffset` shifts every position uniformly — used so side shoots
 *  inherit their parent axis's cumulative deflection (so the shoot rides
 *  the bent main stem in lush mesh world space). */
function buildStemCurve(
  axis: StemAxis,
  originOffset: { x: number; y: number; z: number },
): StemSegment[] {
  const out: StemSegment[] = [];
  let accX = originOffset.x;
  const accY = originOffset.y;
  let accZ = originOffset.z;
  for (let i = 0; i < axis.nodes.length; i++) {
    const node = axis.nodes[i];
    if (node.deflectionRad > 0.001) {
      const segLen =
        (i > 0 ? node.heightCm - axis.nodes[i - 1].heightCm : node.heightCm) / 100;
      accX += Math.sin(node.deflectionRad) * Math.cos(node.deflectionAzimuth) * segLen;
      accZ += Math.sin(node.deflectionRad) * Math.sin(node.deflectionAzimuth) * segLen;
    }
    out.push({
      nodeIdx: node.index,
      position: {
        x: node.position.x + accX,
        y: node.position.y + accY,
        z: node.position.z + accZ,
      },
      growthDir: { ...node.growthDir },
      radius: node.stemRadiusMm / 1000,
      age: node.age,
    });
  }
  return out;
}

/**
 * SSOT #185 — attachWorldPos / 출력 좌표 모두 **world** (PlantBase는 scene-world
 * 좌표 사용 — 본 파일 첫 줄 주석 참조). graph 변환은 buildPlantSkeleton 시점.
 * 참조: docs/architecture/COORDINATE_SYSTEMS.md
 */
function buildLeafBase(
  node: NodeState,
  attachWorldPos: { x: number; y: number; z: number },
  genome: PlantGenome,
): LeafBase {
  // 기존 코드는 'attachPos' 변수명. 좌표계 명시 위해 외부 alias.
  const attachPos = attachWorldPos;
  const azimuthRad = (node.phyllotaxisAngle * Math.PI) / 180;
  const droopRad = (node.droopExtra * Math.PI) / 180;
  const sizeFactor = node.leafSizeFactor * genome.leafSizeMultiplier;
  // Petiole length matches the skeleton wire computation
  // (SkeletonOverlay:271): 0.12 × max(0.3, leafSizeFactor) — bare
  // leafSizeFactor, NOT effective (genome multiplier already implicit
  // in the engine-side leafSizeFactor).
  const petioleLengthM = 0.12 * Math.max(0.3, node.leafSizeFactor);

  // Petiole 4-cp Catmull-Rom centerline. attach → arched tip with
  // weight-based cantilever sag. droopRad 가 노드 mass × 80 (+age/stress)
  // 의 함수이므로 잎 무게가 증가하면 tip 이 더 처짐.
  //
  // 이전엔 tip 만 sin(droopRad × 0.6) 으로 처지고 mid control points 는
  // 거의 horizontal — cantilever 곡선이라기보다 단순 회전. mid 의 sag 를
  // 추가해 진짜 beam-deflection 곡선 시각화.
  const cos = Math.cos(azimuthRad);
  const sin = Math.sin(azimuthRad);
  const tipY = -petioleLengthM * Math.sin(droopRad);
  const tipR = petioleLengthM * Math.cos(droopRad);
  const tip = { x: attachPos.x + cos * tipR, y: attachPos.y + tipY, z: attachPos.z + sin * tipR };
  // Iter 21 — radial-emergence first, droop later.
  //
  // 이전 (Iter 20 시각 진단 부적합 원인):
  //   c1 (t=0.35): Y droop을 sagAt(0.35)·midSagBase = 0.91·0.5 = 45.5% 즉시
  //   c2 (t=0.70): Y droop 82%
  //   → bone path 첫 절반이 stem axis와 거의 평행으로 떨어져 stem skin 안에
  //     잠긴 채 emerge. Iter 20 측정: emerge gap D45 worst 13.5mm, D99 71mm.
  //
  // Iter 22 — 5 control point: attachPos → c0(radial seed) → c1 → c2 → tip.
  // Iter 21이 c1/c2를 radial-first로 바꿔 D99 emerge gap 71→6.4mm 해결했으나
  // D45 (stem 얇음)는 8.6mm 잔존. c0_radial을 attachPos 바로 옆 순수
  // horizontal radial 5%에 추가해 첫 dense sample들이 1-4mm radial 범위에
  // 안착 → stem swollen surface를 즉시 빠져나감.
  // tip (curve[4]) 위치 불변 → leaf mesh / 외부 의존 모듈 무영향.
  const c0 = {
    x: attachPos.x + cos * tipR * 0.05,  // 5% radial seed, no droop yet
    y: attachPos.y,
    z: attachPos.z + sin * tipR * 0.05,
  };
  const c1 = {
    x: attachPos.x + cos * tipR * 0.30,
    y: attachPos.y + tipY * 0.10,   // 10%만 droop (was 45.5%) — radial-first emergence
    z: attachPos.z + sin * tipR * 0.30,
  };
  const c2 = {
    x: attachPos.x + cos * tipR * 0.65,
    y: attachPos.y + tipY * 0.55,   // 55% droop (mid) — was 82%
    z: attachPos.z + sin * tipR * 0.65,
  };
  const petioleCurve = [{ ...attachPos }, c0, c1, c2, tip];

  // Reference Pack-aligned orientation estimates (Iter 5 prep).
  // clamp upper bound 90° = Reference target max, prevents 9+ leaflet
  // automatic too_wide misdiagnosis.
  const lateralSpreadDeg = Math.min(
    90,
    30 + Math.max(0, node.leafletCount - 1) * 10,
  );
  const elevationDeg = -(droopRad * 180 / Math.PI);

  return {
    nodeIdx: node.index,
    visibility: leafVisibility(node),
    attachPosition: { ...attachPos },
    azimuthRad,
    droopRad,
    sizeFactor,
    leafletCount: node.leafletCount,
    yellowing: node.yellowing,
    petioleLengthM,
    petioleCurve,
    waterStress: node.waterStress,
    diseaseLoad: node.diseaseLoad,
    lateralSpreadDeg,
    elevationDeg,
    lateralSpreadSource: 'leaflet_count_estimate',
    elevationSource: 'droop_rad_proxy',
  };
}

// ── v4.1 vector helpers ─────────────────────────────────────────────

type V3 = { x: number; y: number; z: number };
function vsub(a: V3, b: V3): V3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function vadd(a: V3, b: V3): V3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function vscale(a: V3, s: number): V3 { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function vlen(a: V3): number { return Math.hypot(a.x, a.y, a.z); }
function vnorm(a: V3): V3 { const l = vlen(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function vcross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Parabolic arc from start → end with mild downward sag at midpoint. */
function parabolicArc(start: V3, end: V3, sagFrac = 0.06): V3[] {
  const mid = vscale(vadd(start, end), 0.5);
  // Sag depth proportional to arc length.
  const arcLen = vlen(vsub(end, start));
  const sag = arcLen * sagFrac;
  // 4 control points: start, near-start, near-end, end.
  const p1 = vadd(vscale(start, 0.66), vscale(end, 0.34));
  p1.y -= sag * 0.45;
  const p2 = vadd(vscale(start, 0.34), vscale(end, 0.66));
  p2.y -= sag * 0.85;
  return [start, p1, p2, end];
}

function buildTrussBase(
  node: NodeState,
  attachPos: { x: number; y: number; z: number },
  genome: PlantGenome,
  physTruss: import('@farmsim/tomato-engine').TrussCohort | undefined,
  currentTT: number,
): TrussBase {
  const truss = node.truss!;
  const azimuthRad = (node.phyllotaxisAngle * Math.PI) / 180 + Math.PI;
  const cosAz = Math.cos(azimuthRad);
  const sinAz = Math.sin(azimuthRad);
  const worldOrigin: V3 = {
    x: attachPos.x,
    y: attachPos.y + TRUSS_ATTACH_Y_OFFSET_M,
    z: attachPos.z,
  };

  // ── v4.1 — cymose geometry from ACTIVE_MODEL.trussAnatomy ─────────
  const anatomy = ACTIVE_MODEL.trussAnatomy;
  // v4.2 — initialSiteCount from physiology cohort when available
  // (never shrinks). Falls back to visual truss arrays for non-physiology
  // paths (Greenhouse multi-plant). Visual truss arrays can shrink as
  // overlayPhysiologyFruits filters out aborted/harvested — physiology
  // cohort is the canonical source-of-truth.
  const initialSiteCount = physTruss
    ? physTruss.fruits.length
    : truss.fruits.length + truss.flowers.length;

  // Frame at worldOrigin: forwardDir is the truss azimuth direction.
  const forwardDir: V3 = { x: cosAz, y: 0, z: -sinAz };
  const downDir: V3 = { x: 0, y: -1, z: 0 };
  const sideDir: V3 = vnorm(vcross(forwardDir, downDir));

  // Step 2: Peduncle (Tier 1) — main-stem → cyme base.
  const ped = anatomy.peduncle;
  const pedTangent: V3 = {
    x: forwardDir.x * Math.cos(ped.downAngleRad),
    y: -Math.sin(ped.downAngleRad),
    z: forwardDir.z * Math.cos(ped.downAngleRad),
  };
  const peduncleEnd: V3 = vadd(worldOrigin, vscale(pedTangent, ped.lengthM));
  const peduncleCurve = parabolicArc(worldOrigin, peduncleEnd, 0.18);

  // Step 3: Rachis (Tier 2) — cymose with zigzag + phyllotactic rotation.
  const rachis = anatomy.rachis;
  const rachisDir = vnorm(vsub(peduncleCurve[3], peduncleCurve[2]));
  const rachisPerp1 = sideDir;
  const rachisPerp2 = vnorm(vcross(rachisDir, rachisPerp1));

  const rachisCurve: V3[] = [{ ...peduncleEnd }];
  const rachisKnuckles: V3[] = [];
  const sitePhylloRad: number[] = [];
  for (let i = 0; i < initialSiteCount; i++) {
    const along = (i + 1) * rachis.knuckleSpacingM;
    const angle = (i * rachis.phyllotacticAngleDeg * Math.PI) / 180;
    sitePhylloRad.push(angle);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const knuckle: V3 = {
      x: peduncleEnd.x + rachisDir.x * along
         + rachisPerp1.x * cosA * rachis.zigzagAmplitudeM
         + rachisPerp2.x * sinA * rachis.zigzagAmplitudeM,
      y: peduncleEnd.y + rachisDir.y * along
         - (i + 1) * rachis.downTiltPerKnuckleM
         + rachisPerp1.y * cosA * rachis.zigzagAmplitudeM
         + rachisPerp2.y * sinA * rachis.zigzagAmplitudeM,
      z: peduncleEnd.z + rachisDir.z * along
         + rachisPerp1.z * cosA * rachis.zigzagAmplitudeM
         + rachisPerp2.z * sinA * rachis.zigzagAmplitudeM,
    };
    rachisCurve.push(knuckle);
    rachisKnuckles.push(knuckle);
  }

  // Step 4: Per floral site (Tier 3) — pedicel + organ classification.
  const pedicel = anatomy.pedicel;
  const fruitCfg = anatomy.fruit;
  const floralSites: FloralSiteBase[] = [];

  for (let i = 0; i < initialSiteCount; i++) {
    const knuckle = rachisKnuckles[i];
    const angle = sitePhylloRad[i];
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // Outward direction from rachis (follows phyllotactic angle).
    const outwardDir: V3 = vnorm({
      x: rachisPerp1.x * cosA + rachisPerp2.x * sinA,
      y: rachisPerp1.y * cosA + rachisPerp2.y * sinA,
      z: rachisPerp1.z * cosA + rachisPerp2.z * sinA,
    });
    // pedicelTangent = outward × cos(downAngle) + down × sin(downAngle).
    const pedicelTangent: V3 = vnorm({
      x: outwardDir.x * Math.cos(pedicel.downAngleRad) + downDir.x * Math.sin(pedicel.downAngleRad),
      y: outwardDir.y * Math.cos(pedicel.downAngleRad) + downDir.y * Math.sin(pedicel.downAngleRad),
      z: outwardDir.z * Math.cos(pedicel.downAngleRad) + downDir.z * Math.sin(pedicel.downAngleRad),
    });
    const fruitTop: V3 = vadd(knuckle, vscale(pedicelTangent, pedicel.lengthM));
    const pedicelCurve = parabolicArc(knuckle, fruitTop, 0.25);
    const t = pedicel.abscissionZoneFrac;
    // Cubic bezier approx — linear blend through the 4 control pts at t.
    const abscissionPosition: V3 = vadd(
      vadd(vscale(pedicelCurve[0], (1 - t) ** 3),
           vscale(pedicelCurve[1], 3 * (1 - t) ** 2 * t)),
      vadd(vscale(pedicelCurve[2], 3 * (1 - t) * t ** 2),
           vscale(pedicelCurve[3], t ** 3)),
    );
    const fruitAxisDir = pedicelTangent;  // into fruit body

    // v4.2 Stage classification — cohort marker driven.
    // Marker convention: < 0 = not reached, >= 0 = reached at that TT.
    // physTruss.fruits is the canonical site source (length never shrinks).
    let stage: FloralStage;
    let flowerState: FlowerOrganState | undefined;
    let fruitState: FruitOrganState | undefined;
    let siteVisibility: OrganVisibility = ACTIVE;

    if (physTruss && i < physTruss.fruits.length) {
      const cohort = physTruss.fruits[i];
      const fruitR = Math.max(0, cohort.diameter / 2 / 1000);
      const fruitCenter: V3 = vadd(fruitTop, vscale(fruitAxisDir, fruitR * fruitCfg.calyxOffsetFrac));
      const buildFruit = (): FruitOrganState => ({
        fruitCenter,
        diameterMm: cohort.diameter,
        ripenStage: cohort.ripenStage,
        ripenFraction: cohort.ripenFraction,
        color: STAGE_COLORS_TUPLE[Math.min(5, cohort.ripenStage)] as [number, number, number],
        cultivarGenome: cohort.genome,
      });
      // Derive bloomProgress from anthesisTT (0→1 over ~50 GDD window).
      const gddSinceAnthesis = currentTT - cohort.anthesisTT;
      const bloomProgress = Math.max(0, Math.min(1, gddSinceAnthesis / 50));

      if (cohort.aborted) {
        stage = 'aborted';
        siteVisibility = { visible: false, reason: 'aborted' };
      } else if ((cohort as { harvested?: boolean }).harvested) {
        stage = 'harvested';
        siteVisibility = { visible: false, reason: 'harvested' };
      } else if (cohort.ripenStartTT >= 0) {
        stage = 'ripening';
        fruitState = buildFruit();
      } else if (cohort.cellDivisionEndTT >= 0) {
        stage = 'fruit-growing';
        fruitState = buildFruit();
      } else if (cohort.fertilizationTT >= 0) {
        // fruit-set transition — both organs may coexist briefly.
        stage = 'fruit-set';
        flowerState = { bloomProgress: 0.05, petalDrop: 0.9, ovarySwell: 0.6 };
        if (cohort.diameter > 0) fruitState = buildFruit();
      } else if (bloomProgress > 0.8) {
        stage = 'petal-drop';
        flowerState = { bloomProgress, petalDrop: (bloomProgress - 0.7) / 0.3, ovarySwell: 0 };
      } else if (bloomProgress > 0.3) {
        stage = 'flowering';
        flowerState = { bloomProgress, petalDrop: 0, ovarySwell: 0 };
      } else {
        stage = 'bud';
        flowerState = { bloomProgress, petalDrop: 0, ovarySwell: 0 };
      }
    } else {
      // ── Fallback (no physiology) — visual truss arrays ────────────
      if (i < truss.fruits.length) {
        const f = truss.fruits[i];
        const fruitR = Math.max(0, f.diameterMm / 2 / 1000);
        const fruitCenter: V3 = vadd(fruitTop, vscale(fruitAxisDir, fruitR * fruitCfg.calyxOffsetFrac));
        const buildFruit = (): FruitOrganState => ({
          fruitCenter, diameterMm: f.diameterMm, ripenStage: f.ripenStage,
          ripenFraction: f.ripenFraction, color: f.color, cultivarGenome: f.cultivarGenome,
        });
        if (f.diameterMm <= 0) {
          stage = 'bud';
          flowerState = { bloomProgress: 0.1, petalDrop: 0, ovarySwell: 0 };
        } else if (f.diameterMm < 6) {
          stage = 'fruit-set';
          flowerState = { bloomProgress: 0.05, petalDrop: 0.9, ovarySwell: 0.6 };
          fruitState = buildFruit();
        } else if (f.ripenStage === 0) {
          stage = 'fruit-growing';
          fruitState = buildFruit();
        } else {
          stage = 'ripening';
          fruitState = buildFruit();
        }
      } else {
        const fl = truss.flowers[i - truss.fruits.length];
        const bloom = fl?.bloomProgress ?? 0;
        if (bloom < 0.3) stage = 'bud';
        else if (bloom < 0.8) stage = 'flowering';
        else stage = 'petal-drop';
        flowerState = { bloomProgress: bloom, petalDrop: Math.max(0, (bloom - 0.7) / 0.3), ovarySwell: 0 };
      }
    }

    floralSites.push({
      index: i,
      visibility: siteVisibility,
      knuckle,
      pedicelCurve,
      abscissionPosition,
      fruitTop,
      fruitAxisDir,
      stage,
      flower: flowerState,
      fruit: fruitState,
    });
  }

  // ── Legacy fields (Phase F removes) ──────────────────────────────
  // Existing renderers still read layout / rachisCurveWorld / fruits[] /
  // flowers[] until Phase D/E migrate them. Keep computing both.
  const layout = layoutTruss(truss, genome);
  const legacyToWorld = (p: V3) => ({
    x: worldOrigin.x + cosAz * p.x + sinAz * p.z,
    y: worldOrigin.y + p.y,
    z: worldOrigin.z - sinAz * p.x + cosAz * p.z,
  });
  const legacyFruits: FruitBase[] = [];
  const legacyFlowers: FlowerBase[] = [];
  for (const item of layout.items) {
    const worldPosition = legacyToWorld(item.attachPos);
    if (item.kind === 'fruit') {
      const f = truss.fruits[item.index];
      if (!f) continue;
      legacyFruits.push({
        index: item.index,
        visibility: fruitVisibility(f),
        worldPosition,
        diameterMm: f.diameterMm,
        ripenStage: f.ripenStage,
        ripenFraction: f.ripenFraction,
        color: f.color,
        cultivarGenome: f.cultivarGenome,
        pedicelCurve: pedicelControlPoints(item).map(legacyToWorld),
      });
    } else {
      const fl = truss.flowers[item.index];
      if (!fl) continue;
      legacyFlowers.push({
        index: item.index,
        visibility: ACTIVE,
        worldPosition,
        bloomProgress: fl.bloomProgress,
      });
    }
  }

  return {
    nodeIdx: node.index,
    visibility: trussVisibility(truss.fruits.length, truss.flowers.length),
    worldOrigin,
    azimuthRad,
    // legacy (Phase F removes)
    layout,
    rachisCurveWorld: layout.rachisControlPoints.map(legacyToWorld),
    fruits: legacyFruits,
    flowers: legacyFlowers,
    // v4.1
    peduncleCurve,
    rachisCurve,
    rachisKnuckles,
    floralSites,
    initialSiteCount,
  };
}

function buildCotyledons(plant: PlantState): CotyledonBase[] {
  if (!plant.hasCotyledons || plant.cotyledonSize < COTYLEDON_VISIBILITY_MIN) {
    return [];
  }
  const firstNode = plant.nodes[0];
  if (!firstNode) return [];
  // Iter 29 Phase 2 — hardcoded 0.03 → BotanicalSpec.cotyledon.maxHalfLengthM.
  // 이전: max 6cm (= 0.03 × 1.0 × 2). 사용자 사진 D=8 측정 8.60cm (rotation
  // 포함). 표준 (Heuvelink 0.5-2cm)의 3-12배 과대.
  // fix: maxHalfLengthM = 0.008 (default), full = 1.6cm. legacy fallback.
  const cotyledonSpec = ACTIVE_BOTANICAL.tomato?.cotyledon ?? DEFAULT_COTYLEDON_SPEC;
  const cotSize = cotyledonSpec.maxHalfLengthM * plant.cotyledonSize;
  const cotY = (firstNode.heightCm / 100) * 0.3;
  const alpha = Math.max(0.5, Math.min(1, plant.cotyledonSize * 1.4));
  return ([-1, 1] as const).map((side) => ({
    side,
    visibility: ACTIVE,
    position: { x: side * cotSize * 0.5, y: cotY, z: 0 },
    sizeM: cotSize,
    alpha,
  }));
}

// ── Visibility helpers ──────────────────────────────────────────────

function leafVisibility(node: NodeState): OrganVisibility {
  if (node.leafMaturity < 0.05) {
    // Senescent OR too young — we can't tell here, default to senescent.
    // CoreModel's defoliation pulls leafMaturity to 0 on aged nodes.
    return { visible: false, reason: 'senescent' };
  }
  return ACTIVE;
}

function trussVisibility(fruitCount: number, flowerCount: number): OrganVisibility {
  if (fruitCount + flowerCount === 0) {
    return { visible: false, reason: 'aborted' };
  }
  return ACTIVE;
}

function fruitVisibility(
  f: { diameterMm: number; ripenStage: number },
): OrganVisibility {
  // PlantState legacy path doesn't carry aborted/harvested flags; the
  // CoreModel physiology path filters those out before they reach here.
  // diameterMm === 0 → not yet sized (flower not set) — render as flower instead.
  if (f.diameterMm <= 0) return { visible: false, reason: 'too_young' };
  return ACTIVE;
}

function budVisibility(state: BudState): OrganVisibility {
  if (state === 'pruned') return { visible: false, reason: 'pruned' };
  return ACTIVE;
}
