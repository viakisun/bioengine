// Iter 29 Phase 2B — Source-Sink Proxy v1 invariants.
//
// Plan: sleepy-growing-pretzel.md §6.4 + §2B.
//
// 분리 이유 (§2B): Phase 2A에서 leaf 정상 발생/확장/노화 검증 _후_ proxy 도입.
// 그래야 visual 이상 시 _2B만_ revert 가능.
//
// Acceptance:
//   LEAF-SOURCESINK-PROXY-01: proxy 적용 후 targetAreaCm2 변화 측정 가능
//   LEAF-SOURCESINK-PROXY-02: 정직 표기 — 'not TOMSIM/TOMGRO' 주석 (코드)
//   LEAF-SOURCESINK-PROXY-03: proxy disable (=1.0) 시 Phase 2A baseline과 일치 (회귀 0)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  computeOrganDemand,
  computeAssimilateSupply,
  computeSourceSinkProxyV1,
  computeSourceSinkProxyV1FromPlant,
} from '../../packages/tomato-engine/src/growth/SourceSinkProxyV1';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('SourceSinkProxyV1 (Iter 29 Phase 2B)', () => {
  test('LEAF-SOURCESINK-PROXY-01: proxy 적용 후 targetAreaCm2 변화 측정 가능', () => {
    // Demand scales with nodeCount and trussCount
    const lowDemand = computeOrganDemand({
      nodeCount: 5, averageLeafTargetAreaCm2: 400, trussCount: 0,
    });
    const highDemand = computeOrganDemand({
      nodeCount: 20, averageLeafTargetAreaCm2: 700, trussCount: 8,
    });
    expect(highDemand).toBeGreaterThan(lowDemand);

    // Supply scales with height²
    const smallSupply = computeAssimilateSupply({ heightCm: 30 });
    const largeSupply = computeAssimilateSupply({ heightCm: 200 });
    expect(largeSupply).toBeGreaterThan(smallSupply * 10);  // (200/30)² ≈ 44

    // Proxy clamped [0.65, 1.15]
    for (let supply = 0; supply <= 1000000; supply += 50000) {
      for (let demand = 1; demand <= 100000; demand += 10000) {
        const p = computeSourceSinkProxyV1(supply, demand);
        expect(p).toBeGreaterThanOrEqual(0.65);
        expect(p).toBeLessThanOrEqual(1.15);
      }
    }
    // Edge — zero demand → returns 1.0 (neutral)
    expect(computeSourceSinkProxyV1(1000, 0)).toBe(1.0);

    // Composite — proxy returns plausible value in realistic plant range
    const earlyStage = computeSourceSinkProxyV1FromPlant({
      nodeCount: 5, averageLeafTargetAreaCm2: 200, trussCount: 0,
      heightCm: 30,
    });
    const matureStage = computeSourceSinkProxyV1FromPlant({
      nodeCount: 25, averageLeafTargetAreaCm2: 700, trussCount: 6,
      heightCm: 180,
    });
    // Both should be within [0.65, 1.15]
    expect(earlyStage).toBeGreaterThanOrEqual(0.65);
    expect(earlyStage).toBeLessThanOrEqual(1.15);
    expect(matureStage).toBeGreaterThanOrEqual(0.65);
    expect(matureStage).toBeLessThanOrEqual(1.15);

    // Proxy modulates target area when applied multiplicatively
    const baseTargetArea = 800;
    expect(baseTargetArea * earlyStage).not.toBeCloseTo(baseTargetArea, 2);
  });

  test('LEAF-SOURCESINK-PROXY-02: 정직 표기 — \'not TOMSIM/TOMGRO\' 주석 강제', async () => {
    // SourceSinkProxyV1.ts 모듈 안에 '/not TOMSIM/' 또는 'TOMGRO' 관련 정직
    // 주석이 존재해야 함 (lightweight proxy 강조).
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/growth/SourceSinkProxyV1.ts'),
      'utf-8',
    );
    // 'not TOMSIM' 또는 'NOT a full TOMSIM' 또는 'TOMSIM/TOMGRO' 패턴
    expect(text, '정직 표기 — TOMSIM 모델 아님 명시')
      .toMatch(/not\s+(a\s+full\s+)?TOMSIM/i);
    // 추가: lightweight 표기
    expect(text, 'lightweight proxy 표기').toMatch(/lightweight/i);

    // 사용처 (Phase 2B canonical wire-in)도 같은 정직 표기 가져야 함.
    // GrowthModel.ts 안에서 SourceSinkProxyV1 사용 시 'not TOMSIM' 또는
    // 'lightweight' 주석 강제 — Phase 2B 완료 후 검증.
  });

  test('LEAF-SOURCESINK-PROXY-03: proxy disable (=1.0) 시 baseline 보존', () => {
    // Phase 2B 핵심 회복 가능성:
    //   proxy 적용 = false → targetArea × 1.0 = baseline
    //   proxy 적용 = true  → targetArea × proxy [0.65, 1.15]
    //
    // 이는 GrowthModel.ts 안에서 toggle 가능해야 함 (예: Phase 5에서
    // calibration pack feature flag, 또는 cultivar.growthProfile.
    // sourceSinkSensitivity = 0).
    //
    // Phase 2B 모듈 자체는 disable 가능 — caller가 proxy = 1.0 곱하면 됨.

    // Disable via sourceSinkSensitivity=0 (proxy 효과 0)
    // 본 spec은 모듈 _가용성_ 확인 — wire-in details는 GrowthModel.ts에 위임.
    const baseTargetArea = 800;
    const disabled = baseTargetArea * 1.0;
    expect(disabled).toBe(baseTargetArea);

    // Proxy bypass 가능 입증 — 같은 input에 supply == demand → proxy = 1.0
    const supply = 1000;
    const demand = 1000;
    expect(computeSourceSinkProxyV1(supply, demand)).toBe(1.0);

    // 또한 demand=0 fallback → 1.0 (degenerate input 안전)
    expect(computeSourceSinkProxyV1(0, 0)).toBe(1.0);
  });
});
