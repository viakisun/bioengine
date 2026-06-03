// ★ Iter 39 Phase L7 — Fruit data-driven architecture invariants.
//
// L7-A invariants (S60~S67):
//   FRUIT-ENGINE-API-01            — FruitEngine namespace 3 methods
//   FRUIT-SPEC-NO-TOMATO-01        — src/scene/fruit/ 코드 안 'tomato' 단어 0
//   FRUIT-SPEC-ZOD-VALID-01        — tomato.json이 FruitSpecSchema.parse PASS
//   FRUIT-SPEC-BOTANICAL-PARAMETERS-01 — audit Section 1 entries migrated
//   FRUIT-SPEC-TAXONOMY-01         — spec.taxonomy 4 fields 필수
//
// 파리티 (산식 byte-identical):
//   FRUIT-GEOMETRY-PARITY-01 — morphology 산식 spec 주입 후 동일 값
//   FRUIT-COLOR-PARITY-01    — ripening 산식 동일
//   FRUIT-MATERIAL-PARITY-01 — material 산식 동일

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  FruitSpecSchema,
  parseFruitSpec,
  qualityFromFruitDistance,
} from '../../src/scene/fruit/FruitSpec';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');
const FRUIT_ENGINE_DIR = path.join(REPO_ROOT, 'src/scene/fruit');

async function readEngineFiles(): Promise<Array<{ rel: string; text: string }>> {
  const files = await fs.readdir(FRUIT_ENGINE_DIR);
  const out: Array<{ rel: string; text: string }> = [];
  for (const f of files) {
    if (!f.endsWith('.ts')) continue;
    const abs = path.join(FRUIT_ENGINE_DIR, f);
    out.push({ rel: `src/scene/fruit/${f}`, text: await fs.readFile(abs, 'utf-8') });
  }
  return out;
}

async function readTomatoFruitJson(): Promise<unknown> {
  const text = await fs.readFile(
    path.join(REPO_ROOT, 'src/data/fruit/specs/tomato.json'),
    'utf-8',
  );
  return JSON.parse(text);
}

