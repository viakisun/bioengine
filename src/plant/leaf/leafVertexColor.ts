// leafVertexColor — VertexColorAt baker that calls the tomato-engine
// reference LeafColors implementation.
//
// Maps (compound.maturity, compound.waterStress, compound.yellowing) to the
// 4-stage palette blend (young → mature → stress → senescence). Adds a mild
// tip-darkening along v so tip retains depth even at mature green.

import { getLeafBlendedColor } from '@farmsim/tomato-engine';
import type { VertexColorAt } from './buildLeafBladeMesh';

const TIP_DARKEN = 0.08; // 0..1 — multiplicative darkening at midrib tip (v=1)

export function makeGrowthVertexColorAt(): VertexColorAt {
  return (compound, _leaflet, t) => {
    const ageFrac = Math.max(0, Math.min(1, compound.maturity));
    const col = getLeafBlendedColor(ageFrac, compound.waterStress, compound.yellowing);
    const tipShade = 1 - TIP_DARKEN * t;
    return [col.r * tipShade, col.g * tipShade, col.b * tipShade, 1.0];
  };
}
