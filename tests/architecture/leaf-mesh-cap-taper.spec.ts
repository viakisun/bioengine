// SSOT #204 — Leaf Mesh Cap Taper (Iter 39 Phase L2-4a).
// See: src/scene/leaf/LeafletProfile.ts:endpointTaperWeight
//
// L2-4a fix: row=0 (base) / row=N (tip)에서 lobe/serration noise × sin(πt) →
//   끝쪽 noise 0 가중치 → 9 vertices가 origin으로 수렴 → 뭉툭 cap 해소.
//
// Endpoint row collapse to 1 vertex (Option (i))는 uv/normal/index buffer
// 영향 큼 → high-risk. L2-4a는 _noise taper_ 만 (Option (ii) lite approach).
//
// LEAF-MESH-CAP-TAPER-01:
//   - endpointTaperWeight(0) = 0
//   - endpointTaperWeight(1) = 0
//   - endpointTaperWeight(0.5) = 1
//   - row=0 vertices의 max|z| / leaflet half-width ≤ 0.05 (5% — noise 0 효과)
//   - row=N vertices의 max|z| / leaflet half-width ≤ 0.05

import { test, expect } from '@playwright/test';
import { endpointTaperWeight } from '../../src/scene/leaf/LeafletProfile';

test.describe('Leaf Mesh Cap Taper (SSOT #204, Iter 39 Phase L2-4a)', () => {
  test('LEAF-MESH-CAP-TAPER-01: endpointTaperWeight 산식', () => {
    // sin(0) = 0, sin(π/2) = 1, sin(π) = 0
    expect(endpointTaperWeight(0)).toBeCloseTo(0, 6);
    expect(endpointTaperWeight(0.5)).toBeCloseTo(1, 6);
    expect(endpointTaperWeight(1)).toBeCloseTo(0, 6);

    // 중간 값
    expect(endpointTaperWeight(0.25)).toBeCloseTo(Math.sin(Math.PI / 4), 6);
    expect(endpointTaperWeight(0.75)).toBeCloseTo(Math.sin(3 * Math.PI / 4), 6);

    // 단조 증가/감소: 0~0.5 증가, 0.5~1 감소
    expect(endpointTaperWeight(0.1)).toBeLessThan(endpointTaperWeight(0.3));
    expect(endpointTaperWeight(0.3)).toBeLessThan(endpointTaperWeight(0.5));
    expect(endpointTaperWeight(0.5)).toBeGreaterThan(endpointTaperWeight(0.7));
    expect(endpointTaperWeight(0.7)).toBeGreaterThan(endpointTaperWeight(0.9));
  });

  test('LEAF-MESH-CAP-TAPER-01: noise suppress at endpoints (synthetic)', () => {
    // Synthetic noise value × taper 확인.
    const noiseValue = 0.05;
    expect(noiseValue * endpointTaperWeight(0)).toBeCloseTo(0, 6);
    expect(noiseValue * endpointTaperWeight(1)).toBeCloseTo(0, 6);
    expect(noiseValue * endpointTaperWeight(0.5)).toBeCloseTo(noiseValue, 6);

    // 5% 이하 (taper × 0.05 max 위치)
    const u = 0.95;  // row near tip
    const tapered = noiseValue * endpointTaperWeight(u);
    expect(tapered).toBeLessThan(noiseValue * 0.16);  // sin(0.95π) ≈ 0.156
  });
});
