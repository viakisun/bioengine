// EngineMode — feature flag separating legacy (sigmoid-primary) from
// hybrid (physiology-primary) compute paths during the v3.0 migration.
//
// Why this exists: the visual pipeline (GrowthModel.computePlantState)
// historically owns the truss/fruit slot layout via sigmoids, and
// overlayPhysiologyFruits() decorates it with CoreModel mass/diameter.
// The v3.0 plan inverts this so CoreModel's FruitCohort drives visual
// fruit state directly. The two paths coexist during Phase 0-3 so we
// can snapshot the legacy baseline before flipping the default.

export type EngineMode = 'legacyGrowthMode' | 'hybridFspmMode';

/**
 * Active engine mode. Default 'legacyGrowthMode' during Phase 0-2.
 * Phase 3 flips the default to 'hybridFspmMode' once visual = physiology
 * fruit routing lands. Phase 8 removes the legacy path entirely.
 */
export let ACTIVE_ENGINE_MODE: EngineMode = 'legacyGrowthMode';

export function setEngineMode(mode: EngineMode): void {
  ACTIVE_ENGINE_MODE = mode;
}
