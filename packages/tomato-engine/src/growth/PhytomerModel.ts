import { createLogger } from '../utils/logger';
const log = createLogger('growth');
// Iter 29 Phase 1 — PhytomerModel module.
//
// Plan §3 (sleepy-growing-pretzel.md):
//   nodeNumber = floor((currentTT - transplantOffsetTT) / phyllochronTT)
//   node.initiationTT = transplantOffsetTT + node.index × phyllochronTT
//   node.ageTT = currentTT - node.initiationTT
//
// Phase 1 stays minimal — provides _helpers_ for TT-based node fields.
// Phase 2A adds full LeafOrganState; Phase 3 binds Skeleton to PhytomerNode.
//
// ★ Module boundary (Phase 1 GROWTH-MODULE-BOUNDARY-01):
//   GrowthModel.ts uses these helpers to populate `node.initiationTT`,
//   `node.visibleTT`, `node.ageTT`. The math stays here so a future
//   plastochron/primordium-visible delay model swap touches only this file.
//
// References:
//   - Heuvelink 1996 TOMSIM (phyllochronTT)
//   - Plan §3
//
// ★ Dependency-free boundary: 본 모듈은 ModelRegistry/Cultivar 등
// application/JSONC loader 의존성 없음. cultivar param은 _structural type_
// 만 (CultivarGrowthProfile 안의 phyllochronTT만 필요). 테스트가 stub object
// 로 호출 가능.

/** Phytomer status — phytomer 전체 lifecycle. Independent of LeafOrganState.stage.
 *  Phase 2A populates this from canonical state; Phase 1 reserves the type.
 */
export type PhytomerStatus =
  | 'primordium'
  | 'visible'
  | 'expanding'
  | 'mature'
  | 'senescent'
  | 'removed';

/**
 * Structural cultivar input — only the fields PhytomerModel needs.
 * Allows test code to pass stub objects without going through the full
 * Cultivar interface (which depends on the JSONC loader).
 */
export interface PhytomerCultivarInput {
  growthProfile: {
    phyllochronTT: number;
    plastochronTT?: number;
  };
}

/**
 * Organogenesis configuration — passed in by the caller (typically
 * ACTIVE_MODEL.organogenesis from ModelRegistry). Defaulted so direct
 * test calls work without ACTIVE_MODEL.
 */
export interface PhytomerOrgConfig {
  /** Phytomer count emerged before day 0 (seedling phase). */
  initialNodeCountAtTransplant: number;
  /** TT (GDD) at day 0 (transplant). */
  TT_at_transplant: number;
}

const DEFAULT_ORG_CONFIG: PhytomerOrgConfig = {
  initialNodeCountAtTransplant: 5,
  TT_at_transplant: 280,
};

/**
 * Compute the initiation TT for a given node index, in cultivar phyllochron
 * units. The first `initialNodeCountAtTransplant` nodes are treated as
 * emerged before day 0 (seedling phase) — their initiationTT is negative
 * or zero relative to currentTT.
 *
 * Plan §3 canonical formula:
 *   node.initiationTT = transplantOffsetTT + node.index × phyllochronTT
 */
export function computeNodeInitiationTT(
  nodeIndex: number,
  cultivar: PhytomerCultivarInput,
  org: PhytomerOrgConfig = DEFAULT_ORG_CONFIG,
): number {
  const phyllo = cultivar.growthProfile.phyllochronTT;
  const initialN = org.initialNodeCountAtTransplant;
  // (note: both branches are currently identical — kept for documentation
  // intent. Phase 2A may add a different seedling distribution model.)
  if (nodeIndex < initialN) {
    return (nodeIndex - initialN) * phyllo + org.TT_at_transplant;
  }
  return (nodeIndex - initialN) * phyllo + org.TT_at_transplant;
}

/**
 * Compute visibleTT — when this phytomer's leaf becomes visually visible.
 * Phase 1: same as initiationTT (no primordium-visible delay yet).
 * Phase 2+: subtract `plastochronTT` to model the primordium-visible gap.
 */
export function computeNodeVisibleTT(
  nodeIndex: number,
  cultivar: PhytomerCultivarInput,
  org: PhytomerOrgConfig = DEFAULT_ORG_CONFIG,
): number {
  // Phase 1 placeholder — equal to initiationTT.
  // Phase 2+: `+ (phyllochronTT - plastochronTT)` for primordium → visible delay.
  return computeNodeInitiationTT(nodeIndex, cultivar, org);
}

/**
 * Compute ageTT for a node at the current plant TT.
 * Plan §3: node.ageTT = currentTT - node.initiationTT
 *
 * Returns 0 if currentTT is before initiationTT (node not yet visible).
 */
export function computeNodeAgeTT(initiationTT: number, currentTT: number): number {
  return Math.max(0, currentTT - initiationTT);
}

/**
 * Dev-only assertion: PhytomerNode TT fields are internally consistent.
 * Wires Phase 1 GROWTH-CLOCK-02 / NODE-PHYLLOCHRON-01.
 *
 * production build strips.
 */
export function assertPhytomerStateValid(node: {
  index: number;
  initiationTT?: number;
  visibleTT?: number;
  ageTT?: number;
}, currentTT: number, contextHint?: string): void {
  const where = contextHint ? ` (${contextHint})` : '';
  if (node.initiationTT === undefined || !Number.isFinite(node.initiationTT)) {
    log.warn(`node[${node.index}].initiationTT missing${where}`);
    return;
  }
  if (node.ageTT === undefined || !Number.isFinite(node.ageTT)) {
    log.warn(`node[${node.index}].ageTT missing${where}`);
    return;
  }
  const expected = Math.max(0, currentTT - node.initiationTT);
  // tolerate small floating drift
  if (Math.abs(node.ageTT - expected) > 0.1) {
    log.warn(
      `node[${node.index}].ageTT=${node.ageTT.toFixed(2)} ` +
      `vs expected=${expected.toFixed(2)} (currentTT - initiationTT)${where}`,
    );
  }
}
