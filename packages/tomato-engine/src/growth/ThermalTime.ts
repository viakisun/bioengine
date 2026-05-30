// Iter 29 Phase 1 — ThermalTime module (canonical growth clock).
//
// Plan §2 (sleepy-growing-pretzel.md): `PlantState.currentTT`는 canonical
// growth time state. All `node.initiationTT`, `node.ageTT`, `leaf.ageTT`,
// `senescenceProgress`는 currentTT에서 파생.
//
// Formula:
//   GDD_day = max(0, T_mean - T_base)
//   plant.currentTT += GDD_day
//
// T_base = 10°C (cultivar override 가능).
//
// ★ Module boundary (Phase 1 GROWTH-MODULE-BOUNDARY-01):
//   본 모듈은 GrowthModel.ts에서 _분리_된 thermal time 산식. GrowthModel은
//   본 모듈을 호출만 — TT 산식 자체는 본 파일에서 _유지_. 향후 학술 모델
//   교체 (e.g. nonlinear GDD) 시 본 파일만 수정.
//
// 기존 자산 통합: SimulationContext.ts의 approximateTT() / phytomerCountFromTT()는
// PhytomerModel.ts에서 사용. 본 파일은 단일 일자 GDD + 누적 helper.
//
// ★ Dependency-free boundary: 본 모듈은 ModelRegistry 등 application/JSONC
// loader 의존성 없음. Pure function + 상수만. 테스트 환경(Playwright Node
// loader)에서 직접 import 가능.

/**
 * Cardinal temperature ceiling for tomato development above which thermal
 * accumulation saturates. Default 30°C matches Heuvelink 1996 / TOMSIM
 * canonical. Caller may override via `T_max_C` param if calibration pack
 * (Phase 6) supplies a tuned value.
 */
const DEFAULT_T_MAX_DEV_C = 30;

/**
 * GDD-day computation. Tomato canonical: T_base = 10°C (cultivar override).
 * Above-T_base accumulation only (cold tolerance via floor at 0). T_max
 * ceiling at 30°C (high-temp saturation).
 *
 * @param T_mean_C  mean daily temperature (°C)
 * @param T_base_C  cultivar base temperature (default 10°C)
 * @param T_max_C   cardinal ceiling (default 30°C)
 * @returns GDD for one day
 */
export function computeGDDDay(
  T_mean_C: number,
  T_base_C: number = 10,
  T_max_C: number = DEFAULT_T_MAX_DEV_C,
): number {
  const T_eff = Math.max(0, Math.min(T_max_C, T_mean_C) - T_base_C);
  return T_eff;
}

/**
 * Accumulate one day's worth of TT (GDD).
 *
 * @param prevTT       prior accumulated TT
 * @param T_mean_C     mean daily temperature
 * @param T_base_C     cultivar base temperature
 * @param T_max_C      cardinal ceiling
 * @returns updated TT
 */
export function accumulateTT(
  prevTT: number,
  T_mean_C: number,
  T_base_C: number = 10,
  T_max_C: number = DEFAULT_T_MAX_DEV_C,
): number {
  return prevTT + computeGDDDay(T_mean_C, T_base_C, T_max_C);
}

/**
 * Dev-only assertion: currentTT is canonical growth time state, must be
 * non-negative and finite. Production build strips.
 *
 * Wires Phase 1 invariant GROWTH-CLOCK-01.
 */
export function assertCanonicalTT(currentTT: number, contextHint?: string): void {
  if (typeof currentTT !== 'number' || !Number.isFinite(currentTT) || currentTT < 0) {
    const where = contextHint ? ` (${contextHint})` : '';
    console.warn(`[ThermalTime] assertCanonicalTT failed${where}: currentTT=${currentTT}`);
  }
}

// SimulationContext.approximateTT / phytomerCountFromTT — depend on
// ACTIVE_MODEL (ModelRegistry / JSONC loader chain). Callers that need
// them import from SimulationContext directly; this module stays
// dependency-free so architecture invariant tests can load it.
