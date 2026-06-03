// ★ Iter 39 Phase L5 — Spec migration parity invariants.
//
// L5에서 LeafMeshBuilder 산식이 spec에서 botanical parameter를 읽도록 변경.
// 각 migration commit (S40 lobe, S41 instance, S42 pose, S43-44 shape/asym)
// 후 _단위 산식_ output이 byte-identical 보장.
//
// 검증 순서 (사용자 보완 #5): 단위 산식 parity → 전체 mesh parity.
//   1차: 이 file의 unit-style spec (산식 layer)
//   2차: leaf-mesh-refactor-parity.spec.ts (mesh layer)
//
// 이 spec은 _Babylon 의존 0_ — pure 수치 검증 (Node ESM 호환).

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseLeafSpec } from '../../src/scene/leaf/LeafSpec';
import { lobeNoise, computeLeftRightImbalance } from '../../src/scene/leaf/LeafMeshBuilder';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function loadTomatoSpec() {
  const text = await fs.readFile(
    path.join(REPO_ROOT, 'src/data/leaf/specs/tomato.json'),
    'utf-8',
  );
  return parseLeafSpec(JSON.parse(text));
}

test.describe('Iter 39 Phase L5 — Spec migration parity', () => {
  test('LEAF-LOBE-NOISE-PARITY-01: lobeNoise(spec.lobeNoiseRules, ...) byte-identical to pre-L5-3 hardcoded synthesis', async () => {
    // L5-3 (S40) 이후 산식:
    //   for wave w in rules.waves:
    //     freq = w.baseFrequency + (seed * w.seedMultiplier) % w.seedFrequencyMod
    //     phase = (seed * w.phaseMultiplier) % (2π)
    //     v += sin(2π * freq * u + phase) * w.weight
    //   return (positiveOnly ? max(0, v) : v) * amp
    //
    // tomato.json 값:
    //   waves[0]: { baseFrequency:2.0, seedFrequencyMod:1.5, seedMultiplier:1, phaseMultiplier:0.7, weight:0.5 }
    //   waves[1]: { baseFrequency:3.7, seedFrequencyMod:1.2, seedMultiplier:7, phaseMultiplier:1.3, weight:0.3 }
    //   waves[2]: { baseFrequency:5.1, seedFrequencyMod:1.0, seedMultiplier:13, phaseMultiplier:2.1, weight:0.2 }
    //   positiveOnly: true
    //
    // 이 값들은 L5-3 직전 hardcoded와 _완전 동일_. ⇒ output byte-identical.
    //
    // Pre-L5-3 hardcoded reference:
    function lobeNoisePreL5(u: number, amp: number, seed: number): number {
      const freq1 = 2.0 + (seed % 1.5);
      const freq2 = 3.7 + ((seed * 7) % 1.2);
      const freq3 = 5.1 + ((seed * 13) % 1.0);
      const phase1 = (seed * 0.7) % (Math.PI * 2);
      const phase2 = (seed * 1.3) % (Math.PI * 2);
      const phase3 = (seed * 2.1) % (Math.PI * 2);
      const v = (
        Math.sin(2 * Math.PI * freq1 * u + phase1) * 0.5 +
        Math.sin(2 * Math.PI * freq2 * u + phase2) * 0.3 +
        Math.sin(2 * Math.PI * freq3 * u + phase3) * 0.2
      );
      return Math.max(0, v) * amp;
    }

    const spec = await loadTomatoSpec();
    const seeds = [0, 1, 7, 13, 42, 100, 12345, 999_999];
    const us = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    const amps = [0.01, 0.05, 0.1, 0.5];

    for (const seed of seeds) {
      for (const u of us) {
        for (const amp of amps) {
          const expected = lobeNoisePreL5(u, amp, seed);
          const actual = lobeNoise(spec.lobeNoiseRules, u, amp, seed);
          expect(
            actual,
            `lobeNoise mismatch at seed=${seed} u=${u} amp=${amp}: expected=${expected} actual=${actual}`,
          ).toBeCloseTo(expected, 10);
        }
      }
    }
  });

  test('LEAF-INSTANCE-PROFILE-PARITY-01: computeLeftRightImbalance byte-identical to pre-L5-4 산식', async () => {
    // Pre-L5-4 산식 (LeafMeshBuilder.ts:201-229 originally):
    //   seed = (globalSeed * 1009 + leafNodeIdx * 31) >>> 0
    //   h(i) = ((seed * (i * 7919 + 1) + 49297) % 1000) / 1000
    //   signed(i) = h(i) * 2 - 1
    //   apexBoost = nodePositionT > 0.85 ? 1.3 : 1.0
    //   leftRightImbalance = signed(3) * 0.20 * apexBoost
    //
    // tomato.json 값:
    //   leftRightImbalanceRange: 0.20
    //   apexImbalanceThreshold: 0.85
    //   apexImbalanceBoost: 1.3
    function computeLRIPreL5(
      leafNodeIdx: number, nodePositionT: number, globalSeed: number,
    ): number {
      const seed = (globalSeed * 1009 + leafNodeIdx * 31) >>> 0;
      const h = (i: number) => ((seed * (i * 7919 + 1) + 49297) % 1000) / 1000;
      const signed = (i: number) => h(i) * 2 - 1;
      const apexBoost = nodePositionT > 0.85 ? 1.3 : 1.0;
      return signed(3) * 0.20 * apexBoost;
    }

    const spec = await loadTomatoSpec();
    const leafNodeIdxs = [0, 1, 5, 10, 25, 50];
    const positionTs = [0.0, 0.3, 0.5, 0.8, 0.85, 0.9, 1.0];
    const globalSeeds = [0, 1009, 4131, 100_000];

    for (const idx of leafNodeIdxs) {
      for (const t of positionTs) {
        for (const gs of globalSeeds) {
          const expected = computeLRIPreL5(idx, t, gs);
          const actual = computeLeftRightImbalance(spec.leafInstanceRules, idx, t, gs);
          expect(
            actual,
            `leftRightImbalance mismatch at idx=${idx} t=${t} gs=${gs}: expected=${expected} actual=${actual}`,
          ).toBeCloseTo(expected, 10);
        }
      }
    }
  });
});
