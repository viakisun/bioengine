// ★ S142 — Leaf mesh config invariants.
//
// meshConfig SSOT (tomato.json) 가 무너지지 않도록 4 contract:
//   01: 3 required preset 모두 존재
//   02: baseline = 이전 hardcoded 값 1:1 parity (회귀 0)
//   03: 알 수 없는 URL preset 는 default fallback
//   04: monotonic baseline ≥ lite ≥ aggressive (samples & cols)
//
// Playwright test runner 사용하지만 browser context 없음 — pure logic.

import { test, expect } from '@playwright/test';
import { getLeafSpec, getActiveMeshPreset } from '../../src/data/leaf';

test('LEAF-MESH-CONFIG-01: 3 required presets present + valid default', () => {
  const { meshConfig } = getLeafSpec('tomato.json');
  expect(meshConfig.presets.baseline).toBeDefined();
  expect(meshConfig.presets.lite).toBeDefined();
  expect(meshConfig.presets.aggressive).toBeDefined();
  // ★ S142-D — default 'lite'로 채택 (회귀 0 + leaf verts -47% 측정 검증 후).
  expect(['baseline', 'lite', 'aggressive']).toContain(meshConfig.default);
});

test('LEAF-MESH-CONFIG-02: baseline = previous hardcoded values (parity)', () => {
  const { baseline } = getLeafSpec('tomato.json').meshConfig.presets;
  // V1 — LeafletProfile.ts L35-41 이전 값.
  expect(baseline.v1).toEqual({ ultraLowSamples: 9, lowSamples: 16, highSamples: 23 });
  // V2 — LeafMeshBuilder2.ts L274-278 이전 값.
  expect(baseline.v2).toEqual({ ultraLowSamples: 28, lowSamples: 40, highSamples: 56 });
  // cols는 V2 BGT 전용 — LeafMeshBuilder2.ts L573에서 hardcoded 17 (S95).
  // V1 (legacy)은 자체 LEAFLET_PLANE_COLS=9 hardcode 유지 (preset 영향 0).
  expect(baseline.cols).toBe(17);
});

test('LEAF-MESH-CONFIG-03: invalid URL preset falls back to default', () => {
  const spec = getLeafSpec('tomato.json');
  const { key } = getActiveMeshPreset(spec, 'unknown');
  expect(key).toBe(spec.meshConfig.default);

  const { key: emptyKey } = getActiveMeshPreset(spec, '');
  expect(emptyKey).toBe(spec.meshConfig.default);

  // Valid override는 통과
  const { key: liteKey } = getActiveMeshPreset(spec, 'lite');
  expect(liteKey).toBe('lite');
});

test('LEAF-MESH-CONFIG-04: monotonic baseline > lite > aggressive', () => {
  const { baseline, lite, aggressive } = getLeafSpec('tomato.json').meshConfig.presets;
  // V1 samples — 각 quality 별로 monotonic
  expect(baseline.v1.lowSamples).toBeGreaterThan(lite.v1.lowSamples);
  expect(lite.v1.lowSamples).toBeGreaterThan(aggressive.v1.lowSamples);
  // V2 samples
  expect(baseline.v2.lowSamples).toBeGreaterThan(lite.v2.lowSamples);
  expect(lite.v2.lowSamples).toBeGreaterThan(aggressive.v2.lowSamples);
  // cols
  expect(baseline.cols).toBeGreaterThan(lite.cols);
  expect(lite.cols).toBeGreaterThan(aggressive.cols);
});
