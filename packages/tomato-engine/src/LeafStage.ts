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
//
// Iter 29 Phase 0 — leafletCount path 통합:
//   leafletCountFromMaturity() 단일 함수가 GrowthModel + getLeafStage 모두
//   사용. 이전 bug: GrowthModel은 5/7/9만 분기, LeafStage는 1→3→5→7→9.
//   두 path 불일치로 EARLY_TRUE 단계 (1-3 leaflet)가 실제 렌더링 안 됨.
//   참조: docs/calibration-checkpoint-reports/v0.14-iter29-leaf-model-comprehensive.md

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
 * Iter 29 Phase 0 + Phase 1-Pre — leafletCount 단일 source of truth.
 *
 * GrowthModel과 LeafStage.getLeafStage 둘 다 본 함수를 호출. 두 path
 * 불일치 bug (이전: GrowthModel은 5/7/9만, LeafStage는 1→3→5→7→9) 해소.
 *
 * Phase 1-Pre 변경: implicit max = 9 hardcoded 제거.
 *   - 이전: COMPOUND tail formula `5 + t * 4` (max always 9)
 *   - 신규: maxLeafletCount cultivar-driven (7 | 9 | 11)
 *          formula: `5 + t * (maxLeafletCount - 5)` (cherry 7 / standard 9 / beefsteak 11)
 *
 * Progression:
 *   - biasedMaturity < 0.4 (EARLY_TRUE): 1 → 3 (single → few leaflets)
 *   - 0.4 ≤ biasedMaturity ≤ 1.0 (COMPOUND): 5 → maxLeafletCount
 *
 * fractional 반환은 LeafStage 렌더 morphing 용. NodeState에 저장 시 Math.round.
 *
 * Backward compat: `maxLeafletCount` 인자 생략 시 기존 동작 (max=9).
 * Phase 5에서 모든 호출처가 cultivar.growthProfile.maxLeafletCount를 전달
 * 하도록 마이그레이션 — 그 후 default 값은 제거.
 *
 * @param maturity 0-1 leaf maturity
 * @param bias genome.leafletCountBias (보통 0) — 0.15 가중치 적용
 * @param maxLeafletCount cultivar.growthProfile.maxLeafletCount (Phase 1-Pre).
 *                        default 9 = backward compat.
 * @returns fractional leaflet count
 */
export function leafletCountFromMaturity(
  maturity: number,
  bias: number = 0,
  maxLeafletCount: 7 | 9 | 11 = 9,
): number {
  const biasedMaturity = maturity + bias * 0.15;
  if (biasedMaturity < 0.4) {
    // EARLY_TRUE: 1 → 3 leaflets (cultivar-independent — primordium morphology
    // is conserved across tomato cultivars; only mature count varies).
    const t = Math.max(0, biasedMaturity / 0.4);
    return 1 + t * 2;
  }
  // COMPOUND_DEVELOPING → COMPOUND_MATURE: 5 → maxLeafletCount
  const t = Math.min(1, (biasedMaturity - 0.4) / 0.6);
  return 5 + t * (maxLeafletCount - 5);
}

/**
 * Classify a node's leaf into a discrete stage + give the renderer smooth
 * morphing parameters.
 *
 * Iter 29 Phase 0 — COTYLEDON 분기 _제거_. node[0]은 첫 본엽으로 EARLY_TRUE
 * 시작 (이전 모호 분류: node[0]을 떡잎으로 잘못 매핑). 떡잎(cotyledon)은
 * state.hasCotyledons + cotyledonChunk로 별도 path. enum LeafStage.COTYLEDON
 * 값은 backward compat 위해 유지 (사용처 0건이지만 외부 인터페이스).
 *
 * Decision order (top to bottom — first match wins):
 *   1. PRUNED  if leafMaturity < 0.05
 *   2. SENESCENT  if yellowing > 0.3
 *   3. EARLY_TRUE  if leafMaturity < 0.4 (node[0] 포함)
 *   4. COMPOUND_DEVELOPING  if leafMaturity < 0.7
 *   5. COMPOUND_MATURE  otherwise
 *
 * @param plantAge 사용 안 함 (기존 시그니처 유지 — 향후 확장 여지)
 */
export function getLeafStage(node: NodeState, plantAge: number): LeafStageInfo {
  void plantAge;
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

  const m = node.leafMaturity;

  // 3. Early true leaf — single/few leaflets, weak teeth & lobes
  // Iter 29 Phase 0: leafletCountFromMaturity 단일 source of truth 사용.
  if (m < 0.4) {
    const blendT = m / 0.4;
    return {
      stage: LeafStage.EARLY_TRUE,
      blendT,
      leafletCount: leafletCountFromMaturity(m),  // 1 → 3 (bias 0)
      serrationStrength: blendT * 0.4,
      lobeStrength: blendT * 0.3,
    };
  }

  // 4 / 5. Compound developing → mature
  const t = (m - 0.4) / 0.6;
  return {
    stage: t < 0.5 ? LeafStage.COMPOUND_DEVELOPING : LeafStage.COMPOUND_MATURE,
    blendT: t,
    leafletCount: leafletCountFromMaturity(m),  // 5 → 9 (bias 0)
    serrationStrength: 0.4 + t * 0.6,
    lobeStrength: 0.5 + t * 0.5,
  };
}
