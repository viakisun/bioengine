// DEFAULT_TOMATO_LEAF_SHAPE — single source of truth fallback.
//
// provenance: 'default' / 'low' confidence — engineering verification placeholder.
// M1 Research calibration pack 후속에서 measured / calibrated 격상 예정.

import type { LeafShapeSpec } from './LeafShapeSchema';

export const DEFAULT_TOMATO_LEAF_SHAPE: LeafShapeSpec = {
  schemaVersion: 'leafShape.v1',
  provenance: {
    sourceLevel: 'default',
    confidence: 'low',
    sourceRefs: [],
    notes:
      'v0.1 default fallback. Not measured — placeholder for engineering verification.',
    lastReviewed: '2026-05-25',
  },
  leafletCount: { early: 3, developing: 7, mature: 9 },
  widthProfile: {
    mode: 'beta',
    peakHalfWidthM: 0.045,
    // peakT 0.35 — peak slightly forward of base (tomato leaflets are
    // pointed forward, narrow at attach, broad at upper-third).
    peakT: 0.35,
    // sharpness 4.5 — pointier tip; lower numbers gave overly round leaflets.
    sharpness: 4.5,
    asymmetry: 1.0,
  },
  marginProfile: {
    serrationDepth: 0.15,
    serrationFrequency: 9,
    lobeDepth: 0.06,
    waviness: 0.04,
  },
  surfaceProfile: {
    // cupAmount 0.20 — visible transverse cup; flat leaves looked plastic.
    cupAmount: 0.20,
    twistAmount: 0.0,
    droopAmount: 0.28,
    edgeCurlAmount: 0.04,
  },
  petioleLengthM: 0.11,
  rachisLengthM: 0.30,
  rachisDroopFactor: 0.12,
  leafletAspect: 1.8,
  variance: {
    lengthScaleStd: 0.08,
    widthScaleStd: 0.08,
    asymmetryStd: 0.03,
    droopStd: 0.05,
  },
};
