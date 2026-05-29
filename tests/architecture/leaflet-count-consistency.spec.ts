// Iter 29 Phase 0 — leafletCount path consistency invariant.
//
// Bug catch: 이전 GrowthModel.ts는 5/7/9 분기 (EARLY_TRUE 단계 1-3 leaflet
// _건너뜀_), LeafStage.ts는 1→3→5→7→9 진화. 두 path 불일치.
//
// Fix: leafletCountFromMaturity() 단일 source of truth. 본 spec은
//   1) leafletCountFromMaturity 자체 진화 (1→3→5→7→9) 검증
//   2) maturity < 0.4 → leafletCount ∈ {1, 2, 3}
//   3) LeafStage.getLeafStage가 동일 함수 사용
//   4) 어떤 LeafStage도 COTYLEDON 반환 안 함 (node[0]은 EARLY_TRUE)

import { test, expect } from '@playwright/test';
import {
  leafletCountFromMaturity,
  getLeafStage,
  LeafStage,
} from '../../packages/tomato-engine/src/LeafStage';

test.describe('LeafletCount Path Consistency (Iter 29 Phase 0)', () => {
  test('LEAFLET-CONSISTENCY-01: leafletCountFromMaturity 진화 1→3→5→7→9', () => {
    // EARLY_TRUE: 1 → 3
    expect(leafletCountFromMaturity(0.0)).toBeCloseTo(1, 1);
    expect(leafletCountFromMaturity(0.2)).toBeCloseTo(2, 1);
    expect(leafletCountFromMaturity(0.39)).toBeCloseTo(3, 0);

    // COMPOUND boundary
    expect(leafletCountFromMaturity(0.4)).toBeCloseTo(5, 1);
    expect(leafletCountFromMaturity(0.7)).toBeCloseTo(7, 1);
    expect(leafletCountFromMaturity(1.0)).toBeCloseTo(9, 1);

    // 단조 증가
    let prev = 0;
    for (let m = 0; m <= 1; m += 0.05) {
      const c = leafletCountFromMaturity(m);
      expect(c).toBeGreaterThanOrEqual(prev - 0.01);
      prev = c;
    }
  });

  test('LEAFLET-EARLY-01: maturity < 0.4 → rounded leafletCount ∈ {1, 2, 3}', () => {
    for (let m = 0.05; m < 0.4; m += 0.03) {
      const c = Math.round(leafletCountFromMaturity(m));
      expect([1, 2, 3]).toContain(c);
    }
  });

  test('LEAFLET-BIAS-01: leafletCountBias 양수 → leafletCount 증가', () => {
    const base = leafletCountFromMaturity(0.3, 0);
    const biased = leafletCountFromMaturity(0.3, 1);
    expect(biased).toBeGreaterThan(base);
  });

  test('COT-CLASS-01: getLeafStage 어떤 NodeState에도 COTYLEDON 반환 안 함', () => {
    interface MinimalNodeState {
      index: number;
      leafMaturity: number;
      yellowing: number;
      leafletCount: number;
    }
    const samples: MinimalNodeState[] = [
      { index: 0, leafMaturity: 0.05, yellowing: 0, leafletCount: 1 },
      { index: 0, leafMaturity: 0.1, yellowing: 0, leafletCount: 1 },
      { index: 0, leafMaturity: 0.25, yellowing: 0, leafletCount: 2 },
      { index: 0, leafMaturity: 0.3, yellowing: 0, leafletCount: 3 },
      { index: 1, leafMaturity: 0.1, yellowing: 0, leafletCount: 1 },
    ];
    for (const s of samples) {
      const info = getLeafStage(s as never, 5);
      expect(info.stage, `index=${s.index} maturity=${s.leafMaturity}`).not.toBe(LeafStage.COTYLEDON);
    }
  });

  test('LEAFLET-PATH-PARITY-01: getLeafStage leafletCount == leafletCountFromMaturity(maturity, 0)', () => {
    interface MinimalNodeState {
      index: number;
      leafMaturity: number;
      yellowing: number;
      leafletCount: number;
    }
    for (let m = 0.06; m < 1; m += 0.05) {
      const node: MinimalNodeState = { index: 1, leafMaturity: m, yellowing: 0, leafletCount: 0 };
      const info = getLeafStage(node as never, 10);
      const expected = leafletCountFromMaturity(m);
      // SENESCENT/PRUNED 예외 (yellowing=0이라 발생 안 함, leafMaturity > 0.05이라 PRUNED 안 됨)
      expect(info.leafletCount, `maturity=${m}`).toBeCloseTo(expected, 3);
    }
  });
});
