import { createLogger } from '../utils/logger';
const log = createLogger('growth');
// Iter 30 Phase 1-Pre — NodeGrowthContext minimum schema (5 fields).
//
// Plan §2 (sleepy-growing-pretzel.md):
//   "PhytomerNode가 자기 axis context를 알게 함. 최소 4 필드부터."
//   사용자 review 2번 (v6) → axisId 추가 → 5 필드.
//
// 사용자 권장 16 필드 NodeGrowthContext를 단일 PR에 추가하면 검증 가능 단위
// 위반. Phase별 _점진 확대_ 패턴 (Iter 29 5-필드 → Phase 2A 9-필드).
//
// Phase 1-Pre 5 필드:
//   axisId           — main / side:N 식별
//   localStemRadiusMm — axis-local stem radius at this node
//   axisCapacityFactor — Phase 1 Axis Capacity 계산 결과 0.35~1.0
//   isSideShoot      — main / side 분기 trigger
//   parentVigorFactor — side-shoot only; main = 1.0
//
// Phase 3+ 확장 후보 (Plan §16.4):
//   nodeVigorFactor / sourceSinkFactor / reproductiveCompetitionFactor /
//   parentAxisId / parentNodeIndex / axisLengthCm / basalStemRadiusMm /
//   axisOrganDemand / axisStructuralCapacity (이미 axisCapacityFactor로 흡수)
//
// ★ Dependency-free boundary: 본 모듈은 ModelRegistry 등 application 의존성
// 없음. 테스트가 stub object로 호출 가능 (Iter 29 패턴 동일).

/**
 * Axis identifier convention.
 * - `'main'` — main stem axis
 * - `'side:N'` — N-th side shoot (0-based) in traversal order
 *
 * Phase 0.B에서 axisIdx 기반 lookup이지만, Phase 1-Pre부터 axisId로
 * canonical reference. SIDE-SHOOT-AXIS-ID-01 invariant (Phase 0.B에서
 * acceptance 추가됨)가 axisId consistency 보장.
 */
export type AxisId = `main` | `side:${number}`;

/**
 * Per-node growth context — axis-level capacity + side-shoot allocation
 * information propagated to each PhytomerNode.
 *
 * Phase 1-Pre minimum (5 fields). Phase 3+ extensions:
 *   - nodeVigorFactor (Phase 3 per-axis source-sink proxy)
 *   - sourceSinkFactor (Phase 3 axisSourceFactor)
 *   - reproductiveCompetitionFactor (Phase 4 truss vs leaf demand)
 */
export interface NodeGrowthContext {
  /** Axis identifier ('main' or 'side:N'). */
  axisId: AxisId;
  /** Axis-local stem radius at this node (mm). */
  localStemRadiusMm: number;
  /**
   * 0.35-1.0 — axis structural capacity 대비 leaf demand 충분도.
   * 1.0 = capacity 여유, 0.35 = 심각 부족.
   * Phase 1 Axis Capacity Model에서 계산. Phase 1-Pre default = 1.0.
   */
  axisCapacityFactor: number;
  /** main axis = false, side shoot = true. */
  isSideShoot: boolean;
  /**
   * Side-shoot only: parent (main axis) node의 vigor (0-1.5).
   * Main axis면 1.0.
   * Phase 4 Side-shoot Allocation Factor에서 사용.
   */
  parentVigorFactor: number;
}

/**
 * Default growth context for backward compat. NodeState에 growthContext
 * 미설정 시 자동 적용.
 */
export const DEFAULT_NODE_GROWTH_CONTEXT: NodeGrowthContext = {
  axisId: 'main',
  localStemRadiusMm: 8,
  axisCapacityFactor: 1.0,
  isSideShoot: false,
  parentVigorFactor: 1.0,
};

/**
 * Helper — make growth context for main-axis node.
 * Phase 1 Axis Capacity Model에서 axisCapacityFactor만 계산해 주입.
 */
export function makeMainAxisGrowthContext(input: {
  localStemRadiusMm: number;
  axisCapacityFactor?: number;
}): NodeGrowthContext {
  return {
    axisId: 'main',
    localStemRadiusMm: input.localStemRadiusMm,
    axisCapacityFactor: input.axisCapacityFactor ?? 1.0,
    isSideShoot: false,
    parentVigorFactor: 1.0,
  };
}

/**
 * Helper — make growth context for side-shoot node.
 * Phase 4 Side-shoot Allocation에서 parentVigorFactor 주입.
 */
export function makeSideShootGrowthContext(input: {
  sideShootIndex: number;
  localStemRadiusMm: number;
  axisCapacityFactor?: number;
  parentVigorFactor?: number;
}): NodeGrowthContext {
  return {
    axisId: `side:${input.sideShootIndex}`,
    localStemRadiusMm: input.localStemRadiusMm,
    axisCapacityFactor: input.axisCapacityFactor ?? 1.0,
    isSideShoot: true,
    parentVigorFactor: input.parentVigorFactor ?? 1.0,
  };
}

/**
 * Dev-only assertion — NodeGrowthContext 5 fields 모두 정의됨 +
 * axisCapacityFactor [0.35, 1.0] 범위.
 *
 * Wires Phase 1-Pre NODE-GROWTH-CONTEXT-01.
 */
export function assertGrowthContextValid(
  ctx: NodeGrowthContext,
  contextHint?: string,
): void {
  const where = contextHint ? ` (${contextHint})` : '';
  if (!ctx.axisId) {
    log.warn(`axisId missing${where}`);
    return;
  }
  if (!ctx.axisId.match(/^(main|side:\d+)$/)) {
    log.warn(`axisId malformed${where}: ${ctx.axisId}`);
  }
  if (!Number.isFinite(ctx.localStemRadiusMm) || ctx.localStemRadiusMm < 0) {
    log.warn(`localStemRadiusMm invalid${where}: ${ctx.localStemRadiusMm}`);
  }
  if (
    !Number.isFinite(ctx.axisCapacityFactor) ||
    ctx.axisCapacityFactor < 0.35 - 1e-6 ||
    ctx.axisCapacityFactor > 1.0 + 1e-6
  ) {
    log.warn(`axisCapacityFactor out of [0.35, 1.0]${where}: ${ctx.axisCapacityFactor}`);
  }
  if (
    !Number.isFinite(ctx.parentVigorFactor) ||
    ctx.parentVigorFactor < 0 ||
    ctx.parentVigorFactor > 1.5
  ) {
    log.warn(`parentVigorFactor out of [0, 1.5]${where}: ${ctx.parentVigorFactor}`);
  }
  // isSideShoot consistency with axisId
  const axisIsMain = ctx.axisId === 'main';
  if (axisIsMain && ctx.isSideShoot) {
    log.warn(`isSideShoot=true but axisId='main'${where}`);
  }
  if (!axisIsMain && !ctx.isSideShoot) {
    log.warn(`isSideShoot=false but axisId='${ctx.axisId}'${where}`);
  }
}
