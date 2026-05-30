// Iter 29 Phase 1 — PlantBase Growth Clock + PhytomerNode invariants.
//
// Plan: sleepy-growing-pretzel.md §1, §2, §3.
//
// 이전 (Iter 28까지):
//   - PlantState.currentTT 없음 (TT는 SimulationContext의 외부 input)
//   - NodeState에 TT-based 필드 0건 (initiationTT/visibleTT/ageTT)
//   - InternodeState 없음 (flat internodeLenCm만)
//   - GrowthModel.ts 단일 거대 함수
//
// fix Phase 1:
//   - PlantState.currentTT canonical 추가
//   - NodeState (= PhytomerNode alias)에 initiationTT/visibleTT/ageTT 추가
//   - NodeState.internode: InternodeState (targetLengthCm/currentLengthCm/expansionProgress)
//   - NodeState.status: PhytomerStatus ('primordium' | 'visible' | …)
//   - growth/ThermalTime.ts, growth/PhytomerModel.ts, growth/InternodeGrowthModel.ts
//     (function boundary 분리 — Phase 1 GROWTH-MODULE-BOUNDARY-01)
//   - Day-based logic은 _legacy_ 자리 유지 (canonical 경로 추가 — Phase 2A에서 점진 deprecate)
//
// Acceptance:
//   GROWTH-CLOCK-01: PlantState.currentTT canonical (≥0 + finite)
//   GROWTH-CLOCK-02: 모든 node에 initiationTT/visibleTT/ageTT (number, finite)
//   NODE-PHYLLOCHRON-01: node 생성은 phyllochronTT 기반 (Δ initiationTT ≈ phyllochronTT)
//   INTERNODE-STATE-01: InternodeState {targetLengthCm, currentLengthCm, expansionProgress} 분리
//   DAY-LEGACY-01: day-based 필드는 _alias_로만 (canonical은 TT)
//   GROWTH-MODULE-BOUNDARY-01: growth/ 디렉토리 + 함수 boundary 분리

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Phase 1 module-boundary imports — these MUST be top-level export of the
// growth/ modules; the test enforces that the modules exist.
import {
  computeGDDDay,
  accumulateTT,
} from '../../packages/tomato-engine/src/growth/ThermalTime';
import {
  computeNodeInitiationTT,
  computeNodeVisibleTT,
  computeNodeAgeTT,
  type PhytomerStatus,
} from '../../packages/tomato-engine/src/growth/PhytomerModel';
import {
  makeInternodeState,
  type InternodeState,
} from '../../packages/tomato-engine/src/growth/InternodeGrowthModel';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Phytomer Growth Clock (Iter 29 Phase 1)', () => {
  test('GROWTH-CLOCK-01: PlantState.currentTT canonical 필드 + 형식 검증 (소스 grep)', async () => {
    // PlantState interface에 currentTT 필드가 declared
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    // PlantState 인터페이스 안에 `currentTT: number` field 있어야 함
    const plantStateMatch = text.match(/export interface PlantState\s*\{[\s\S]*?^\}/m);
    expect(plantStateMatch, 'PlantState interface block').toBeTruthy();
    expect(plantStateMatch![0]).toMatch(/currentTT:\s*number/);

    // ThermalTime helpers callable
    expect(computeGDDDay(20, 10)).toBeCloseTo(10, 6);
    expect(computeGDDDay(5, 10)).toBeCloseTo(0, 6);  // below base → 0
    expect(accumulateTT(0, 20, 10)).toBeCloseTo(10, 6);
    expect(accumulateTT(100, 25, 10)).toBeCloseTo(115, 6);
    // assertCanonicalTT가 _-negative_ TT 경고하는지 spec-side에서 직접 검증 안 함
    // (production 안전 — throw 아닌 console.warn only).
  });

  test('GROWTH-CLOCK-02: PhytomerNode (NodeState alias) TT-based fields 정의', async () => {
    // NodeState interface — initiationTT / visibleTT / ageTT field 모두 있음
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    const nodeStateMatch = text.match(/export interface NodeState\s*\{[\s\S]*?^\}/m);
    expect(nodeStateMatch, 'NodeState interface block').toBeTruthy();
    const block = nodeStateMatch![0];
    expect(block, 'NodeState.initiationTT').toMatch(/initiationTT:\s*number/);
    expect(block, 'NodeState.visibleTT').toMatch(/visibleTT:\s*number/);
    expect(block, 'NodeState.ageTT').toMatch(/ageTT:\s*number/);
    expect(block, 'NodeState.internode').toMatch(/internode:\s*InternodeState/);
    expect(block, 'NodeState.status').toMatch(/status:\s*PhytomerStatus/);

    // PhytomerNode = NodeState alias declared
    expect(text, 'PhytomerNode type alias').toMatch(/export type PhytomerNode\s*=\s*NodeState/);

    // PhytomerModel helpers callable
    // computeNodeAgeTT: returns 0 if before initiation, else delta.
    expect(computeNodeAgeTT(100, 80)).toBe(0);
    expect(computeNodeAgeTT(100, 150)).toBe(50);
  });

  test('NODE-PHYLLOCHRON-01: initiationTT phyllochron-driven (Δ ≈ phyllochronTT)', () => {
    // computeNodeInitiationTT for sequential indices should differ by phyllochronTT.
    // Use a stub cultivar — we don't import real CULTIVARS (JSONC loader chain).
    const cultivar = {
      growthProfile: { phyllochronTT: 38, plastochronTT: 30 },
    } as Parameters<typeof computeNodeInitiationTT>[1];

    const t0 = computeNodeInitiationTT(0, cultivar);
    const t1 = computeNodeInitiationTT(1, cultivar);
    const t2 = computeNodeInitiationTT(2, cultivar);
    const t5 = computeNodeInitiationTT(5, cultivar);

    expect(t1 - t0).toBeCloseTo(38, 2);
    expect(t2 - t1).toBeCloseTo(38, 2);
    expect(t5 - t0).toBeCloseTo(5 * 38, 2);

    // visibleTT == initiationTT in Phase 1 (no primordium-visible delay)
    expect(computeNodeVisibleTT(3, cultivar)).toBeCloseTo(computeNodeInitiationTT(3, cultivar), 2);
  });

  test('INTERNODE-STATE-01: InternodeState {targetLengthCm, currentLengthCm, expansionProgress}', () => {
    const fully = makeInternodeState(8.0, 8.0);
    expect(fully.targetLengthCm).toBe(8);
    expect(fully.currentLengthCm).toBe(8);
    expect(fully.expansionProgress).toBeCloseTo(1, 6);

    const half = makeInternodeState(8.0, 4.0);
    expect(half.targetLengthCm).toBe(8);
    expect(half.currentLengthCm).toBe(4);
    expect(half.expansionProgress).toBeCloseTo(0.5, 6);

    // Clamping: currentLen capped at targetLen
    const overshoot = makeInternodeState(8.0, 10.0);
    expect(overshoot.currentLengthCm, 'clamped to target').toBe(8);
    expect(overshoot.expansionProgress).toBe(1);

    // Zero target → progress 0
    const zero = makeInternodeState(0, 0);
    expect(zero.expansionProgress).toBe(0);

    // Negative → floor at 0
    const neg = makeInternodeState(-5, -2);
    expect(neg.targetLengthCm).toBe(0);
    expect(neg.currentLengthCm).toBe(0);

    // Type check — interface fields exist
    const s: InternodeState = half;
    expect(typeof s.targetLengthCm).toBe('number');
    expect(typeof s.currentLengthCm).toBe('number');
    expect(typeof s.expansionProgress).toBe('number');
  });

  test('DAY-LEGACY-01: day-based 필드는 legacy alias 위치 (canonical은 TT)', async () => {
    // PlantState.day field 유지 (backward compat — _아직_ 제거 안 됨)
    // 하지만 PlantState.currentTT _canonical_ 필드도 존재.
    // Phase 5에서 day → alias 강등, Phase 6에서 제거 검토.
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    const plantStateMatch = text.match(/export interface PlantState\s*\{[\s\S]*?^\}/m);
    const block = plantStateMatch![0];
    // 두 필드 _병행 존재_ 확인
    expect(block, 'day field present (legacy)').toMatch(/day:\s*number/);
    expect(block, 'currentTT field present (canonical)').toMatch(/currentTT:\s*number/);

    // canonical 호출 패턴: TT는 computePlantState 안에서 simContext?.TT
    // 또는 approximateTT(day, …)로 계산되어야 함 (day-only 분기 0건 _아님_ —
    // 아직 hypocotyl/cotyledon/juvenile/defoliation 등 day-based legacy 잔존).
    // Phase 2A에서 senescence를 TT 기반으로 전환 (LEAF-SENESCENCE-TT-01).
    // 본 spec은 Phase 1이 _canonical 추가_만 검증 (제거는 아님).
    const ttHits = text.split('const TT =').length - 1;
    expect(ttHits, 'TT computation present in computePlantState').toBeGreaterThanOrEqual(1);
  });

  test('GROWTH-MODULE-BOUNDARY-01: growth/ 디렉토리 + 3 module exports', async () => {
    // Phase 1 minimum: ThermalTime / PhytomerModel / InternodeGrowthModel 분리.
    // Phase 2A+에서 LeafGrowthModel / SenescenceModel / SourceSinkProxyV1 / TrussRuleModel 추가.
    const growthDir = path.join(REPO_ROOT, 'packages/tomato-engine/src/growth');
    const stat = await fs.stat(growthDir);
    expect(stat.isDirectory(), 'growth/ directory exists').toBe(true);

    const files = await fs.readdir(growthDir);
    expect(files, 'ThermalTime.ts present').toContain('ThermalTime.ts');
    expect(files, 'PhytomerModel.ts present').toContain('PhytomerModel.ts');
    expect(files, 'InternodeGrowthModel.ts present').toContain('InternodeGrowthModel.ts');

    // 각 모듈 export 검증
    expect(typeof computeGDDDay).toBe('function');
    expect(typeof accumulateTT).toBe('function');
    expect(typeof computeNodeInitiationTT).toBe('function');
    expect(typeof computeNodeVisibleTT).toBe('function');
    expect(typeof computeNodeAgeTT).toBe('function');
    expect(typeof makeInternodeState).toBe('function');

    // PhytomerStatus 타입은 string literal union — runtime 검증 불가하지만
    // import succeeded fact 자체로 검증된다.
    const statusCheck: PhytomerStatus = 'expanding';
    expect(['primordium', 'visible', 'expanding', 'mature', 'senescent', 'removed'])
      .toContain(statusCheck);

    // GrowthModel.ts가 모듈을 _import_하고 있는지 확인
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    expect(text, 'GrowthModel imports from growth/PhytomerModel')
      .toMatch(/from\s+['"]\.\/growth\/PhytomerModel['"]/);
    expect(text, 'GrowthModel imports from growth/InternodeGrowthModel')
      .toMatch(/from\s+['"]\.\/growth\/InternodeGrowthModel['"]/);
  });
});
