// buildTomatoLeafOrganGraph — Pass 1 of Leaf Module v0.1 (Tomato plugin).
//
// Iterates PlantBase axes and emits one CompoundLeafOrgan per visible leaf.
// petioleEdgeId is a REFERENCE to the stem-family graph (data not owned here).
// rachisGuide and per-leaflet midrib paths are PERSISTENT — owned by
// LeafOrganGraph as the morphology SSOT (no ephemeral curves).
//
// Forward compatibility: when a future module emits leaf rachis as a
// stem-family edge, only an optional stemRachisEdgeId reference will be
// added — data ownership stays here.

import type { V3 } from '../sdf/CapsuleSDF';
import type { AxisBase, LeafBase, PlantBase } from '../PlantBase';
import type { PlantSkeletonGraph } from '../skeleton/PlantSkeletonGraph';
import type {
  CompoundLeafOrgan,
  LeafBladeMeshStats as _Stats, // reserved for symmetry
  LeafGenomeSample,
  LeafOrganGraph,
  LeafletMorphologyNode,
  LeafletSide,
  RachisGuide,
} from './LeafOrganGraph';
import type { LeafShapeSpec } from './LeafShapeSchema';
import { buildLeafletMorphology } from './buildLeafletMorphology';
import {
  bonesFromCurveLeaf,
  chordDroopAngleDeg,
  parabolicArc,
  pathArcLength,
  rotateAroundAxis,
  samplePath,
  samplePathTangent,
  vadd,
  vcross,
  vnorm,
  vscale,
  vsub,
} from './leafGeometryHelpers';

// Rachis: thin enough to read as "leaf axis" not stem; thick enough to be
// visible at typical greenhouse camera distance.
const RACHIS_BASE_R = 0.0014; // 1.4 mm at base
const RACHIS_TIP_R = 0.0007;  // 0.7 mm at tip
const RACHIS_DIVISIONS = 6;

const MIN_SIZE_FACTOR = 0.12;            // skip very small leaves entirely
const LEAFLET_FORWARD_TILT_RAD = (25 * Math.PI) / 180; // pinnate forward tilt

export interface BuildLeafOrganGraphOptions {
  /** Caller-resolved leafShape (cultivar override merged on default). */
  leafShape: LeafShapeSpec;
  /** Per-plant random sample (caller seeds + draws via SeededRandom). */
  genome: LeafGenomeSample;
}

export function buildTomatoLeafOrganGraph(
  plantBase: PlantBase,
  stemGraph: PlantSkeletonGraph,
  opts: BuildLeafOrganGraphOptions,
): LeafOrganGraph {
  const { leafShape, genome } = opts;
  const compoundLeaves: CompoundLeafOrgan[] = [];
  const allAxes: AxisBase[] = [plantBase.mainAxis, ...plantBase.sideShoots];

  for (let axisIdx = 0; axisIdx < allAxes.length; axisIdx++) {
    const axis = allAxes[axisIdx];
    if (axis.stemCurve.length === 0) continue;

    for (const leaf of axis.leaves) {
      if (!leaf.visibility.visible) continue;
      if (leaf.sizeFactor < MIN_SIZE_FACTOR) continue;

      const compound = tryBuildCompoundLeaf(plantBase, leaf, axisIdx, stemGraph, leafShape, genome);
      if (compound) compoundLeaves.push(compound);
    }
  }

  return { schemaVersion: 'leafOrgan.v1', compoundLeaves };
}

// ── Per-compound-leaf assembly ────────────────────────────────────────

