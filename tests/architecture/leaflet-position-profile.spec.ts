// SSOT #203 — Per-Leaflet Position Profile (Iter 39 Phase L2-3).
// See: src/scene/leaf/LeafMeshBuilder.ts, LEAF_MESH_PIPELINE_AUDIT.md Section 4
//
// L2-0 audit 진단: leafletRef.position이 _terminal flag만_ 사용. primary/
// intercalary _shape 차별화 없음_ → 모든 leaflet이 같은 ovate profile + 같은
// lobe/serration → 단조롭고 못생긴 시각 인상.
//
// L2-3 fix: PROFILE_BY_POSITION 도입 (LeafMeshBuilder).
//   terminal     = 가장 elaborate (큰 widthRatio, 깊은 lobe, 많은 serration)
//   primary      = 중간
//   intercalary  = 단순한 보조엽 (얕은 lobe, 적은 serration, round tip)
//   secondary    = primary scaled (현재 disabled)
//
// LEAFLET-POSITION-PROFILE-01 (constants 검증):
//   - terminal.widthRatio    > primary.widthRatio    > intercalary.widthRatio
//   - terminal.lobeDepth     > primary.lobeDepth     > intercalary.lobeDepth
//   - terminal.tipSharpness  > intercalary.tipSharpness
//   - terminal.serrationFreq > intercalary.serrationFreq
//   - terminal.serrationAmp  > intercalary.serrationAmp
//
// 산식 byte-identical 검증 (synthetic) — 미래 누군가 PROFILE을 _flat_으로
// 회귀시키면 즉시 fail.

import { test, expect } from '@playwright/test';
import { PROFILE_BY_POSITION, applyPositionProfile } from '../../src/scene/leaf/LeafletProfile';

test.describe('Per-Leaflet Position Profile (SSOT #203, Iter 39 Phase L2-3)', () => {
  test('LEAFLET-POSITION-PROFILE-01: terminal > primary > intercalary differentiation', () => {
    const t = PROFILE_BY_POSITION.terminal;
    const p = PROFILE_BY_POSITION.primary;
    const i = PROFILE_BY_POSITION.intercalary;

    // widthRatio: terminal 가장 넓음 → intercalary 가장 좁음
    expect(t.widthRatio).toBeGreaterThan(p.widthRatio);
    expect(p.widthRatio).toBeGreaterThan(i.widthRatio);

    // lobeDepth: terminal 가장 깊은 lobe
    expect(t.lobeDepth).toBeGreaterThan(p.lobeDepth);
    expect(p.lobeDepth).toBeGreaterThan(i.lobeDepth);

    // tipSharpness: terminal _더 sharp_ (pointed apex), intercalary round
    expect(t.tipSharpness).toBeGreaterThan(i.tipSharpness);

    // serrationFreq: terminal _더 많은 톱니_
    expect(t.serrationFreq).toBeGreaterThan(i.serrationFreq);

    // serrationAmp: terminal _더 큰 톱니_
    expect(t.serrationAmp).toBeGreaterThan(i.serrationAmp);

    // intercalary는 _단순한 보조엽_ — lobeDepth 절반 이하
    expect(i.lobeDepth).toBeLessThan(t.lobeDepth * 0.6);
  });

  test('applyPositionProfile: position fields가 baseLeafProfile을 덮어쓴다 (병합 순서)', () => {
    const baseLeaf = {
      aspectRatio:   2.0,
      lobeDepth:     0.99,  // baseLeaf 값 — position이 덮어써야
      serrationAmp:  0.99,
      serrationFreq: 99,
      tipSharpness:  9.99,
      baseShape:     0.85,  // leaf-level fallback (position에 없음, 보존)
      asymmetry:     0.1,   // leaf-level fallback
    };

    const terminal = applyPositionProfile(baseLeaf, 'terminal');

    // ★ v3 #3 — position fields가 덮어쓰기.
    expect(terminal.lobeDepth).toBe(PROFILE_BY_POSITION.terminal.lobeDepth);
    expect(terminal.serrationAmp).toBe(PROFILE_BY_POSITION.terminal.serrationAmp);
    expect(terminal.serrationFreq).toBe(PROFILE_BY_POSITION.terminal.serrationFreq);
    expect(terminal.tipSharpness).toBe(PROFILE_BY_POSITION.terminal.tipSharpness);
    // aspectRatio: widthRatio의 역수 매핑.
    expect(terminal.aspectRatio).toBeCloseTo(1 / PROFILE_BY_POSITION.terminal.widthRatio, 6);

    // ★ leaf-level fallback (baseShape, asymmetry)는 _보존_.
    expect(terminal.baseShape).toBe(0.85);
    expect(terminal.asymmetry).toBe(0.1);
  });

  test('applyPositionProfile: intercalary가 단순한 보조엽 — terminal보다 _덜_ elaborate', () => {
    const baseLeaf = {
      aspectRatio:   2.0,
      lobeDepth:     0.1,
      serrationAmp:  0.03,
      serrationFreq: 18,
      tipSharpness:  1.5,
      baseShape:     0.85,
      asymmetry:     0.1,
    };

    const terminal    = applyPositionProfile(baseLeaf, 'terminal');
    const intercalary = applyPositionProfile(baseLeaf, 'intercalary');

    expect(terminal.lobeDepth).toBeGreaterThan(intercalary.lobeDepth);
    expect(terminal.tipSharpness).toBeGreaterThan(intercalary.tipSharpness);
    expect(terminal.serrationFreq).toBeGreaterThan(intercalary.serrationFreq);
  });
});
