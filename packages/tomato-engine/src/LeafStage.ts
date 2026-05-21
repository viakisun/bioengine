// Leaf stage classification — used by both the engine consumer (rendering)
// and any analysis code that wants a single label per leaf.
//
// References:
//   - main branch generators/PlantGenerator.createCotyledons (cotyledon visibility)
//   - GrowthModel.computePlantState (leafletCount transition logic)
//   - User reference algorithm (chat — "Seedling Stage / 떡잎 2장" etc.)
//
// The stage transitions are sigmoid-blended so renderers can morph leaflet
// count / serration / lobe depth smoothly instead of snap-changing.

import type { NodeState } from './GrowthModel';

export enum LeafStage {
  /** Embryonic leaf, oval, 2 per plant, day 3–25 */
  COTYLEDON = 'cotyledon',
  /** First true leaves, often simple/few-lobed, leafMaturity < 0.4 */
  EARLY_TRUE = 'early_true',
  /** Compound leaf developing toward 5–7 leaflets */
  COMPOUND_DEVELOPING = 'compound_developing',
  /** Mature compound leaf 7–9 leaflets, fully serrated */
  COMPOUND_MATURE = 'compound_mature',
  /** Yellowing / aged leaf (yellowing > 0.3) */
  SENESCENT = 'senescent',
  /** Pruned (leafMaturity = 0, greenhouse practice removes leaves below ripe truss) */
  PRUNED = 'pruned',
}

export interface LeafStageInfo {
  stage: LeafStage;
  /** 0–1 progress within the current stage (renderer can use for smooth morphing) */
  blendT: number;
  /** Effective leaflet count — may be fractional during morphing. Integer count = Math.round() */
  leafletCount: number;
  /** Tooth amplitude 0–1, multiplied with genome.leafSerrationDepth */
  serrationStrength: number;
  /** Lobe modulation 0–1, multiplied with genome.leafLobeDepth */
  lobeStrength: number;
}

/**
 * Classify a node's leaf into a discrete stage + give the renderer smooth
 * morphing parameters.
 *
 * Decision order (top to bottom — first match wins):
 *   1. PRUNED  if leafMaturity < 0.05
 *   2. SENESCENT  if yellowing > 0.3
 *   3. COTYLEDON  if plantAge < 15 && node.index === 0 && low maturity
 *   4. EARLY_TRUE  if leafMaturity < 0.4
 *   5. COMPOUND_DEVELOPING  if leafMaturity < 0.7 (after blending up)
 *   6. COMPOUND_MATURE  otherwise
 */
export function getLeafStage(node: NodeState, plantAge: number): LeafStageInfo {
  // 1. Pruned (highest priority — wins over everything)
  if (node.leafMaturity < 0.05) {
    return {
      stage: LeafStage.PRUNED,
      blendT: 0,
      leafletCount: 0,
      serrationStrength: 0,
      lobeStrength: 0,
    };
  }

  // 2. Senescent (yellow + likely drooping)
  if (node.yellowing > 0.3) {
    return {
      stage: LeafStage.SENESCENT,
      blendT: Math.min(1, node.yellowing),
      leafletCount: node.leafletCount,
      serrationStrength: 1,
      lobeStrength: 1,
    };
  }

  // 3. Cotyledon — only the seedling-age zeroth node, while still maturing
  if (plantAge < 15 && node.index === 0 && node.leafMaturity < 0.3) {
    return {
      stage: LeafStage.COTYLEDON,
      blendT: node.leafMaturity / 0.3,
      leafletCount: 2,
      serrationStrength: 0,
      lobeStrength: 0,
    };
  }

  const m = node.leafMaturity;

  // 4. Early true leaf — single/few leaflets, weak teeth & lobes
  if (m < 0.4) {
    const blendT = m / 0.4;
    return {
      stage: LeafStage.EARLY_TRUE,
      blendT,
      // 1 → 3 leaflets as it matures
      leafletCount: 1 + blendT * 4,
      serrationStrength: blendT * 0.4,
      lobeStrength: blendT * 0.3,
    };
  }

  // 5 / 6. Compound developing → mature
  const t = (m - 0.4) / 0.6;
  // 5 → 9 leaflets, fractional during morph so renderer can grow the
  // outermost pair from size 0 → 1 instead of popping in.
  const leafletCount = 5 + t * 4;
  return {
    stage: t < 0.5 ? LeafStage.COMPOUND_DEVELOPING : LeafStage.COMPOUND_MATURE,
    blendT: t,
    leafletCount,
    serrationStrength: 0.4 + t * 0.6,
    lobeStrength: 0.5 + t * 0.5,
  };
}
