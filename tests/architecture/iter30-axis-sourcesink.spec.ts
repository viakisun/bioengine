// Iter 30 Phase 3 — Per-axis SourceSinkProxy + sourceSinkSensitivity invariants.
//
// Plan §5 (sleepy-growing-pretzel.md).
//
// Acceptance:
//   AXIS-SOURCESINK-PROXY-01: side-shoot axisSource < main axis (parent vigor 차)
//   AXIS-SOURCESINK-PROXY-PARENT-VIGOR-01: parent vigor 종속
//   LEAF-ALLOCATION-AXIS-SS-01: allocation에 axisSourceFactor 포함
//   SOURCESINK-SENSITIVITY-USED-01: cultivar.sourceSinkSensitivity가 산식에 실제 사용

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  computeAxisSourceSinkProxyV1,
  computeSourceSinkProxyV1FromPlant,
} from '../../packages/tomato-engine/src/growth/SourceSinkProxyV1';
import {
  composeLeafAllocation,
} from '../../packages/tomato-engine/src/growth/LeafGrowthModel';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 30 Phase 3 — Per-axis SourceSinkProxy', () => {
  test('AXIS-SOURCESINK-PROXY-01: side-shoot proxy < main (same plant)', () => {
    // Main axis: large stem, long axis
    const mainProxy = computeAxisSourceSinkProxyV1({
      axisLeafCount: 10,
      axisAvgLeafTargetAreaCm2: 500,
      axisTrussCount: 3,
      axisMeanStemRadiusMm: 9,
      axisLengthCm: 150,
      parentVigorFactor: 1.0,
    });
    // Side-shoot: small stem, short axis, lower parent vigor
    const sideProxy = computeAxisSourceSinkProxyV1({
      axisLeafCount: 5,
      axisAvgLeafTargetAreaCm2: 400,
      axisTrussCount: 0,
      axisMeanStemRadiusMm: 4,
      axisLengthCm: 30,
      parentVigorFactor: 0.7,
    });
    expect(sideProxy, `side ${sideProxy.toFixed(2)} < main ${mainProxy.toFixed(2)}`).toBeLessThan(mainProxy);
    // Both in clamp range
    expect(mainProxy).toBeGreaterThanOrEqual(0.5);
    expect(mainProxy).toBeLessThanOrEqual(1.15);
    expect(sideProxy).toBeGreaterThanOrEqual(0.5);
    expect(sideProxy).toBeLessThanOrEqual(1.15);
  });

  test('AXIS-SOURCESINK-PROXY-PARENT-VIGOR-01: parent vigor 증가 시 proxy 증가', () => {
    // 입력은 _supply ≈ demand_ 영역으로 — vigor 차이가 clamp 안 충돌 없이 보이도록.
    const baseInput = {
      axisLeafCount: 5,
      axisAvgLeafTargetAreaCm2: 400,
      axisTrussCount: 0,
      axisMeanStemRadiusMm: 8,    // larger stem
      axisLengthCm: 100,           // longer axis
    };
    const weak = computeAxisSourceSinkProxyV1({ ...baseInput, parentVigorFactor: 0.5 });
    const strong = computeAxisSourceSinkProxyV1({ ...baseInput, parentVigorFactor: 1.5 });
    expect(strong, `strong parent ${strong.toFixed(2)} > weak ${weak.toFixed(2)}`).toBeGreaterThan(weak);
  });

  test('LEAF-ALLOCATION-AXIS-SS-01: allocation에 axisSourceFactor 포함', () => {
    const a = composeLeafAllocation({
      plantSourceFactor: 1.0,
      axisSourceFactor: 0.8,  // ★ Phase 3 신규 인자
      axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 1.0,
      stressFactor: 1.0,
    });
    expect(a.axisSourceFactor).toBe(0.8);
    expect(a.finalAllocationFactor).toBeCloseTo(0.8, 4);

    // Default: axisSourceFactor omit → 1.0 (backward compat)
    const aMain = composeLeafAllocation({
      plantSourceFactor: 1.0,
      axisCapacityFactor: 1.0,
      sideShootAllocationFactor: 1.0,
      stressFactor: 1.0,
    });
    expect(aMain.axisSourceFactor).toBe(1.0);

    // limitationReason 'axis_source_limited' 가능
    const sourceLimit = composeLeafAllocation({
      plantSourceFactor: 1.0,
      axisSourceFactor: 0.5,  // 가장 낮음
      axisCapacityFactor: 0.9,
      sideShootAllocationFactor: 0.9,
      stressFactor: 0.9,
    });
    expect(sourceLimit.limitationReason).toBe('axis_source_limited');
  });

  test('SOURCESINK-SENSITIVITY-USED-01: cultivar.sourceSinkSensitivity가 demand에 적용', () => {
    // Same supply/demand structure, 다른 sensitivity → 다른 proxy
    const baseInput = {
      nodeCount: 10,
      averageLeafTargetAreaCm2: 600,
      trussCount: 3,
      heightCm: 100,
      stressFactor: 0,
    };
    const lowSens = computeSourceSinkProxyV1FromPlant({ ...baseInput, sourceSinkSensitivity: 0.30 });
    const highSens = computeSourceSinkProxyV1FromPlant({ ...baseInput, sourceSinkSensitivity: 0.45 });
    // higher sensitivity → demand 가중↑ → proxy 낮아짐
    expect(highSens, `high sens ${highSens.toFixed(3)} ≤ low sens ${lowSens.toFixed(3)}`)
      .toBeLessThanOrEqual(lowSens);

    // Default: 0.35 → multiplier 1.0
    const defaultSens = computeSourceSinkProxyV1FromPlant({ ...baseInput });
    const explicitDefault = computeSourceSinkProxyV1FromPlant({ ...baseInput, sourceSinkSensitivity: 0.35 });
    expect(defaultSens).toBe(explicitDefault);

    // Axis variant 도 sensitivity 반영
    const axisLow = computeAxisSourceSinkProxyV1({
      axisLeafCount: 5, axisAvgLeafTargetAreaCm2: 400, axisTrussCount: 0,
      axisMeanStemRadiusMm: 5, axisLengthCm: 50, parentVigorFactor: 1.0,
      sourceSinkSensitivity: 0.30,
    });
    const axisHigh = computeAxisSourceSinkProxyV1({
      axisLeafCount: 5, axisAvgLeafTargetAreaCm2: 400, axisTrussCount: 0,
      axisMeanStemRadiusMm: 5, axisLengthCm: 50, parentVigorFactor: 1.0,
      sourceSinkSensitivity: 0.45,
    });
    expect(axisHigh).toBeLessThanOrEqual(axisLow);

    // Source check — wire-in 위치
    return fs.readFile(path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'), 'utf-8')
      .then((text) => {
        expect(text, 'cultivar.growthProfile.sourceSinkSensitivity wire-in')
          .toMatch(/sourceSinkSensitivity:\s*cultivar\.growthProfile\.sourceSinkSensitivity/);
        expect(text, 'computeAxisSourceSinkProxyV1 호출').toMatch(/computeAxisSourceSinkProxyV1\(/);
        expect(text, 'axisSourceFactor allocation에 반영').toMatch(/axisSourceFactor:\s*sideAxisSourceProxy/);
      });
  });
});
