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
const TRUSS_GENERATOR_PATH = path.join(REPO_ROOT, 'src/plant/TrussGenerator.ts');

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

    // Phase 1 realism patch optional controls stay generic and fallback-safe.
    expect(parsed.morphologyRules.coherentAsymmetryAmp).toBeGreaterThan(0);
    expect(parsed.morphologyRules.topDepressionRange).toEqual([0, 0.045]);
    expect(parsed.morphologyRules.shoulderFullnessRange).toEqual([0.94, 1.1]);
    expect(parsed.morphologyRules.bottomRoundness).toBeCloseTo(0.38, 6);
    expect(parsed.morphologyRules.visualHeightWidthClamp).toEqual([0.82, 0.96]);
    expect(parsed.morphologyRules.stemEndAnchorCos).toBeCloseTo(0.94, 6);
    expect(parsed.morphologyRules.depressionBand).toEqual([0.86, 0.98]);
    expect(parsed.morphologyRules.socketTintBand).toEqual([0.88, 0.985]);
    expect(parsed.morphologyRules.socketDarkeningStrength).toBeCloseTo(0.28, 6);
    expect(parsed.morphologyRules.socketTintStrength).toBeCloseTo(0.16, 6);
    expect(parsed.ripeningRules.shoulderRetentionFrac).toBeCloseTo(0.45, 6);
    expect(parsed.ripeningRules.blushStrength).toBeCloseTo(0.32, 6);
    expect(parsed.ripeningRules.mottleSigma).toBeCloseTo(0.012, 6);
    expect(parsed.ripeningRules.ripeColor).toBe('#b92d22');
    expect(parsed.ripeningRules.visualPatchStrength).toBeCloseTo(0.16, 6);
    expect(parsed.ripeningRules.visualPatchScale).toBeCloseTo(5.8, 6);
    expect(parsed.ripeningRules.visualBlushStrength).toBeCloseTo(0.22, 6);
    expect(parsed.ripeningRules.visualShoulderRetention).toBeCloseTo(0.52, 6);
    expect(parsed.ripeningRules.turningColor).toBe('#c86b43');
    expect(parsed.ripeningRules.pinkColor).toBe('#c8746d');
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
    // Patch 3 skin pass: keep stage response data-driven while moving from
    // matte clay toward a softer tomato cuticle sheen.
    const raw = await readTomatoFruitJson();
    const parsed = parseFruitSpec(raw);
    const expectedRoughness = [0.64, 0.61, 0.58, 0.55, 0.52, 0.50];
    const expectedClearcoatIntensity = [0.06, 0.08, 0.10, 0.12, 0.15, 0.18];
    const expectedClearcoatRoughness = [0.64, 0.61, 0.58, 0.56, 0.54, 0.52];

    for (let stage = 0; stage < parsed.ripeningRules.stageCount; stage++) {
      expect(
        parsed.materialRules.stageRoughness[stage],
        `stage ${stage} roughness`,
      ).toBeCloseTo(expectedRoughness[stage], 6);
      expect(
        parsed.materialRules.stageClearcoatIntensity[stage],
        `stage ${stage} clearcoat intensity`,
      ).toBeCloseTo(expectedClearcoatIntensity[stage], 6);
      expect(
        parsed.materialRules.stageClearcoatRoughness[stage],
        `stage ${stage} clearcoat roughness`,
      ).toBeCloseTo(expectedClearcoatRoughness[stage], 6);
    }

    // subsurface
    expect(parsed.materialRules.subsurfaceTranslucency.fromStage).toBe(3);
    expect(parsed.materialRules.subsurfaceTranslucency.intensity).toBeCloseTo(0.08, 6);
    expect(parsed.materialRules.subsurfaceTranslucency.tintColor).toBe('#8b1a14');
    expect(parsed.materialRules.microNormalTexture).toBe('/textures/fruit/tomato_micro_normal.png');
    expect(parsed.materialRules.microNormalStrength).toBeCloseTo(0.06, 6);
    expect(parsed.materialRules.roughnessTexture).toBe('/textures/fruit/tomato_roughness_512.png');
    expect(parsed.materialRules.roughnessTextureChannel).toBe('green');
    expect(parsed.materialRules.skinVariantCount).toBe(3);
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

  test('FRUIT-REALISM-MATERIAL-CACHE-01: material key includes spec/stage/band/LOD/texture mask', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );
    const keyMatch = src.match(/function fruitMaterialKey[\s\S]*?\n\}/);
    expect(keyMatch, 'fruitMaterialKey function').toBeTruthy();
    const body = keyMatch![0];
    expect(body, 'spec identity in material key').toMatch(/fruitSpecId\s*\(\s*spec\s*\)/);
    expect(body, 'stage in material key').toMatch(/\bstage\b/);
    expect(body, 'roughness band in material key').toMatch(/\bband\b/);
    expect(body, 'LOD in material key').toMatch(/\blod\b/);
    expect(body, 'skin variant in material key').toMatch(/\bskinVariant\b/);
    expect(body, 'micro normal mask in material key').toMatch(/microNormalEnabled\s*\?\s*['"]N1['"]/);
    expect(body, 'roughness texture mask in material key').toMatch(/roughnessTextureEnabled\s*\?\s*['"]R1['"]/);
    expect(body, 'micro normal strength bucket in material key').toMatch(/microNormalStrengthBucket/);

    expect(src, 'roughness bucket variation').toMatch(/type\s+RoughnessBand\s*=/);
    expect(src, 'clamped clearcoat').toMatch(/clamp\s*\(\s*matRules\.stageClearcoatIntensity\[stage\]\s*\+\s*clearcoatOffsetFor/);
    expect(src, 'no old scene->stage material array cache').not.toMatch(/WeakMap<Scene,\s*PBRMaterial\[\]>/);
  });

  test('FRUIT-REALISM-UV-SEAM-01: high/near fruit body has UVs and stabilized seam normals', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );
    const fnMatch = src.match(/function buildFruitBodyVertexData[\s\S]*?return vd;\s*\n\}/);
    expect(fnMatch, 'buildFruitBodyVertexData function').toBeTruthy();
    const body = fnMatch![0];
    expect(body, 'UV array allocated').toMatch(/const\s+uvs:\s*number\[\]\s*=\s*\[\]/);
    expect(body, 'ring/segment UV pushed per vertex').toMatch(/uvs\.push\s*\(\s*s\s*\/\s*SEGMENTS\s*,\s*r\s*\/\s*RINGS\s*\)/);
    expect(body, 'VertexData receives uv0').toMatch(/vd\.uvs\s*=\s*uvs/);
    expect(body, 'seam first index').toMatch(/const\s+first\s*=\s*r\s*\*\s*colsPerRow/);
    expect(body, 'seam last index').toMatch(/const\s+last\s*=\s*first\s*\+\s*SEGMENTS/);
    expect(body, 'first and last seam normals are shared').toMatch(
      /normals\[first\s*\*\s*3\]\s*=\s*normals\[last\s*\*\s*3\]/,
    );
  });

  test('FRUIT-REALISM-TEXTURE-GATE-01: micro normal and roughness texture are optional high-LOD only', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );
    expect(src, 'roughness texture high-LOD detail gate').toMatch(/const\s+highDetail\s*=\s*lod\s*===\s*['"]high['"]/);
    expect(src, 'micro normal high-LOD gate').toMatch(/const\s+microNormalEnabled\s*=\s*highDetail\s*&&\s*!!matRules\.microNormalTexture/);
    expect(src, 'roughness texture references optional slot').toMatch(/!!matRules\.roughnessTexture/);
    expect(src, 'roughness texture honors green channel metadata').toMatch(/matRules\.roughnessTextureChannel\s*\?\?\s*['"]green['"]/);
    expect(src, 'micro normal optional loader').toMatch(/loadOptionalTextureSlot\s*\(\s*scene\s*,\s*matRules\.microNormalTexture/);
    expect(src, 'roughness optional loader').toMatch(/loadOptionalTextureSlot\s*\(\s*scene\s*,\s*roughnessUrl/);
    expect(src, 'micro normal strength clamped').toMatch(
      /const\s+microNormalStrength\s*=\s*clamp\s*\(\s*matRules\.microNormalStrength\s*\?\?\s*0\.045/,
    );
    expect(src, 'micro normal strength applied').toMatch(/tex\.level\s*=\s*debugMode\s*===\s*['"]normal['"]/);
  });

  test('FRUIT-REALISM-PATCH3-TEXTURES-01: generated roughness texture metadata and old normal path are present', async () => {
    await expect(
      fs.access(path.join(REPO_ROOT, 'public/textures/fruit/tomato_micro_normal.png')),
      'existing micro normal path remains valid',
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(REPO_ROOT, 'public/textures/fruit/tomato_roughness_512.png')),
      'generated roughness map exists',
    ).resolves.toBeUndefined();

    const manifest = JSON.parse(
      await fs.readFile(path.join(REPO_ROOT, 'public/textures/manifest.json'), 'utf-8'),
    );
    expect(manifest.slots.fruit.microNormal).toBe('fruit/tomato_micro_normal.png');
    expect(manifest.slots.fruit.roughness).toBe('fruit/tomato_roughness_512.png');
    const roughnessAsset = manifest.assets.find(
      (a: { id?: string }) => a.id === 'patch3-generated-fruit-roughness-512',
    );
    expect(roughnessAsset).toBeTruthy();
    expect(roughnessAsset.license).toBe('project-generated');
    expect(roughnessAsset.runtimeResolution).toBe('512x512');
    expect(roughnessAsset.gammaSpace).toBe(false);
    expect(roughnessAsset.channels.G).toContain('roughness');
  });

  test('FRUIT-REALISM-PATCH3-DEBUG-01: texture debug modes and skin variants are wired', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );
    expect(src, 'debug mode type').toMatch(/type\s+FruitDebugTextureMode\s*=\s*['"]off['"][\s\S]*['"]normal['"][\s\S]*['"]roughness['"][\s\S]*['"]roughnessLighting['"]/);
    expect(src, 'debug query parameter').toMatch(/get\(['"]fruitDebugTexture['"]\)/);
    expect(src, 'roughness debug disables vertex colors').toMatch(/body\.useVertexColors\s*=\s*fruitDebugTexture\s*!==\s*['"]roughness['"]/);
    expect(src, 'debug normal exaggerates level').toMatch(/debugMode\s*===\s*['"]normal['"]\s*\?\s*0\.2\s*:\s*microNormalStrength/);
    expect(src, 'roughness debug uses albedoTexture').toMatch(/mat\.albedoTexture\s*=\s*tex/);
    expect(src, 'skin variant selector').toMatch(/function\s+skinVariantFor/);
    expect(src, 'skin variant transform').toMatch(/function\s+skinVariantTextureTransform/);
  });

  test('FRUIT-REALISM-PATCH3-RIPENING-01: mixed ripeness remains visual-only and deterministic', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );
    const fnMatch = src.match(/function buildFruitBodyVertexData[\s\S]*?return vd;\s*\n\}/);
    expect(fnMatch, 'buildFruitBodyVertexData function').toBeTruthy();
    const body = fnMatch![0];
    expect(body, 'turning color from spec').toMatch(/spec\.ripeningRules\.turningColor/);
    expect(body, 'pink color from spec').toMatch(/spec\.ripeningRules\.pinkColor/);
    expect(body, 'patch strength from spec').toMatch(/spec\.ripeningRules\.visualPatchStrength/);
    expect(body, 'fruit-local angular patches').toMatch(/Math\.sin\(theta\s*\*\s*visualPatchScale\s*\+\s*patchPhase1\)/);
    expect(body, 'middle-stage only mixed ripening').toMatch(/fruit\.ripenStage\s*>=\s*2\s*&&\s*fruit\.ripenStage\s*<=\s*4/);
    expect(body, 'stage 5 red-dominant variation').toMatch(/fruit\.ripenStage\s*>=\s*5/);
    expect(body, 'smooth shoulder mask').toMatch(/smoothstep\(0\.58,\s*0\.94,\s*cosP\)/);
  });

  test('FRUIT-REALISM-SHAPE-ANCHOR-01: coherent deformation preserves crown/top anchor', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/fruit/FruitGenerator.ts'),
      'utf-8',
    );
    const fnMatch = src.match(/function buildFruitBodyVertexData[\s\S]*?return vd;\s*\n\}/);
    expect(fnMatch, 'buildFruitBodyVertexData function').toBeTruthy();
    const body = fnMatch![0];
    expect(body, 'coherent asymmetry uses spec morphology').toMatch(/spec\.morphologyRules\.coherentAsymmetryAmp/);
    expect(body, 'top depression range uses spec morphology').toMatch(/spec\.morphologyRules\.topDepressionRange/);
    expect(body, 'visual height clamp is render-only').toMatch(
      /const\s+h\s*=\s*clamp\s*\(\s*genome\.heightWidthRatio\s*,\s*visualClamp\[0\]\s*,\s*visualClamp\[1\]\s*\)/,
    );
    expect(body, 'stem-end anchor cosine from spec').toMatch(/spec\.morphologyRules\.stemEndAnchorCos/);
    expect(body, 'crown anchor y uses height-scaled cosine').toMatch(/const\s+crownAnchorY\s*=\s*h\s*\*\s*stemEndAnchorCos/);
    expect(body, 'narrow depression band uses smoothstep').toMatch(/smoothstep\(depressionBand\[0\]/);
    expect(body, 'anchor preserve mask').toMatch(/const\s+anchorPreserve\s*=\s*1\s*-\s*topAnchorMask/);
    expect(body, 'top pole x anchored').toMatch(/if\s*\(\s*topAnchorMask\s*>\s*0\.98\s*\)[\s\S]*?x\s*=\s*0/);
    expect(body, 'top pole y anchored').toMatch(/y\s*=\s*crownAnchorY/);
  });

  test('FRUIT-REALISM-CALYX-01: TrussGenerator uses combined calyx variants and omits ultraLow', async () => {
    const src = await fs.readFile(TRUSS_GENERATOR_PATH, 'utf-8');
    expect(src, 'combined calyx variant union').toMatch(/type\s+CalyxVariant\s*=/);
    expect(src, '5/6/7 calyx variants').toMatch(/'calyx_5_a'[\s\S]*'calyx_6_a'[\s\S]*'calyx_7_a'/);
    expect(src, 'ultraLow calyx omitted').toMatch(/if\s*\(\s*lod\s*===\s*['"]ultraLow['"]\s*\)\s*return\s+null/);
    expect(src, 'low LOD simple calyx').toMatch(/if\s*\(\s*lod\s*===\s*['"]low['"]\s*\)\s*return\s+['"]calyx_5_simple['"]/);
    expect(src, 'combined source mesh cache').toMatch(/const\s+cachedCalyxSource:\s*WeakMap<Scene,\s*Map<string,\s*Mesh>>/);
    expect(src, 'single instance per fruit from combined source').toMatch(/const\s+calyx\s*=\s*src\.createInstance/);
    expect(src, 'stable crown frame helper').toMatch(/function\s+buildCrownFrame/);
    expect(src, 'local calyx source extends outward along positive Y').toMatch(/positions\.push\(p\.x,\s*rowLift\s*\+\s*foldLift,\s*p\.z\)/);
    expect(src, 'calyx source carries vertex colors').toMatch(/vd\.colors\s*=\s*colors/);
    expect(src, 'calyx base placed outward from fruitTop').toMatch(/calyx\.position\s*=\s*center\.add\(frame\.axis\.scale\(surfaceLift\)\)/);
    expect(src, 'no per-sepal mesh creation loop').not.toMatch(/for\s*\([^)]*SEPALS[\s\S]*?MeshBuilder\.CreatePlane/);
  });

  test('FRUIT-REALISM-DUPLICATE-CALYX-01: active truss path skips FruitGenerator calyx/stem', async () => {
    const src = await fs.readFile(TRUSS_GENERATOR_PATH, 'utf-8');
    expect(src, 'active createFruitNode call keeps skipCalyxAndStem true').toMatch(
      /createFruitNode\s*\([\s\S]*?\{\s*skipCalyxAndStem:\s*true,\s*lod:\s*fruitLod\s*\}/,
    );
    expect(src, 'production calyx receives LOD and stable index').toMatch(
      /addCalyxStar\s*\([\s\S]*?fruitLod\s*,\s*site\.index\s*,\s*sepalDir\s*,?\s*\)/,
    );
  });
});
