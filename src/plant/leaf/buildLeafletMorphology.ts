// buildLeafletMorphology — Pass 2 of Leaf Module v0.1.
//
// Builds a single LeafletMorphologyNode from attach point + direction +
// length. Encapsulates midrib curve, shape profile, and per-leaflet
// research metrics (length, max half width, computed area).
//
// Geometry-weak in v0.1: serration / lobe data is filled but mesh
// modulation is gentle (handled by buildLeafBladeMesh). twist & edgeCurl
// stored but not yet applied.

import type { V3 } from '../sdf/CapsuleSDF';
import type {
  LeafletMorphologyNode,
  LeafletShapeProfile,
  LeafletSide,
} from './LeafOrganGraph';
import type { LeafShapeSpec } from './LeafShapeSchema';
import {
  bonesFromCurveLeaf,
  parabolicArc,
  vadd,
  vscale,
} from './leafGeometryHelpers';
import { betaIntegralNormalized } from './widthProfile';

const MIDRIB_BASE_R = 0.0005; // 0.5 mm
const MIDRIB_TIP_R = 0.0002;  // 0.2 mm
const MIDRIB_DIVISIONS = 4;

export interface BuildLeafletInput {
  /** Stable id (parent rachis + side index). */
  id: string;
  /** Parent rachisGuide.id reference. */
  parentRachisId: string;
  /** 0..1 — where on rachis this leaflet attaches. */
  attachOnRachisT: number;

  /** World-space attach point (on rachis guide path). */
  attach: V3;
  /** Initial midrib direction (unit). */
  dir: V3;
  side: LeafletSide;
  /** Final midrib length (m). */
  length: number;

  /** Plant maturity 0..1. Older → more droop, less cup. */
  ageFrac: number;
  /** Per-leaf water stress 0..1. Adds extra droop, reduces cup. */
  waterStress: number;
  leafShape: LeafShapeSpec;
  /** Per-plant variance applied to symmetry / droop only here. */
  asymmetryBias: number;
  widthScale: number;
  droopBias: number;
}

export function buildLeafletMorphology(input: BuildLeafletInput): LeafletMorphologyNode {
  const {
    id, parentRachisId, attachOnRachisT,
    attach, dir, side, length: midribLen,
    ageFrac, waterStress, leafShape, asymmetryBias, widthScale, droopBias,
  } = input;

  // ── Midrib curve: cantilever sag along midrib + waterStress wilt ────
  const midribDroop =
    (0.10 + ageFrac * 0.30) * midribLen * (1 + droopBias) * (1 + waterStress * 0.5);
  const midribEnd = vadd(attach, vscale(dir, midribLen));
  midribEnd.y -= midribDroop;
  const midribCps = parabolicArc(attach, midribEnd, midribDroop / Math.max(midribLen, 1e-6));
  const midribPath = bonesFromCurveLeaf(midribCps, MIDRIB_BASE_R, MIDRIB_TIP_R, MIDRIB_DIVISIONS);

  // ── Half-width at peak ──────────────────────────────────────────────
  // Derived from cultivar leafletAspect. Per-plant widthScale + maturity scale already applied
  // by caller via `length`; here we only fold widthScale into width itself.
  const maxHalfWidthM = (0.5 * midribLen / leafShape.leafletAspect) * widthScale;

  // ── Asymmetry: left/right or terminal (symmetric) ───────────────────
  const baseAsym = leafShape.widthProfile.asymmetry;
  const asym =
    side === 'terminal'
      ? 1.0
      : side === 'right'
        ? baseAsym + asymmetryBias
        : 1 / baseAsym - asymmetryBias;

  const shapeProfile: LeafletShapeProfile = {
    lengthM: midribLen,
    maxHalfWidthM,
    widthProfile: {
      mode: leafShape.widthProfile.mode,
      peakT: leafShape.widthProfile.peakT,
      sharpness: leafShape.widthProfile.sharpness,
      asymmetry: Math.max(0.5, Math.min(2.0, asym)),
    },
    marginProfile: { ...leafShape.marginProfile },
    surfaceProfile: {
      // Young leaves cup more; old leaves droop more — biomechanics.
      // waterStress softens cup (wilt → flatten) and adds droop.
      cupAmount:
        leafShape.surfaceProfile.cupAmount * (1 - ageFrac * 0.4) * (1 - waterStress * 0.6),
      twistAmount: leafShape.surfaceProfile.twistAmount,
      droopAmount:
        leafShape.surfaceProfile.droopAmount * (1 + ageFrac * 0.6) * (1 + waterStress * 0.8),
      edgeCurlAmount: leafShape.surfaceProfile.edgeCurlAmount,
    },
  };

  // Botanical area metric: ∫₀¹ width(t) dt × 2 × length × maxHalfWidthM.
  // Use the normalized beta integral closed-form for accuracy (V9 report).
  const areaM2 =
    midribLen *
    2 *
    maxHalfWidthM *
    betaIntegralNormalized(shapeProfile.widthProfile);

  return {
    id,
    parentRachisId,
    attachOnRachisT,
    midribPath,
    side,
    shapeProfile,
    serrationStrength: leafShape.marginProfile.serrationDepth,
    lobeStrength: leafShape.marginProfile.lobeDepth,
    lengthM: midribLen,
    maxHalfWidthM,
    areaM2Computed: areaM2,
  };
}
