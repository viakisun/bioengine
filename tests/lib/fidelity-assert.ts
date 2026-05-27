// Iter 18B PR 1 — Numeric assertion harness + 2-shot self-heal scaffold.
//
// Consumes `window.__skinplantStats` (Iter 18A SSOT #176) and asserts a set
// of named invariants. Used by autonomous PR chain to gate post-conditions.
//
// Self-heal: a Page-side fix candidate runs `attempt(fix)`, then re-checks.
// Up to 2 shots. After both shots fail, the runner emits a [FAIL/SKIP] or
// (for critical PRs) a [CRITICAL-STOP] signal that the orchestrator reads.

import type { Page } from '@playwright/test';

// ── Skinplant stats shape (mirrors StemFamilyTubeNetworkBuilder.stats) ──
export interface SkinplantStats {
  edgeCount: number;
  branchCount: number;
  vertexCount: number;
  triangleCount: number;
  buildMs: number;
  edgesByType: Partial<Record<string, number>>;
  emittedByType: Partial<Record<string, number>>;
  biologicalRadiusByType: Partial<Record<string, { min: number; median: number; max: number; count: number }>>;
  renderRadiusByType: Partial<Record<string, { min: number; median: number; max: number; count: number }>>;
  floatingCandidateCount: number;
  floatingCandidateIds: string[];
}

export interface Invariant {
  name: string;
  check: (stats: SkinplantStats) => boolean;
  message: (stats: SkinplantStats) => string;
}

export interface InvariantReport {
  passed: Invariant[];
  failed: Array<{ inv: Invariant; message: string }>;
}

export function runInvariants(stats: SkinplantStats, invariants: Invariant[]): InvariantReport {
  const passed: Invariant[] = [];
  const failed: Array<{ inv: Invariant; message: string }> = [];
  for (const inv of invariants) {
    if (inv.check(stats)) passed.push(inv);
    else failed.push({ inv, message: inv.message(stats) });
  }
  return { passed, failed };
}

export async function readSkinplantStats(page: Page): Promise<SkinplantStats | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __skinplantStats?: SkinplantStats };
    return w.__skinplantStats ?? null;
  });
}

// ── Pre-defined invariants (Iter 18A baseline + Phase B/C/D extensions) ──

export const INV_FLOATING_ZERO: Invariant = {
  name: 'floatingCandidateCount === 0',
  check: (s) => s.floatingCandidateCount === 0,
  message: (s) =>
    `floatingCandidateCount=${s.floatingCandidateCount} (>0 means child edges aren't anchored to parent surface)`,
};

export const INV_FLOATING_LOW: Invariant = {
  // Iter 18A baseline is 140/151 — drop to <= 140 (no regression).
  name: 'floatingCandidateCount <= 140',
  check: (s) => s.floatingCandidateCount <= 140,
  message: (s) =>
    `floatingCandidateCount=${s.floatingCandidateCount} regressed past Iter 18A baseline (140)`,
};

export const INV_NO_MAIN_STEM_MISSING: Invariant = {
  name: 'mainStem edge emitted',
  check: (s) => (s.emittedByType.mainStem ?? 0) >= 1,
  message: (s) =>
    `mainStem emitted=${s.emittedByType.mainStem ?? 0} (must be >= 1)`,
};

export const INV_GRAPH_EQ_EMITTED: Invariant = {
  name: 'edgesByType == emittedByType for every type',
  check: (s) => {
    for (const t of Object.keys(s.edgesByType)) {
      if ((s.edgesByType[t] ?? 0) !== (s.emittedByType[t] ?? 0)) return false;
    }
    return true;
  },
  message: (s) =>
    `Edge → mesh mismatch: edges=${JSON.stringify(s.edgesByType)} emitted=${JSON.stringify(s.emittedByType)}`,
};

// ── Self-heal scaffold (rule-based, 2-shot) ──

export type ShotResult = { passed: true } | { passed: false; report: InvariantReport };
export type FixAttempt = () => Promise<void>;

export interface HealRule {
  name: string;
  /** Returns a fix attempt if this rule applies, else null. */
  candidate(report: InvariantReport): FixAttempt | null;
}

export interface AllowedFix {
  description: string;
  // Iter 18B SSOT #184 — allowed categories only.
  category:
    | 'typo'
    | 'import'
    | 'type-error'
    | 'test-threshold'
    | 'test-selector'
    | 'test-timing'
    | 'backward-compat-option'
    | 'revert-last-change';
  // Forbidden categories (must NOT be returned by any rule):
  // 'biological-param', 'skeleton-topology', 'radius-auto-increase',
  // 'visual-fudge-factor', 'day-based-scale'.
}

/**
 * Runs invariants → if fail, applies up to 2 fix attempts → re-checks.
 * Returns final report + the number of shots used.
 */
export async function gateWithSelfHeal(
  readStats: () => Promise<SkinplantStats | null>,
  invariants: Invariant[],
  rules: HealRule[],
  shots = 2,
): Promise<{ final: InvariantReport; shotsUsed: number; healed: boolean }> {
  let final: InvariantReport = { passed: [], failed: [] };
  for (let shot = 0; shot <= shots; shot++) {
    const stats = await readStats();
    if (!stats) {
      final = { passed: [], failed: invariants.map((inv) => ({ inv, message: 'no stats available' })) };
      break;
    }
    final = runInvariants(stats, invariants);
    if (final.failed.length === 0) {
      return { final, shotsUsed: shot, healed: shot > 0 };
    }
    if (shot >= shots) break;
    const rule = rules.find((r) => r.candidate(final) !== null);
    if (!rule) break;
    const fix = rule.candidate(final);
    if (!fix) break;
    // eslint-disable-next-line no-console
    console.log(`[fidelity-assert] shot ${shot + 1}: applying rule "${rule.name}"`);
    await fix();
  }
  return { final, shotsUsed: shots, healed: false };
}
