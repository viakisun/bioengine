// Iter 29 Phase 4 — Skin strict data-driven refactor invariants.
//
// Plan §4, §13.3 (sleepy-growing-pretzel.md).
//
// Phase 4 핵심: Skin은 phytomer + anchor _값을 적용만_ — growth function
// 호출 0건. plantAge/day 인자 0건. LeafBase.azimuthRad/droopRad 직접 참조 0건.
//
// Acceptance:
//   SKIN-DATA-DRIVEN-01: buildLeafMeshFromPhytomer 시그니처에 plantAge/day 인자 0건
//   SKIN-DATA-DRIVEN-02: hardcoded leaf size 상수 0건 (Skin canonical path)
//   SKIN-DATA-DRIVEN-03: canonical path에서 LeafBase.azimuthRad/droopRad 0건
//                        (legacy fallback only — fallback hit count ≤ 1 each)
//   SKIN-NO-GROWTH-LOGIC-01: Skin path에서 leaf stage/area/senescence/leafletCount
//                            계산 함수 호출 0건 (getLeafStage / leafletCountFromMaturity /
//                            computeLeafExpansion / computeSenescence)
//   SKIN-LEAF-01: buildLeafMeshFromPhytomer는 LeafOrganState + visualGenome만으로 재현 가능
//   SKIN-LEGACY-01: ShowcasePlant 구조 회귀 0 (anchor/organ/crash/mismatch)
//   SKIN-SENESCENCE-APPLY-01: Skin은 senescenceProgress _직접 해석_ 0건
//                              colorDullness/visibleAreaFactor/curl/droop는 PlantBase 값 _적용_만

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

const SKIN_FILES = [
  'src/scene/SkinMeshPlant.ts',
  'src/plant/LeafGenerator.ts',
];

