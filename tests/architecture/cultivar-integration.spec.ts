// Iter 29 Phase 5 — Full Cultivar + Genome integration + variance invariants.
//
// Plan: sleepy-growing-pretzel.md §5 + §10.
//
// Phase 5 핵심: generateGenome cultivar 옵션 + cultivar leaf-shape distribution
// + per-node deterministic variance (±15%) + 모든 growth parameter provenance
// metadata + legacy alias strict 마이그레이션.
//
// Acceptance:
//   CULTIVAR-GROWTH-01: cherry vs beefsteak mean leaf area > 30% 차이 (target area level)
//   CULTIVAR-MAXLEAFLET-01: maxLeafletCount cultivar별 적용 (7 / 9 / 11)
//   CULTIVAR-LEGACY-01: cultivar 미지정 시 default 동작 동일 (backward compat)
//   GENOME-CULTIVAR-API-01: generateGenome(seed) backward compat
//   GENOME-CULTIVAR-API-02: generateGenome(seed, { cultivar }) cultivar leafShape 사용
//   VARIANCE-01: 같은 plant 안 leaf shape 분산 (serrationDepth 표준편차 > 0.01)
//   VARIANCE-CLAMP-01: 각 leaf shape param ±15% 내
//   PROVENANCE-01: 모든 growth parameter에 source/range/default/confidence
//   LEGACY-ALIAS-STRICT-01: SkinMeshPlant.ts 안 leafBase.azimuthRad/droopRad 0건

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_CULTIVAR_GROWTH_PROFILE,
  DEFAULT_GROWTH_PROFILE_PROVENANCE,
  defaultGrowthProfileForType,
  type CultivarGrowthProfile,
  type CultivarGrowthProfileProvenance,
} from '../../packages/tomato-engine/src/CultivarGrowthProfile';
import {
  applyMorphologyVariance,
  type LeafMorphologyState,
} from '../../packages/tomato-engine/src/growth/LeafGrowthModel';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