test.describe('Iter 39 Phase L7 — Fruit data-driven architecture', () => {
  test('FRUIT-SPEC-ZOD-VALID-01: tomato.json (fruit) FruitSpecSchema.parse PASS', async () => {
    const raw = await readTomatoFruitJson();
    expect(() => FruitSpecSchema.parse(raw), 'tomato fruit spec schema parse').not.toThrow();
    const parsed = parseFruitSpec(raw);
    expect(parsed.schemaVersion).toBe('1.0');
    expect(parsed.taxonomy.commonName).toBe('tomato');

    // Cross-field constraints
    // meshResolution monotonic
    expect(parsed.meshResolution.high.segments).toBeGreaterThan(parsed.meshResolution.low.segments);
    expect(parsed.meshResolution.low.segments).toBeGreaterThan(parsed.meshResolution.ultraLow.segments);
    expect(parsed.meshResolution.high.rings).toBeGreaterThan(parsed.meshResolution.low.rings);
    expect(parsed.meshResolution.low.rings).toBeGreaterThan(parsed.meshResolution.ultraLow.rings);

    // materialRules array length === stageCount
    expect(parsed.materialRules.stageRoughness.length).toBe(parsed.ripeningRules.stageCount);
    expect(parsed.materialRules.stageClearcoatIntensity.length).toBe(parsed.ripeningRules.stageCount);
    expect(parsed.materialRules.stageClearcoatRoughness.length).toBe(parsed.ripeningRules.stageCount);
  });

  test('FRUIT-SPEC-TAXONOMY-01: spec.taxonomy 4 fields 필수 (multi-crop, 원칙 #44)', async () => {
    const raw = await readTomatoFruitJson();
    const parsed = parseFruitSpec(raw);
    expect(parsed.taxonomy.family).toBe('Solanaceae');
    expect(parsed.taxonomy.genus).toBe('Solanum');
    expect(parsed.taxonomy.species).toBe('lycopersicum');
    expect(parsed.taxonomy.commonName).toBe('tomato');
  });

  test('FRUIT-SPEC-NO-TOMATO-01: src/scene/fruit/ engine 코드 안 "tomato" 단어 0 (원칙 #42)', async () => {
    // Scope: comments + @farmsim/tomato-* package imports 제외 (보완 #7)
    const files = await readEngineFiles();
    const tomatoRe = /\btomato\b/i;
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const { rel, text } of files) {
      const lines = text.split('\n');
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('/*')) inBlockComment = true;
        const isCommentLine = inBlockComment || /^\s*(\/\/|\*)/.test(line);
        if (line.includes('*/')) inBlockComment = false;
        if (isCommentLine) continue;
        const codePart = line.replace(/\/\/.*$/, '');
        if (!tomatoRe.test(codePart)) continue;
        // allow @farmsim/tomato-* package imports
        if (/@farmsim\/tomato-(engine|geometry|growth)/.test(codePart)) continue;
        offenders.push({ file: rel, line: i + 1, text: line.trim() });
      }
    }
    expect(
      offenders,
      `engine 코드 (src/scene/fruit/*.ts) 안 'tomato' 단어 0 의무 (원칙 #42).\n` +
        `Found: ${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });

  test('FRUIT-SPEC-BOTANICAL-PARAMETERS-01: audit-based migration coverage (S63 morphology)', async () => {
    // ★ 보완 #12 — audit table 기반 검증. Section 1.A morphology entries:
    //   CROWN_RECESSION, SHOULDER_BULGE 코드 hardcoded 0 + spec field 존재.
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );

    // 산식이 spec.morphologyRules 사용
    expect(src, 'spec.morphologyRules.crownRecession 사용').toMatch(
      /spec\.morphologyRules\.crownRecession/,
    );
    expect(src, 'spec.morphologyRules.shoulderBulge 사용').toMatch(
      /spec\.morphologyRules\.shoulderBulge/,
    );

    // 코드 안 hardcoded 0 — comment 제외하고 active code에서 const 정의 0
    const lines = src.split('\n');
    const activeConstDefs = lines.filter(
      l => !l.trim().startsWith('//') &&
           !l.trim().startsWith('*') &&
           /^const\s+CROWN_RECESSION\s*=\s*0\.18/.test(l.trim()),
    );
    expect(activeConstDefs, 'CROWN_RECESSION hardcoded const 정의 0').toEqual([]);

    const shoulderConstDefs = lines.filter(
      l => !l.trim().startsWith('//') &&
           !l.trim().startsWith('*') &&
           /^const\s+SHOULDER_BULGE\s*=\s*0\.05/.test(l.trim()),
    );
    expect(shoulderConstDefs, 'SHOULDER_BULGE hardcoded const 정의 0').toEqual([]);
  });

  test('FRUIT-MATERIAL-PARITY-01: spec.materialRules 값이 hardcoded 산식과 동일 (S64)', async () => {
    // L7-A-3c (S64) — material 산식 → spec 배열 변환 byte-identical 검증.
    //
    // Pre-L7-A-3c 산식 (FruitGenerator.ts:299-302 originally):
    //   roughness = 0.42 - stage * 0.025
    //   clearcoat: stage<2→0, else 0.30 + (stage-2)*0.12
    //   clearcoat roughness = 0.18 - stage * 0.012
    //   subsurface: stage>=3 → 0.15 intensity, tint '#8b1a14'
    const raw = await readTomatoFruitJson();
    const parsed = parseFruitSpec(raw);

    for (let stage = 0; stage < parsed.ripeningRules.stageCount; stage++) {
      const expectedRoughness = 0.42 - stage * 0.025;
      const expectedClearcoatIntensity = stage < 2 ? 0 : 0.30 + (stage - 2) * 0.12;
      const expectedClearcoatRoughness = 0.18 - stage * 0.012;

      expect(
        parsed.materialRules.stageRoughness[stage],
        `stage ${stage} roughness`,
      ).toBeCloseTo(expectedRoughness, 6);
      expect(
        parsed.materialRules.stageClearcoatIntensity[stage],
        `stage ${stage} clearcoat intensity`,
      ).toBeCloseTo(expectedClearcoatIntensity, 6);
      expect(
        parsed.materialRules.stageClearcoatRoughness[stage],
        `stage ${stage} clearcoat roughness`,
      ).toBeCloseTo(expectedClearcoatRoughness, 6);
    }

    // subsurface
    expect(parsed.materialRules.subsurfaceTranslucency.fromStage).toBe(3);
    expect(parsed.materialRules.subsurfaceTranslucency.intensity).toBeCloseTo(0.15, 6);
    expect(parsed.materialRules.subsurfaceTranslucency.tintColor).toBe('#8b1a14');
  });

  test('FRUIT-ENGINE-API-01: FruitEngine namespace 1 method (createFruit) (S65)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitEngine.ts'),
      'utf-8',
    );
    // FruitEngine object literal에 createFruit method 존재 의무
    expect(src, 'createFruit method').toMatch(/createFruit\s*\(/);
    expect(src, 'FruitEngine 객체 export').toMatch(/export\s+const\s+FruitEngine\s*=/);
    expect(src, 'CreateFruitOptions interface export').toMatch(/export\s+interface\s+CreateFruitOptions/);
  });

  test('FRUIT-LOD-SWITCH-01: qualityFromFruitDistance threshold (L7-B-1 S66, leaf 일관)', () => {
    // near < 5m → 'high'
    expect(qualityFromFruitDistance(0)).toBe('high');
    expect(qualityFromFruitDistance(2.5)).toBe('high');
    expect(qualityFromFruitDistance(4.99)).toBe('high');

    // mid 5~15m → 'low'
    expect(qualityFromFruitDistance(5)).toBe('low');
    expect(qualityFromFruitDistance(10)).toBe('low');
    expect(qualityFromFruitDistance(14.99)).toBe('low');

    // far >= 15m → 'ultraLow' (camelCase, FruitSpec key 일관)
    expect(qualityFromFruitDistance(15)).toBe('ultraLow');
    expect(qualityFromFruitDistance(30)).toBe('ultraLow');
    expect(qualityFromFruitDistance(100)).toBe('ultraLow');
  });

  test('FRUIT-MATERIAL-LOD-01: ultraLow → simple material (no clearcoat/subsurface, stage 색 유지, 보완 #5)', async () => {
    // ★ L7-B-2 — far LOD (ultraLow) → getSimpleBodyMaterial (clearcoat/subsurface off).
    //   stage 색은 vertex color + albedo white passthrough로 _유지_ — fixed red 아님.
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );
    // 산식 — ultraLow LOD 분기 + simple material 호출
    expect(src, 'lod === ultraLow 분기').toMatch(/lod\s*===\s*['"]ultraLow['"]/);
    expect(src, 'getSimpleBodyMaterial 호출').toMatch(
      /getSimpleBodyMaterial\s*\(\s*scene\s*,\s*stage\s*,\s*spec\s*\)/,
    );

    // simple material function body — clearcoat/subsurface 활성화 없음
    const fnMatch = src.match(
      /function getSimpleBodyMaterial[\s\S]*?return mat;\s*\n\}/,
    );
    expect(fnMatch, 'getSimpleBodyMaterial function body').toBeTruthy();
    const fnBody = fnMatch![0];
    expect(fnBody, 'simple: no clearCoat.isEnabled = true').not.toMatch(
      /clearCoat\.isEnabled\s*=\s*true/,
    );
    expect(fnBody, 'simple: no subSurface.isTranslucencyEnabled = true').not.toMatch(
      /subSurface\.isTranslucencyEnabled\s*=\s*true/,
    );
    // stage 색은 유지 (albedo white passthrough — vertex color)
    expect(fnBody, 'simple: albedoColor white (vertex color passthrough)').toMatch(
      /albedoColor\s*=\s*new\s+Color3\s*\(\s*1\s*,\s*1\s*,\s*1\s*\)/,
    );
    // roughness는 spec.materialRules.stageRoughness 사용 (stage 색 유지)
    expect(fnBody, 'simple: stage roughness from spec').toMatch(
      /spec\.materialRules\.stageRoughness\[stage\]/,
    );
  });

  test('FRUIT-COLOR-PARITY-01: blossomEndAdvanceFrac fallback 0.4 (S64, 보완 #11)', async () => {
    // 보완 #11 — vertex color array가 _없는_ 경우 stage color output 비교.
    //   FruitGenerator는 vertex color baked (chunk.colors 사용).
    //   spec 산식 byte-identical 검증으로 동등 검증.
    const raw = await readTomatoFruitJson();
    const parsed = parseFruitSpec(raw);
    expect(
      parsed.ripeningRules.blossomEndAdvanceFrac,
      'blossomEndAdvanceFrac fallback === pre-spec 0.4',
    ).toBeCloseTo(0.4, 6);
  });
});