async function readSource(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

test.describe('Skin Data-Driven Refactor (Iter 29 Phase 4)', () => {
  test('SKIN-DATA-DRIVEN-01: buildLeafMeshFromPhytomer signature has 0 plantAge/day params', async () => {
    const text = await readSource('src/plant/LeafGenerator.ts');
    // Find buildLeafMeshFromPhytomer signature block
    const sig = text.match(/export function buildLeafMeshFromPhytomer\([\s\S]*?\)\s*:\s*Mesh/);
    expect(sig, 'buildLeafMeshFromPhytomer exported').toBeTruthy();
    const block = sig![0];
    expect(block, 'no plantAge param').not.toMatch(/plantAge[:?\s]/);
    expect(block, 'no `day:` param').not.toMatch(/\bday[?:]\s/);
    // Must take LeafOrganState (structurally)
    expect(block, 'takes leafOrganState').toMatch(/leafOrganState/);
  });

  test('SKIN-DATA-DRIVEN-02: hardcoded leaf size constants 0 in canonical path', async () => {
    const text = await readSource('src/plant/LeafGenerator.ts');
    // Find buildLeafMeshFromPhytomer body (between function start + first close brace at zero nesting)
    const start = text.indexOf('export function buildLeafMeshFromPhytomer');
    expect(start, 'buildLeafMeshFromPhytomer found').toBeGreaterThan(0);
    // Find next `^}` line
    const subset = text.slice(start);
    const endMatch = subset.match(/\n\}\s*\n/);
    expect(endMatch, 'function body delimiter').toBeTruthy();
    const body = subset.slice(0, endMatch!.index! + 2);

    // No magic numbers like `880`, `720` (BASE_LEAF_AREA history)
    expect(body, 'no 880 hardcoded').not.toMatch(/\b880\b/);
    expect(body, 'no 720 hardcoded').not.toMatch(/\b720\b/);
    // No assigned `cm2 = <number>` either (constant size literal)
    expect(body, 'no cm2 = <literal> pattern').not.toMatch(/cm2\s*=\s*\d+\.?\d*\b/);
  });

  test('SKIN-DATA-DRIVEN-03: canonical Skin path 0 LeafBase.azimuthRad/droopRad reads; legacy fallback ≤ 1 each', async () => {
    const text = await readSource('src/scene/SkinMeshPlant.ts');
    const azimuthHits = (text.match(/leafBase\.azimuthRad/g) ?? []).length;
    const droopHits = (text.match(/leafBase\.droopRad/g) ?? []).length;
    // Phase 4: legacy fallback retained in the `else` branch — 1 hit each.
    // Phase 5 LEGACY-ALIAS-REMOVE-02 strictly removes these.
    expect(azimuthHits, `leafBase.azimuthRad uses (legacy fallback only, ≤ 1)`).toBeLessThanOrEqual(1);
    expect(droopHits, `leafBase.droopRad uses (legacy fallback only, ≤ 1)`).toBeLessThanOrEqual(1);
    // Canonical path must use anchor.rotation (Babylon Quaternion)
    expect(text, 'canonical uses anchor.rotation').toMatch(/anchor\.rotation/);
  });

  test('SKIN-NO-GROWTH-LOGIC-01: Skin path doesn\'t call growth-state functions', async () => {
    const FORBIDDEN = [
      'getLeafStage',
      'leafletCountFromMaturity',
      'computeLeafExpansion',
      'computeLeafExpansionProgress',
      'computeSenescenceProgress',
      'makeSenescenceState',
    ];
    // Inspect canonical Skin path:
    //   - SkinMeshPlant.ts MUST NOT call any of these
    //   - LeafGenerator.buildLeafMeshFromPhytomer body MUST NOT call any of these
    const skin = await readSource('src/scene/SkinMeshPlant.ts');
    for (const fn of FORBIDDEN) {
      expect(skin, `SkinMeshPlant MUST NOT call ${fn}`)
        .not.toMatch(new RegExp(`\\b${fn}\\s*\\(`));
    }
    // LeafGenerator buildLeafMeshFromPhytomer body
    const gen = await readSource('src/plant/LeafGenerator.ts');
    const start = gen.indexOf('export function buildLeafMeshFromPhytomer');
    const subset = gen.slice(start);
    const endMatch = subset.match(/\n\}\s*\n/);
    const body = subset.slice(0, endMatch!.index! + 2);
    for (const fn of FORBIDDEN) {
      expect(body, `buildLeafMeshFromPhytomer body MUST NOT call ${fn}`)
        .not.toMatch(new RegExp(`\\b${fn}\\s*\\(`));
    }
  });

  test('SKIN-LEAF-01: buildLeafMeshFromPhytomer is reproducible from LeafOrganState + visualGenome alone', async () => {
    const text = await readSource('src/plant/LeafGenerator.ts');
    // Function declares `leafOrganState` + `visualGenome` + `rng` + name/scene only
    const sig = text.match(/export function buildLeafMeshFromPhytomer\([\s\S]*?\)\s*:\s*Mesh/);
    expect(sig, 'signature present').toBeTruthy();
    const block = sig![0];
    // params present
    expect(block, 'leafOrganState param').toMatch(/leafOrganState:/);
    expect(block, 'visualGenome param').toMatch(/visualGenome:/);
    expect(block, 'scene param').toMatch(/scene:\s*Scene/);
    expect(block, 'name param').toMatch(/name:\s*string/);
    expect(block, 'rng param').toMatch(/rng:\s*SeededRandom/);
    // No PlantState/NodeState/plantBase params
    expect(block, 'no NodeState param').not.toMatch(/NodeState/);
    expect(block, 'no PlantState param').not.toMatch(/PlantState/);
    expect(block, 'no plantBase param').not.toMatch(/plantBase/);
  });

  test('SKIN-LEGACY-REMOVED-01: ShowcasePlant + createLeafMeshFromNode archived (Iter 35 PR 2 Phase I+L)', async () => {
    // Iter 35 PR 2: ShowcasePlant 완전 제거 → legacy createLeafMeshFromNode 사용처 0.
    // src/scene/ShowcasePlant.ts 부재 + LeafGenerator.ts에 createLeafMeshFromNode export 부재.
    const lg = await readSource('src/plant/LeafGenerator.ts');
    expect(lg, 'createLeafMeshFromNode export 0 (Phase L archived)')
      .not.toMatch(/export function createLeafMeshFromNode/);

    // ShowcasePlant.ts는 active 경로에서 archive됨
    let showcaseExists = false;
    try {
      await readSource('src/scene/ShowcasePlant.ts');
      showcaseExists = true;
    } catch {
      // expected — file archived
    }
    expect(showcaseExists, 'src/scene/ShowcasePlant.ts archived (Phase I)').toBe(false);
  });

  test('SKIN-SENESCENCE-APPLY-01: Skin applies PlantBase senescence values; doesn\'t reinterpret progress', async () => {
    // Skin reads phytomer.leaf.senescence.colorDullness — PlantBase computed.
    // No formula like `progress * 25` or `yellowing * <number>` in Skin path.
    const skin = await readSource('src/scene/SkinMeshPlant.ts');
    expect(skin, 'SkinMeshPlant reads phytomer.leaf.senescence')
      .toMatch(/phytomer\.\w+\.leaf\??\.\s*senescence|phytomer\?\.\w*\.\s*senescence|phytomerLeaf\??\.senescence/);
    // No senescenceProgress recomputation in Skin (no `progress * 0.X` patterns)
    const skinBody = skin.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(skinBody, 'no `senescenceProgress * <num>` recomputation')
      .not.toMatch(/senescenceProgress\s*\*\s*\d+\.?\d*/);

    const gen = await readSource('src/plant/LeafGenerator.ts');
    const start = gen.indexOf('export function buildLeafMeshFromPhytomer');
    const subset = gen.slice(start);
    const endMatch = subset.match(/\n\}\s*\n/);
    const body = subset.slice(0, endMatch!.index! + 2);
    // buildLeafMeshFromPhytomer reads senescence.progress + senescence.colorDullness +
    // senescence.curl — but doesn't recompute (no `Math.sigmoid(...)`)
    expect(body, 'reads senescence.colorDullness from input').toMatch(/senescence\.colorDullness/);
    expect(body, 'reads senescence.curl from input').toMatch(/senescence\.curl/);
    void SKIN_FILES;
  });
});
