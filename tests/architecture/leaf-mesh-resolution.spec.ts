// SSOT #205 — Leaf Mesh Resolution Quality Profile (Iter 39 Phase L2-4b).
// See: src/scene/leaf/LeafletProfile.ts:LEAF_MESH_RESOLUTION
//
// 사용자 v3 #5: 전역 상수 _금지_. quality profile dict + flag.
//   default 'low' (production 회귀 0) + 'high' opt-in (hero/near plant).
//
// 후속: LOD 시스템 또는 SceneOptions에서 production-side quality 변경.

import { test, expect } from '@playwright/test';
import {
  LEAF_MESH_RESOLUTION,
  DEFAULT_LEAF_MESH_QUALITY,
  qualityFromDistance,
} from '../../src/scene/leaf/LeafletProfile';

test.describe('Leaf Mesh Resolution (SSOT #205, Iter 39 Phase L2-4b + L6-B-2)', () => {
  test('LEAF-MESH-RESOLUTION-01: default low + high opt-in + ultra-low (L6-B-2)', () => {
    // Default = low (production 회귀 0).
    expect(DEFAULT_LEAF_MESH_QUALITY).toBe('low');

    // ultra-low < low < high (lengthSegs 8 < 15 < 22, samples 9 < 16 < 23).
    expect(LEAF_MESH_RESOLUTION['ultra-low'].shapeProfileSamples).toBe(9);
    expect(LEAF_MESH_RESOLUTION.low.shapeProfileSamples).toBe(16);
    expect(LEAF_MESH_RESOLUTION.high.shapeProfileSamples).toBe(23);

    // Monotonic increase
    expect(LEAF_MESH_RESOLUTION.low.shapeProfileSamples).toBeGreaterThan(
      LEAF_MESH_RESOLUTION['ultra-low'].shapeProfileSamples,
    );
    expect(LEAF_MESH_RESOLUTION.high.shapeProfileSamples).toBeGreaterThan(
      LEAF_MESH_RESOLUTION.low.shapeProfileSamples,
    );
  });

  test('LEAF-LOD-SWITCH-01: qualityFromDistance threshold (L6-B-2)', () => {
    // near < 5m → 'high'
    expect(qualityFromDistance(0)).toBe('high');
    expect(qualityFromDistance(2.5)).toBe('high');
    expect(qualityFromDistance(4.99)).toBe('high');

    // mid 5~15m → 'low'
    expect(qualityFromDistance(5)).toBe('low');
    expect(qualityFromDistance(10)).toBe('low');
    expect(qualityFromDistance(14.99)).toBe('low');

    // far >= 15m → 'ultra-low'
    expect(qualityFromDistance(15)).toBe('ultra-low');
    expect(qualityFromDistance(30)).toBe('ultra-low');
    expect(qualityFromDistance(100)).toBe('ultra-low');
  });
});
