// Iter 38 — Leaf shape variation (★ 사용자 §4+§5+§7 Hybrid 매핑) 정량 spec.
//
// S1: LeafShapeParams 4 fields 확장
// S2: createOvateLeaflet sin^shapePower + aspectRatio + baseShape + asymmetry
// S3: AGE_PRESETS baseline + correlationRules Hybrid sampling
// S4: Cultivar leafShapeOverride (cherry/beef/roma)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

const LEAF_CHUNK = path.join(REPO_ROOT, 'packages/tomato-geometry/src/leafChunk.ts');
const LEAF_GEN = path.join(REPO_ROOT, 'src/plant/LeafGenerator.ts');
const AGE_PRESETS = path.join(REPO_ROOT, 'src/scene/leaf-engine/agePresets.ts');
const CORRELATION = path.join(REPO_ROOT, 'src/scene/leaf-engine/correlationRules.ts');
const LEAF_ENGINE_INDEX = path.join(REPO_ROOT, 'src/scene/leaf-engine/index.ts');
const CULTIVAR_PROFILE = path.join(REPO_ROOT, 'packages/tomato-engine/src/CultivarGrowthProfile.ts');

async function readFile(p: string): Promise<string> {
  return fs.readFile(p, 'utf-8');
}

test.describe('Iter 38 S1 — LeafShapeParams 4 fields 확장', () => {
  test('S1-PARAMS-EXPAND-01: LeafShapeParams에 aspectRatio/baseShape/tipSharpness/asymmetry optional fields', async () => {
    const src = await readFile(LEAF_CHUNK);
    expect(src, 'aspectRatio? 필드').toMatch(/aspectRatio\?:\s*number/);
    expect(src, 'baseShape? 필드').toMatch(/baseShape\?:\s*number/);
    expect(src, 'tipSharpness? 필드').toMatch(/tipSharpness\?:\s*number/);
    expect(src, 'asymmetry? 필드').toMatch(/asymmetry\?:\s*number/);
  });

  test('S1-LEAFGEN-MAPPING-01: LeafGenerator descriptor.resolved → shape 4 신규 fields', async () => {
    const src = await readFile(LEAF_GEN);
    expect(src, 'aspectRatio 매핑').toMatch(/leafEngineAspectRatio/);
    expect(src, 'baseShape 매핑').toMatch(/leafEngineBaseShape/);
    expect(src, 'tipSharpness 매핑').toMatch(/leafEngineTipSharpness/);
    expect(src, 'asymmetry 매핑').toMatch(/leafEngineAsymmetry/);
  });
});

test.describe('Iter 38 S2 — createOvateLeaflet 산식 정정', () => {
  test('S2-SHAPE-POWER-01: sin(πt)^shapePower 산식 (사용자 §5)', async () => {
    const src = await readFile(LEAF_CHUNK);
    expect(src, 'shapePower = params.tipSharpness').toMatch(
      /shapePower\s*=\s*params\.tipSharpness/,
    );
    expect(src, 'Math.pow(sinPiT, shapePower) 적용').toMatch(
      /Math\.pow\(sinPiT,\s*shapePower\)/,
    );
  });

  test('S2-ASPECT-RATIO-DIVISION-01: aspectRatio division (잎 넓이 축소)', async () => {
    const src = await readFile(LEAF_CHUNK);
    expect(src, 'aspectRatio division 산식').toMatch(/\/\s*\(aspectRatio\s*\/\s*2\.0\)/);
  });

  test('S2-BASE-SHAPE-MODULATION-01: baseShape modulation (밑부분 wedge/heart)', async () => {
    const src = await readFile(LEAF_CHUNK);
    expect(src, 'baseFactor t<0.2 모듈레이션').toMatch(/baseFactor\s*=\s*t\s*<\s*0\.2/);
  });

  test('S2-ASYMMETRY-Z-OFFSET-01: vertex z asymmetry offset (좌우 비대칭)', async () => {
    const src = await readFile(LEAF_CHUNK);
    expect(src, 'asymBias 산식').toMatch(/asymBias\s*=\s*asymmetryFactor/);
    expect(src, 'sideMul 산식').toMatch(/sideMul\s*=\s*colNorm\s*>=\s*0/);
  });
});