function tryBuildCompoundLeaf(
  plantBase: PlantBase,
  leaf: LeafBase,
  axisIdx: number,
  stemGraph: PlantSkeletonGraph,
  leafShape: LeafShapeSpec,
  genome: LeafGenomeSample,
): CompoundLeafOrgan | null {
  // 1. Petiole reference (stem-family edge — data not owned here)
  const petioleEdgeId = `e:petiole:axis${axisIdx}:n${leaf.nodeIdx}`;
  const petioleEdge = stemGraph.edges.get(petioleEdgeId);
  if (!petioleEdge || petioleEdge.bonePath.length === 0) return null;

  // 2. Rachis guide path (PERSISTENT). Direction continues from petiole tip
  //    along the petiole's last-segment tangent; sag scales with plant age.
  const petioleTipBone = petioleEdge.bonePath[petioleEdge.bonePath.length - 1];
  const petioleTip = petioleTipBone.p1;
  const petioleDir = safeUnit(vsub(petioleTipBone.p1, petioleTipBone.p0), { x: 0, y: 0, z: 1 });

  // Maturity proxy: PlantBase doesn't carry per-leaf age directly; we use
  // sizeFactor as a maturity proxy and plantBase.day for cantilever droop.
  // ageFrac saturates at day 60 — older plants get heavier droop.
  const ageFrac = Math.max(0, Math.min(1, plantBase.day / 60));
  const maturity = Math.max(0, Math.min(1, leaf.sizeFactor));

  const rachisLen =
    leafShape.rachisLengthM *
    leaf.sizeFactor *
    Math.max(0.3, maturity) *
    genome.lengthScale;
  if (rachisLen < 0.01) return null; // degenerate

  const rachisEndIdeal = vadd(petioleTip, vscale(petioleDir, rachisLen));
  const sagFrac =
    leafShape.rachisDroopFactor *
    (1 + ageFrac * 3) *
    (1 + genome.droopBias);
  const rachisCps = parabolicArc(petioleTip, rachisEndIdeal, sagFrac);
  const rachisGuidePath = bonesFromCurveLeaf(
    rachisCps,
    RACHIS_BASE_R,
    RACHIS_TIP_R,
    RACHIS_DIVISIONS,
  );

  const rachisGuide: RachisGuide = {
    id: `rachis:axis${axisIdx}:n${leaf.nodeIdx}`,
    guidePath: rachisGuidePath,
    arcLengthM: pathArcLength(rachisGuidePath),
    droopAngleDeg: chordDroopAngleDeg(rachisGuidePath),
  };

  // 3. Leaflets — count from LeafStage (already baked into leaf.leafletCount
  //    by tomato-engine PlantState) + genome.leafletCountBias rounding.
  const leafletCountFractional = leaf.leafletCount + genome.leafletCountBias;
  const leafletCount = clampLeafletCount(Math.round(leafletCountFractional));
  if (leafletCount === 0) return null; // pruned / cotyledon

  const leaflets = layoutLeaflets(
    rachisGuide,
    leafletCount,
    rachisLen,
    axisIdx,
    leaf.nodeIdx,
    ageFrac,
    leaf.waterStress,
    leafShape,
    genome,
  );
  if (leaflets.length === 0) return null;

  // 4. Research metric — sum of polygon areas
  const leafAreaM2 = leaflets.reduce((sum, l) => sum + l.areaM2Computed, 0);

  return {
    id: `leaf:axis${axisIdx}:n${leaf.nodeIdx}`,
    parentStemEdgeId: petioleEdge.parentEdgeId ?? petioleEdgeId,
    attachNodeId: petioleEdge.startNodeId,
    petioleEdgeId,
    rachisGuide,
    leaflets,
    maturity,
    ageDays: plantBase.day,
    yellowing: leaf.yellowing,
    waterStress: leaf.waterStress,
    leafAreaM2Computed: leafAreaM2,
    genome,
  };
}

// ── Leaflet layout (paired laterals + terminal) ───────────────────────

