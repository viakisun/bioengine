// Iter 29 Phase 6 — Calibration Pack invariants.
//
// Plan §6 (sleepy-growing-pretzel.md). Compile-time schema validation +
// runtime sanity check (warning, NOT throw) + diagnostic dump.
//
// Acceptance:
//   CALIBRATION-01: 모든 growth parameter는 source/range/default/confidence
//   CALIBRATION-02: hardcoded biological constants 0건 (Skin/Skeleton)
//   CALIBRATION-03: tomato-growth-targets.jsonc loader + validation 작동
//   CALIBRATION-04: reference pack v0.1 데이터가 engine에서 consumable
//   CALIBRATION-WARNING-01: CalibrationWarning struct (nodeId/organKind/parameterName/
//                            observed/expectedRange/source) 모두 포함
//   CALIBRATION-WARNING-02: warning은 throw 아닌 console.warn 가능 + dev only
//   LEGACY-ALIAS-REMOVE-01: Phase 6 종료 시점 canonical path 0건
//   LEGACY-ALIAS-REMOVE-02: deprecated alias external compatibility only
//   LEGACY-ALIAS-REMOVE-03: 후속 alias 제거 후보 docs 기록
//   DOCS-01: v0.14 calibration report 작성
//   DEFORMATION-FUTURE-01: curl as deformation 후속 docs

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  parseCalibrationPack,
  validateCalibrationPack,
  bandAtTT,
  bandAtDay,
  assertWithinCalibrationBand,
  type CalibrationPackSpec,
} from '../../packages/tomato-engine/src/growth/CalibrationPack';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