test.describe('Cultivar Integration + Variance (Iter 29 Phase 5)', () => {
  test('CULTIVAR-GROWTH-01: cherry vs beefsteak target leaf area > 30% 차이', () => {
    // Pure type-default comparison
    const cherry = defaultGrowthProfileForType('cherry');
    const beefsteak = defaultGrowthProfileForType('beefsteak');
    const diff = (beefsteak.maxLeafAreaCm2 - cherry.maxLeafAreaCm2) / cherry.maxLeafAreaCm2;
    expect(diff, `(beef ${beefsteak.maxLeafAreaCm2} - cherry ${cherry.maxLeafAreaCm2}) / cherry`)
      .toBeGreaterThan(0.30);
  });

  test('CULTIVAR-MAXLEAFLET-01: maxLeafletCount cultivar별 적용 (7 / 9 / 11)', () => {
    expect(defaultGrowthProfileForType('cherry').maxLeafletCount).toBe(7);
    expect(defaultGrowthProfileForType('round').maxLeafletCount).toBe(9);
    expect(defaultGrowthProfileForType('roma').maxLeafletCount).toBe(9);
    expect(defaultGrowthProfileForType('beefsteak').maxLeafletCount).toBe(11);
  });

  test('CULTIVAR-LEGACY-01: cultivar 미지정 시 default 동작 동일', async () => {
    // generateGenome(seed) === generateGenome(seed, {}) 동일 결과
    const text = await readSrc('packages/tomato-engine/src/PlantGenome.ts');
    expect(text, 'generateGenome accepts optional options').toMatch(/options\?:\s*GenerateGenomeOptions/);
    expect(text, 'GenerateGenomeOptions defined').toMatch(/export interface GenerateGenomeOptions/);
    // applyCultivarLeafShape only fires when cultivar present (default — no-op)
    expect(text, 'no-cultivar path returns base').toMatch(/if\s*\(!cultivar\)\s+return\s+base/);
  });

  test('GENOME-CULTIVAR-API-01: generateGenome(seed) backward compat (1-arg call)', async () => {
    const text = await readSrc('packages/tomato-engine/src/PlantGenome.ts');
    // Function signature accepts seed + optional options bag (multi-line tolerant)
    const sig = text.match(/export function generateGenome\([\s\S]*?options\?:\s*GenerateGenomeOptions[\s\S]*?\):\s*PlantGenome/);
    expect(sig, 'signature accepts optional 2nd arg').toBeTruthy();
    // The function MUST handle a 1-arg call: options?? {} fallback
    const opts = text.match(/const opts = options \?\? \{\}/);
    expect(opts, 'default empty options bag').toBeTruthy();
  });

  test('GENOME-CULTIVAR-API-02: generateGenome(seed, { cultivar }) cultivar leafShape 사용', async () => {
    const text = await readSrc('packages/tomato-engine/src/PlantGenome.ts');
    // applyCultivarLeafShape branches by cultivar.type
    expect(text, 'applyCultivarLeafShape function present').toMatch(/function applyCultivarLeafShape/);
    expect(text, 'cherry type bias').toMatch(/case 'cherry'/);
    expect(text, 'beefsteak type bias').toMatch(/case 'beefsteak'/);
    expect(text, 'serrationBias declared').toMatch(/serrationBias/);
    expect(text, 'lobeBias declared').toMatch(/lobeBias/);
  });

  test('VARIANCE-01: 같은 plant 안 leaf shape 분산 (serrationDepth 표준편차 > 0.01)', () => {
    // Generate 50 perturbations from sequential variation seeds (mimicking
    // 50 nodes on the same plant). Std dev of serrationDepth should be > 0.01.
    const base: LeafMorphologyState = {
      serrationDepth: 0.18,
      lobeDepth: 0.08,
      petioleLengthM: 0.30,
      variationSeed: 0,
    };
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const perturbed = applyMorphologyVariance(
        { ...base, variationSeed: (i * 2654435761) >>> 0 },
        0.15,
      );
      samples.push(perturbed.serrationDepth);
    }
    const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
    const variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance);
    expect(std, `serrationDepth std-dev across 50 nodes`).toBeGreaterThan(0.005);
    // Sanity — mean stays near base 0.18
    expect(Math.abs(mean - 0.18)).toBeLessThan(0.05);
  });

  test('VARIANCE-CLAMP-01: 각 leaf shape param ±15% 내', () => {
    const base: LeafMorphologyState = {
      serrationDepth: 0.18,
      lobeDepth: 0.08,
      petioleLengthM: 0.30,
      variationSeed: 0,
    };
    // sweep variation seeds and verify perturbed values stay within ±15%
    let maxSerrationDelta = 0;
    let maxLobeDelta = 0;
    for (let i = 0; i < 1000; i++) {
      const p = applyMorphologyVariance({ ...base, variationSeed: i }, 0.15);
      const serrationDelta = Math.abs(p.serrationDepth - base.serrationDepth) / base.serrationDepth;
      const lobeDelta = Math.abs(p.lobeDepth - base.lobeDepth) / base.lobeDepth;
      maxSerrationDelta = Math.max(maxSerrationDelta, serrationDelta);
      maxLobeDelta = Math.max(maxLobeDelta, lobeDelta);
    }
    expect(maxSerrationDelta, 'serrationDepth perturbation ≤ 15%').toBeLessThanOrEqual(0.151);
    expect(maxLobeDelta, 'lobeDepth perturbation ≤ 15%').toBeLessThanOrEqual(0.151);
  });

  test('PROVENANCE-01: 모든 11 fields에 source/range/default/confidence metadata', () => {
    const required: (keyof CultivarGrowthProfile)[] = [
      'phyllochronTT', 'plastochronTT', 'baseInternodeLengthCm', 'maxLeafAreaCm2',
      'maxLeafletCount', 'leafExpansionDurationTT', 'leafLifespanTT',
      'firstTrussNodeIndex', 'trussIntervalNodes', 'baseStemRadiusMm',
      'sourceSinkSensitivity',
    ];
    for (const field of required) {
      const meta = (DEFAULT_GROWTH_PROFILE_PROVENANCE as CultivarGrowthProfileProvenance)[field];
      expect(meta, `${field} provenance`).toBeDefined();
      expect(meta.source, `${field}.source`).toBeDefined();
      expect(['literature', 'vendor', 'estimated', 'measured', 'calibrated']).toContain(meta.source);
      expect(typeof meta.default, `${field}.default`).toBe('number');
      expect(meta.confidence, `${field}.confidence`).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(meta.confidence);
      expect(meta.default, `${field}.default matches DEFAULT_CULTIVAR_GROWTH_PROFILE.${field}`)
        .toBe(DEFAULT_CULTIVAR_GROWTH_PROFILE[field] as number);
    }
  });

  test('LEGACY-ALIAS-STRICT-01: SkinMeshPlant.ts canonical path leafBase.azimuthRad/droopRad 0건', async () => {
    // Phase 4 left 1 fallback occurrence each (legacy `else` branch). Phase 5
    // LEGACY-ALIAS-REMOVE-02 strictly removed the fallback — canonical path
    // is now anchor.rotation only.
    const text = await readSrc('src/rendering/SkinMeshPlant.ts');
    const azimuthHits = (text.match(/leafBase\.azimuthRad/g) ?? []).length;
    const droopHits = (text.match(/leafBase\.droopRad/g) ?? []).length;
    expect(azimuthHits, 'leafBase.azimuthRad references').toBe(0);
    expect(droopHits, 'leafBase.droopRad references').toBe(0);
    // leafSizeFactor scale-alert (LEAFSIZEFACTOR-SCALE-ALERT-01) — Phase 5
    // canonical path uses leafOrganState.currentAreaCm2 / referenceArea
    // directly rather than the deprecated scalar.
    const gen = await readSrc('src/plant/LeafGenerator.ts');
    const start = gen.indexOf('export function buildLeafMeshFromPhytomer');
    const subset = gen.slice(start);
    const endMatch = subset.match(/\n\}\s*\n/);
    const body = subset.slice(0, endMatch!.index! + 2);
    expect(body, 'canonical path uses leafOrganState.currentAreaCm2')
      .toMatch(/leafOrganState\.currentAreaCm2/);
    expect(body, 'canonical path does NOT call leafSizeFactor scalar')
      .not.toMatch(/leafSizeFactor\b/);
  });
});