function layoutLeaflets(
  rachisGuide: RachisGuide,
  leafletCount: number,
  rachisLen: number,
  axisIdx: number,
  nodeIdx: number,
  ageFrac: number,
  waterStress: number,
  leafShape: LeafShapeSpec,
  genome: LeafGenomeSample,
): LeafletMorphologyNode[] {
  // Tomato: terminal leaflet present + lateral pairs. odd counts emit a
  // terminal; even counts use pairs only (rare in mature leaves).
  const hasTerminal = leafletCount % 2 === 1;
  const pairs = Math.floor(leafletCount / 2);

  // Baseline leaflet length: scale of rachis length, modulated by position.
  // Largest leaflets near the middle, smaller at base and tip (botanical).
  const baseLeafletLen = rachisLen / Math.max(2, leafShape.leafletAspect * 1.5);
  const sizeMod = (i: number, total: number): number => {
    if (total === 0) return 1;
    const t = total === 1 ? 0.5 : i / (total - 1);
    // Gaussian-like bump centered at t=0.5, falls off to ~0.65 at ends.
    return 0.65 + 0.35 * Math.exp(-Math.pow((t - 0.5) * 2.2, 2));
  };

  const leaflets: LeafletMorphologyNode[] = [];

  // Lateral pairs along rachis
  for (let i = 0; i < pairs; i++) {
    const tRachis = pairs === 1
      ? 0.55
      : 0.18 + 0.72 * (i / Math.max(1, pairs - (hasTerminal ? 0 : 1)));

    const attachPoint = samplePath(rachisGuide.guidePath, tRachis);
    const tangent = samplePathTangent(rachisGuide.guidePath, tRachis);
    const leafletLen = baseLeafletLen * sizeMod(i, pairs) * genome.lengthScale;
    if (leafletLen < 0.005) continue;

    for (const sign of [-1, +1] as const) {
      // Perpendicular to tangent in the horizontal plane (around world up).
      const horizPerp = perpHorizontal(tangent, sign);
      // Tilt slightly forward (toward tip) for pinnate appearance.
      const tilted = rotateAroundAxis(horizPerp, { x: 0, y: 1, z: 0 }, LEAFLET_FORWARD_TILT_RAD * 0.6);
      // Gentle horizontal-plane spread — let droop pull the tip down naturally.
      // (Previous 0.10 upward lift was making leaflets cock upward unnaturally.)
      const leafletDir = vnorm(vadd(tilted, vscale({ x: 0, y: 1, z: 0 }, 0.02)));

      const sideName: LeafletSide = sign < 0 ? 'left' : 'right';
      const lid = `leaflet:axis${axisIdx}:n${nodeIdx}:p${i}${sideName === 'left' ? 'L' : 'R'}`;

      leaflets.push(
        buildLeafletMorphology({
          id: lid,
          parentRachisId: rachisGuide.id,
          attachOnRachisT: tRachis,
          attach: attachPoint,
          dir: leafletDir,
          side: sideName,
          length: leafletLen,
          ageFrac,
          waterStress,
          leafShape,
          asymmetryBias: genome.asymmetryBias,
          widthScale: genome.widthScale,
          droopBias: genome.droopBias,
        }),
      );
    }
  }

  // Terminal leaflet (along rachis tangent at tip)
  if (hasTerminal) {
    const tRachis = 1.0;
    const attachPoint = samplePath(rachisGuide.guidePath, tRachis);
    const tangent = samplePathTangent(rachisGuide.guidePath, tRachis);
    // Slightly larger than mid laterals — botanical compound leaf signature.
    const terminalLen = baseLeafletLen * 1.2 * genome.lengthScale;

    leaflets.push(
      buildLeafletMorphology({
        id: `leaflet:axis${axisIdx}:n${nodeIdx}:T`,
        parentRachisId: rachisGuide.id,
        attachOnRachisT: tRachis,
        attach: attachPoint,
        // Terminal points roughly along the rachis tangent (no upward lift).
        dir: tangent,
        side: 'terminal',
        length: terminalLen,
        ageFrac,
        waterStress,
        leafShape,
        asymmetryBias: 0,
        widthScale: genome.widthScale,
        droopBias: genome.droopBias,
      }),
    );
  }

  return leaflets;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Pick a horizontal perpendicular to `tangent` with the chosen sign.
 * Cross with world up; degenerate (tangent ∥ up) → fall back to (1, 0, 0).
 */
function perpHorizontal(tangent: V3, sign: number): V3 {
  const up: V3 = { x: 0, y: 1, z: 0 };
  let perp = vcross(tangent, up);
  if (Math.hypot(perp.x, perp.y, perp.z) < 1e-6) perp = { x: 1, y: 0, z: 0 };
  perp = vnorm(perp);
  return vscale(perp, sign);
}

function safeUnit(vec: V3, fallback: V3): V3 {
  const len = Math.hypot(vec.x, vec.y, vec.z);
  return len > 1e-6 ? { x: vec.x / len, y: vec.y / len, z: vec.z / len } : fallback;
}

/** Clamp leaflet count to LeafStage v1 supported range (0, 1, 3, 5, 7, 9, 11). */
function clampLeafletCount(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  return Math.min(11, Math.max(3, n | 1)); // force odd, cap at 11
}

// ── Per-plant LeafGenomeSample factory ────────────────────────────────

/**
 * Draw a per-plant LeafGenomeSample from variance specs, seeded for
 * reproducibility. Returns deterministic output for the same (seed, leafShape).
 *
 * Note: uses Box-Muller via a local LCG to avoid coupling to SeededRandom
 * (keeps leaf module independent of tomato-engine package).
 */
export function sampleLeafGenome(
  seed: number,
  leafShape: LeafShapeSpec,
): LeafGenomeSample {
  const rng = new LeafRng(seed);
  const v = leafShape.variance;
  return {
    seed,
    rngVersion: 'pmeng-rng.v1',
    leafletCountBias: 0, // v0.1: no random leaflet count bias (LeafStage owns it)
    asymmetryBias: rng.gaussian(0, v.asymmetryStd),
    lengthScale: clampScale(1 + rng.gaussian(0, v.lengthScaleStd)),
    widthScale: clampScale(1 + rng.gaussian(0, v.widthScaleStd)),
    droopBias: rng.gaussian(0, v.droopStd),
  };
}

function clampScale(s: number): number {
  return Math.max(0.6, Math.min(1.6, s));
}

/**
 * Internal RNG — Park-Miller LCG, matching tomato-engine SeededRandom
 * algorithm. Tagged as 'pmeng-rng.v1' in genome metadata for reproducibility
 * audit if the algorithm ever changes.
 */
class LeafRng {
  private state: number;
  constructor(seed: number) {
    // Ensure non-zero positive seed in valid Park-Miller range.
    const s = ((seed | 0) % 2147483646) + 1;
    this.state = s > 0 ? s : s + 2147483646;
  }
  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }
  gaussian(mean: number, stddev: number): number {
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }
}
