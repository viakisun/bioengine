// SSOT #205 — Leaf Mesh Resolution Quality Profile (Iter 39 Phase L2-4b).
// See: src/scene/leaf-engine/leafletPositionProfile.ts:LEAF_MESH_RESOLUTION
//
// 사용자 v3 #5: 전역 상수 _금지_. quality profile dict + flag.
//   default 'low' (production 회귀 0) + 'high' opt-in (hero/near plant).
//
// 후속: LOD 시스템 또는 SceneOptions에서 production-side quality 변경.

import { test, expect } from '@playwright/test';
import {
  LEAF_MESH_RESOLUTION,
  DEFAULT_LEAF_MESH_QUALITY,
} from '../../src/scene/leaf-engine/leafletPositionProfile';

test.describe('Leaf Mesh Resolution (SSOT #205, Iter 39 Phase L2-4b)', () => {
  test('LEAF-MESH-RESOLUTION-01: default low + high opt-in 구조', () => {
    // Default = low (production 회귀 0).
    expect(DEFAULT_LEAF_MESH_QUALITY).toBe('low');

    // Low = current production (lengthSegs 15 → samples 16).
    expect(LEAF_MESH_RESOLUTION.low.shapeProfileSamples).toBe(16);

    // High = +44% (lengthSegs 22 → samples 23).
    expect(LEAF_MESH_RESOLUTION.high.shapeProfileSamples).toBe(23);

    // High > low — increase 보장.
    expect(LEAF_MESH_RESOLUTION.high.shapeProfileSamples).toBeGreaterThan(
      LEAF_MESH_RESOLUTION.low.shapeProfileSamples,
    );
  });
});