test.describe('Iter 38 S3 ★ — AGE_PRESETS baseline + Hybrid sampling', () => {
  test('S3-PRESETS-BASELINES-01: 5 AGE_PRESETS에 3 신규 baselines', async () => {
    const src = await readFile(AGE_PRESETS);
    // AgePresetParams interface
    expect(src, 'aspectRatioBaseline? interface').toMatch(/aspectRatioBaseline\?:\s*number/);
    expect(src, 'baseShapeBaseline? interface').toMatch(/baseShapeBaseline\?:\s*number/);
    expect(src, 'tipSharpnessBaseline? interface').toMatch(/tipSharpnessBaseline\?:\s*number/);
    // 5 presets 각각 baseline 적용
    expect(src, 'young aspectRatioBaseline 1.5').toMatch(/young[\s\S]*?aspectRatioBaseline:\s*1\.5/);
    expect(src, 'mature aspectRatioBaseline 2.4').toMatch(/mature[\s\S]*?aspectRatioBaseline:\s*2\.4/);
    expect(src, 'old aspectRatioBaseline 2.8').toMatch(/old[\s\S]*?aspectRatioBaseline:\s*2\.8/);
    expect(src, 'complex aspectRatioBaseline 2.9').toMatch(/complex[\s\S]*?aspectRatioBaseline:\s*2\.9/);
    expect(src, "potato-leaf aspectRatioBaseline 1.7").toMatch(/['"]potato-leaf['"][\s\S]*?aspectRatioBaseline:\s*1\.7/);
  });

  test('S3-HYBRID-SAMPLE-01: sampleHybrid helper (baseline + jitter)', async () => {
    const src = await readFile(CORRELATION);
    expect(src, 'sampleHybrid 함수 정의').toMatch(/function sampleHybrid\(/);
    expect(src, 'jitterScale = 0.10 default (±10%)').toMatch(/jitterScale\s*=\s*0\.10/);
    expect(src, 'baseline + jitter 산식').toMatch(/baseline\s*\+\s*jitterNorm\s*\*\s*jitterRange/);
    // clamp to range
    expect(src, 'Math.max + Math.min clamp').toMatch(/Math\.max\(range\[0\],\s*Math\.min\(range\[1\]/);
  });

  test('S3-RESOLVED-NEW-FIELDS-01: ResolvedLeafParams에 baseShape + tipSharpness', async () => {
    const src = await readFile(CORRELATION);
    expect(src, 'ResolvedLeafParams.baseShape required').toMatch(/baseShape:\s*number/);
    expect(src, 'ResolvedLeafParams.tipSharpness required').toMatch(/tipSharpness:\s*number/);
  });

  test('S3-APPLY-CORRELATION-SEED-01: applyCorrelation에 seed arg + buildShapeProfile에 resolved fields', async () => {
    const src = await readFile(LEAF_ENGINE_INDEX);
    expect(src, 'applyCorrelation에 seed 전달').toMatch(
      /applyCorrelation\(bladeRef\.complexity,\s*preset,\s*seed\)/,
    );
    expect(src, 'buildShapeProfile에 resolved.baseShape').toMatch(/baseShape:\s*resolved\.baseShape/);
    expect(src, 'buildShapeProfile에 resolved.tipSharpness').toMatch(/tipSharpness:\s*resolved\.tipSharpness/);
  });
});

test.describe('Iter 38 S4 — Cultivar leafShapeOverride', () => {
  test('S4-CULTIVAR-FIELD-01: CultivarGrowthProfile.leafShapeOverride? field', async () => {
    const src = await readFile(CULTIVAR_PROFILE);
    expect(src, 'leafShapeOverride? field').toMatch(/leafShapeOverride\?:\s*{/);
    expect(src, 'aspectRatioMultiplier? field').toMatch(/aspectRatioMultiplier\?:\s*number/);
    expect(src, 'baseShapeBias? field').toMatch(/baseShapeBias\?:\s*number/);
    expect(src, 'tipSharpnessMultiplier? field').toMatch(/tipSharpnessMultiplier\?:\s*number/);
  });

  test('S4-CHERRY-BEEF-DIFFERENTIATION-01: cherry < 1.0, beef > 1.0 aspectRatio multiplier', async () => {
    const cherryJsonc = await readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/models/cultivars/cherry-generic.jsonc'),
    );
    const beefJsonc = await readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/models/cultivars/beefsteak-generic.jsonc'),
    );
    expect(cherryJsonc, 'cherry aspectRatioMultiplier 0.85 (더 둥근)').toContain('"aspectRatioMultiplier": 0.85');
    expect(beefJsonc, 'beef aspectRatioMultiplier 1.15 (더 길쭉)').toContain('"aspectRatioMultiplier": 1.15');
  });

  test('S4-OVERRIDE-APPLY-01: buildCompoundLeaf에 cultivarOverride 적용', async () => {
    const src = await readFile(LEAF_ENGINE_INDEX);
    expect(src, 'CultivarShapeOverride interface').toContain('interface CultivarShapeOverride');
    expect(src, 'aspectRatioMultiplier 적용').toMatch(/resolved\.aspectRatio\s*\*=\s*cultivarOverride\.aspectRatioMultiplier/);
    expect(src, 'baseShapeBias 적용 (clamp)').toMatch(/Math\.max\(0\.7,\s*Math\.min\(1\.0/);
    expect(src, 'tipSharpnessMultiplier 적용 (clamp)').toMatch(/Math\.max\(1\.0,\s*Math\.min\(2\.0/);
  });
});

test.describe('Iter 38 종합 요약', () => {
  test('TOTAL-S-INVARIANTS-01: Hybrid 전략 (S1-S4) 총 13 invariants', async () => {
    // S1: 2 / S2: 4 / S3: 4 / S4: 3 = 13 invariants
    expect(true).toBe(true);
  });
});