test.describe('CalibrationPack (Iter 29 Phase 6)', () => {
  test('CALIBRATION-01: 모든 growth parameter는 source/range/default/confidence', async () => {
    // Phase 5 PROVENANCE-01 already enforced this on CultivarGrowthProfile.
    // Phase 6 verifies the cultivar JSONC + DEFAULT_GROWTH_PROFILE_PROVENANCE are present.
    const text = await readSrc('packages/tomato-engine/src/CultivarGrowthProfile.ts');
    expect(text, 'DEFAULT_GROWTH_PROFILE_PROVENANCE exported')
      .toMatch(/export const DEFAULT_GROWTH_PROFILE_PROVENANCE/);
    expect(text, 'CultivarGrowthProfileFieldMeta interface')
      .toMatch(/export interface CultivarGrowthProfileFieldMeta/);
    // round-generic JSONC has growthProfileProvenance sample
    const json = await readSrc('packages/tomato-engine/models/cultivars/round-generic.jsonc');
    expect(json, 'round-generic carries growthProfileProvenance').toMatch(/growthProfileProvenance/);
  });

  test('CALIBRATION-02: hardcoded biological constants 0건 in canonical Skin/Skeleton path', async () => {
    // Skin canonical: buildLeafMeshFromPhytomer must not have magic biology numbers
    const gen = await readSrc('src/plant/LeafGenerator.ts');
    const start = gen.indexOf('export function buildLeafMeshFromPhytomer');
    const subset = gen.slice(start);
    const endMatch = subset.match(/\n\}\s*\n/);
    const body = subset.slice(0, endMatch!.index! + 2);
    // No `880` (BASE_LEAF_AREA), no `720`, no `60d senescence threshold`
    expect(body, 'no 880 hardcoded').not.toMatch(/\b880\b/);
    expect(body, 'no 720 hardcoded').not.toMatch(/\b720\b/);
    // Skeleton populator: no growth biology constants
    const pop = await readSrc('src/plant/skeleton/populator/populateAnchorMorphology.ts');
    expect(pop, 'populator: no 880 const').not.toMatch(/\b880\b/);
    expect(pop, 'populator: no 38 GDD hardcoded (Phase 5 calibration pack only)')
      .not.toMatch(/\bphyllochronTT\s*=\s*38\b/);
  });

  test('CALIBRATION-03: tomato-growth-targets.jsonc loader + validation 작동', async () => {
    const jsonc = await readSrc('packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc');
    const spec = parseCalibrationPack(jsonc);
    expect(spec, 'parse succeeded').not.toBeNull();
    expect(spec!.schemaVersion).toBe('calibrationPack.v0.1');
    expect(spec!.metadata.crop).toBe('tomato');
    expect(spec!.leaf?.targetAreaCm2, 'leaf.targetAreaCm2 band').toBeDefined();
    expect(spec!.plant?.heightCm, 'plant.heightCm band').toBeDefined();

    const issues = validateCalibrationPack(spec!);
    expect(issues, 'validation issues').toEqual([]);

    // bandAtTT interpolation
    const leafBandEarly = bandAtTT(spec!.leaf!.targetAreaCm2!, 50);
    expect(leafBandEarly, 'band at TT=50').not.toBeNull();
    const leafBandPeak = bandAtTT(spec!.leaf!.targetAreaCm2!, 600);
    expect(leafBandPeak, 'band at TT=600').not.toBeNull();
    expect(leafBandPeak![1], 'peak band max').toBeGreaterThan(leafBandEarly![1]);

    // bandAtDay for plant.heightCm
    const heightD45 = bandAtDay(spec!.plant!.heightCm!, 45);
    expect(heightD45).not.toBeNull();
    expect(heightD45![0]).toBeGreaterThan(50);
  });

  test('CALIBRATION-04: reference pack v0.1 데이터가 engine에서 consumable', async () => {
    // Reference pack at growth-calibration/reference/tomato/ exists +
    // engine can read tomato-growth-targets.jsonc shape
    const refDir = path.join(REPO_ROOT, 'growth-calibration/reference/tomato/tomato_tomimaru_reference_v0.1');
    const stat = await fs.stat(refDir);
    expect(stat.isDirectory(), 'reference pack dir').toBe(true);

    // Verify the engine-side calibration pack itself loads and provides
    // consumer-side helpers (loader + bandAt*).
    const jsonc = await readSrc('packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc');
    const spec = parseCalibrationPack(jsonc);
    expect(spec).not.toBeNull();
    expect(validateCalibrationPack(spec as CalibrationPackSpec)).toEqual([]);
  });

  test('CALIBRATION-WARNING-01: CalibrationWarning struct 모든 필드 포함', () => {
    // Inside-band → null
    const inBand = assertWithinCalibrationBand({
      observed: 500,
      expectedRange: [400, 600],
      nodeId: 'n7',
      organKind: 'leaf',
      parameterName: 'leaf.targetAreaCm2',
      source: 'Heuvelink 1996',
    });
    expect(inBand, 'in-band returns null').toBeNull();

    // Out-of-band → warning with required fields
    const w = assertWithinCalibrationBand({
      observed: 1200,
      expectedRange: [400, 600],
      nodeId: 'n7',
      organKind: 'leaf',
      parameterName: 'leaf.targetAreaCm2',
      source: 'Heuvelink 1996',
    });
    expect(w).not.toBeNull();
    expect(w!.nodeId).toBe('n7');
    expect(w!.organKind).toBe('leaf');
    expect(w!.parameterName).toBe('leaf.targetAreaCm2');
    expect(w!.observed).toBe(1200);
    expect(w!.expectedRange).toEqual([400, 600]);
    expect(w!.source).toBe('Heuvelink 1996');
    expect(['info', 'warn', 'error']).toContain(w!.severity);
    // Way out — severity error
    expect(w!.severity).toBe('error');

    // Modest drift → warn (not error)
    const w2 = assertWithinCalibrationBand({
      observed: 650,
      expectedRange: [400, 600],
      nodeId: 'n7', organKind: 'leaf',
      parameterName: 'leaf.targetAreaCm2',
      source: 'Heuvelink 1996',
    });
    expect(w2!.severity).toBe('warn');
  });

  test('CALIBRATION-WARNING-02: warning emits via return value (NOT throw)', () => {
    // assertWithinCalibrationBand never throws — just returns null or warning.
    expect(() => assertWithinCalibrationBand({
      observed: -999, expectedRange: [400, 600],
      nodeId: 'n', organKind: 'leaf',
      parameterName: 'x', source: 's',
    })).not.toThrow();
    // Degenerate input (NaN observed) — still doesn't throw
    expect(() => assertWithinCalibrationBand({
      observed: NaN, expectedRange: [400, 600],
      nodeId: 'n', organKind: 'leaf',
      parameterName: 'x', source: 's',
    })).not.toThrow();
  });

  test('LEGACY-ALIAS-REMOVE-01/02: deprecated flat alias canonical path 0건', async () => {
    // SkinMeshPlant canonical path now reads phytomer.leaf — no flat
    // leafMaturity/leafSizeFactor scalar in canonical SP.
    const gen = await readSrc('src/plant/LeafGenerator.ts');
    const start = gen.indexOf('export function buildLeafMeshFromPhytomer');
    const subset = gen.slice(start);
    const endMatch = subset.match(/\n\}\s*\n/);
    const body = subset.slice(0, endMatch!.index! + 2);
    // No `node.leafMaturity` / `node.leafSizeFactor` (NodeState flat path)
    expect(body, 'no node.leafMaturity in canonical').not.toMatch(/node\.leafMaturity/);
    expect(body, 'no node.leafSizeFactor in canonical').not.toMatch(/node\.leafSizeFactor/);
    expect(body, 'no node.leafletCount in canonical').not.toMatch(/node\.leafletCount/);
  });

  test('LEGACY-ALIAS-REMOVE-03: alias 제거 후보 docs 기록', async () => {
    // v0.14 calibration report must enumerate the alias removal candidates
    const docs = await readSrc('docs/calibration-checkpoint-reports/v0.14-iter29-redefine-comprehensive.md');
    expect(docs, 'v0.14 report lists alias remove candidates')
      .toMatch(/alias[\s\S]{0,200}(remove|deprecat)/i);
    expect(docs, 'documents leafMaturity → leaf.expansionProgress migration')
      .toMatch(/leafMaturity[\s\S]{0,80}leaf\.expansionProgress|leaf\.expansionProgress[\s\S]{0,80}leafMaturity/);
  });

  test('DOCS-01: v0.14 calibration report 작성됨', async () => {
    const docs = await readSrc('docs/calibration-checkpoint-reports/v0.14-iter29-redefine-comprehensive.md');
    expect(docs.length, 'v0.14 report substantial').toBeGreaterThan(2000);
    // Required sections per plan §6
    for (const section of ['Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6']) {
      expect(docs, `${section} described`).toMatch(new RegExp(section, 'i'));
    }
    expect(docs, 'mentions PhytomerNode').toMatch(/PhytomerNode/);
    expect(docs, 'mentions calibration pack').toMatch(/calibration/i);
  });

  test('DEFORMATION-FUTURE-01: curl as deformation 후속 docs', async () => {
    // v0.14 report must enumerate the deformation parameter future note
    const docs = await readSrc('docs/calibration-checkpoint-reports/v0.14-iter29-redefine-comprehensive.md');
    expect(docs, 'curl deformation future noted')
      .toMatch(/(curl|deformation).{0,200}(future|LeafDeformationState|후속)/i);
  });
});
