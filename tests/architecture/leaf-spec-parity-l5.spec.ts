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
//
// L5-7 (S44) 추가:
//   LEAF-SPEC-COVERAGE-01    — audit Section 1 entries 모두 migrated
//   LEAF-SPEC-SCHEMA-V11-01  — tomato.json schemaVersion '1.1' + 5 새 sections

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseLeafSpec } from '../../src/scene/leaf/LeafSpec';
import { lobeNoise, computeLeftRightImbalance } from '../../src/scene/leaf/LeafMeshBuilder';
import {
  lobeTaperWeight,
  serrationTaperWeight,
} from '../../src/scene/leaf/LeafletProfile';
import { computeLeafMacroState } from '../../src/scene/leaf/LeafMeshBuilder';

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

  test('LEAF-SPEC-SCHEMA-V11-01: tomato.json schemaVersion 1.1 + 5 new sections', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/data/leaf/specs/tomato.json'),
      'utf-8',
    );
    const raw = JSON.parse(text);
    expect(raw.schemaVersion).toBe('1.1');
    expect(raw.lobeNoiseRules, 'lobeNoiseRules section').toBeDefined();
    expect(raw.lobeNoiseRules.waves).toHaveLength(3);
    expect(raw.leafInstanceRules, 'leafInstanceRules section').toBeDefined();
    expect(raw.shapeProfileRules, 'shapeProfileRules section').toBeDefined();
    expect(raw.edgeAsymmetryRules, 'edgeAsymmetryRules section').toBeDefined();
    expect(raw.poseRules.pitchNoiseRangeRad, 'poseRules pitch rad rename').toBeDefined();
    expect(raw.poseRules.rollNoiseRangeRad, 'poseRules roll rad rename').toBeDefined();
    expect(raw.poseRules.twistNoiseRangeRad, 'poseRules twist rad rename').toBeDefined();
  });

  test('LEAF-SPEC-COVERAGE-01: audit Section 1 entries 모두 migrated (botanical magic 0 in engine)', async () => {
    // 원칙 #45 — Code = formula structure, Data = all values.
    //
    // Audit Section 1에 등록된 모든 botanical magic이 LeafMeshBuilder.ts /
    // LeafletProfile.ts 활성 코드에서 _제거_ 또는 _spec.* 참조_로 대체됐는지 검증.
    //
    // Scope:
    //   src/scene/leaf/LeafMeshBuilder.ts
    //   src/scene/leaf/LeafletProfile.ts
    //
    // 검증 패턴 (정확 산식 — false positive 회피):
    const builder = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafMeshBuilder.ts'),
      'utf-8',
    );
    const profile = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafletProfile.ts'),
      'utf-8',
    );

    // 활성 코드만 — comment 제거
    const stripComments = (text: string): string => {
      return text
        .split('\n')
        .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n');
    };
    const builderCode = stripComments(builder);
    const profileCode = stripComments(profile);

    // Botanical magic 산식 (audit Section 1):
    const forbidden = [
      // Lobe noise (S40 migrated)
      { re: /freq1\s*=\s*2\.0/, name: 'lobeNoise freq1 base hardcoded' },
      { re: /freq2\s*=\s*3\.7/, name: 'lobeNoise freq2 base hardcoded' },
      { re: /freq3\s*=\s*5\.1/, name: 'lobeNoise freq3 base hardcoded' },
      // Correlation (S33 migrated)
      { re: /\b10\s*\+\s*c\s*\*\s*18\b/, name: 'serration freq 산식 hardcoded' },
      { re: /\b0\.02\s*\+\s*c\s*\*\s*0\.06\b/, name: 'asymmetry 산식 hardcoded' },
      // Pose (S33 migrated)
      { re: /-5\s*\+\s*15\s*\*\s*maturity/, name: 'foldDroopDeg 산식 hardcoded' },
      // leafInstance dead (S41 removed)
      { re: /signed\(1\)\s*\*\s*0\.15/, name: 'rachisCurvature hardcoded (dead-removed)' },
      { re: /signed\(2\)\s*\*\s*8\b/, name: 'leafDroopNoise hardcoded (dead-removed)' },
      { re: /nodePositionT\s*>\s*0\.85\s*\?\s*1\.3/, name: 'apex boost hardcoded (S41 migrated)' },
      // Shape profile (S42 migrated)
      { re: /u\s*<\s*0\.2\s*\?/, name: 'baseTransitionEndU hardcoded' },
      // Cultivar clamp (S42 migrated)
      { re: /Math\.max\(0\.7,\s*Math\.min\(1\.0/, name: 'baseShape clamp hardcoded' },
      { re: /Math\.max\(1\.0,\s*Math\.min\(2\.0/, name: 'tipSharpness clamp hardcoded' },
      // Senescence (S42 migrated)
      { re: /senescence\.curl\s*\*\s*0\.5\b/, name: 'senescenceCurlWeight hardcoded' },
      // Maturity envelope (S43 migrated)
      { re: /\(maturity\s*-\s*0\.2\)\s*\/\s*\(0\.8\s*-\s*0\.2\)/, name: 'maturity envelope hardcoded' },
      { re: /0\.2\s*\+\s*\(1\.0\s*-\s*0\.2\)\s*\*/, name: 'openness base hardcoded' },
      // Edge asymmetry (S43 migrated)
      { re: /lobe\s*\*\s*0\.85\s*\+\s*teeth\s*\*\s*1\.1/, name: 'edge asymmetry weights hardcoded' },
      // AGE_PRESETS (S44 removed)
      { re: /export const AGE_PRESETS/, name: 'AGE_PRESETS const (should be removed)' },
      // dead functions (S41 removed)
      { re: /export function computeLeafInstanceProfile\b/, name: 'computeLeafInstanceProfile (dead-removed)' },
      { re: /export function computeLeafletPose\b/, name: 'computeLeafletPose (dead-removed)' },
    ];

    const offenders: Array<{ file: string; pattern: string }> = [];
    for (const { re, name } of forbidden) {
      if (re.test(builderCode)) offenders.push({ file: 'LeafMeshBuilder.ts', pattern: name });
      if (re.test(profileCode)) offenders.push({ file: 'LeafletProfile.ts', pattern: name });
    }
    expect(
      offenders,
      `Audit Section 1 entries must be migrated to spec or removed (원칙 #45).\n` +
        `Found: ${JSON.stringify(offenders, null, 2)}`,
    ).toEqual([]);
  });

  test('LEAF-SERRATION-TAPER-MIN-01: serrationTaperWeight floor 보존 (L6-A-1)', async () => {
    // ★ L6-A-1 — lobe와 serration taper 정책 분리.
    //   lobe: full sin(πt) — 끝에서 0
    //   serration: max(min, sin(πt)) — 끝에서도 min 만큼 톱니 보존
    const spec = await loadTomatoSpec();
    const minWeight = spec.shapeProfileRules.serrationTaperMin;
    expect(minWeight, 'serrationTaperMin > 0 (base/tip 톱니 보존)').toBeGreaterThan(0);
    expect(minWeight, 'serrationTaperMin <= 1').toBeLessThanOrEqual(1);

    // 끝쪽 (t=0, t=1)에서 lobe는 0, serration은 minWeight
    expect(lobeTaperWeight(0)).toBeCloseTo(0, 6);
    expect(lobeTaperWeight(1)).toBeCloseTo(0, 6);
    expect(serrationTaperWeight(0, minWeight)).toBeCloseTo(minWeight, 6);
    expect(serrationTaperWeight(1, minWeight)).toBeCloseTo(minWeight, 6);

    // 가운데 (t=0.5)에서는 둘 다 1
    expect(lobeTaperWeight(0.5)).toBeCloseTo(1, 6);
    expect(serrationTaperWeight(0.5, minWeight)).toBeCloseTo(1, 6);

    // 임의 t에서 serration >= lobe (floor 효과 검증)
    for (const t of [0.05, 0.1, 0.2, 0.8, 0.9, 0.95]) {
      expect(
        serrationTaperWeight(t, minWeight),
        `serrationTaper(${t}) >= lobeTaper(${t})`,
      ).toBeGreaterThanOrEqual(lobeTaperWeight(t));
    }
  });

  test('LEAF-MACRO-VARIATION-SPEC-01: spec.leafInstanceRules에 macro 3 fields 정의 (L6-A-6 step 1)', async () => {
    // ★ L6-A-6 — macro variation reporting only. spec field + computeLeafMacroState.
    //   mesh path 연결은 step 2 (S52).
    const spec = await loadTomatoSpec();
    expect(spec.leafInstanceRules.curlMultiplier, 'curlMultiplier 정의').toBeDefined();
    expect(spec.leafInstanceRules.opennessOffset, 'opennessOffset 정의').toBeDefined();
    expect(spec.leafInstanceRules.rachisCurvatureBias, 'rachisCurvatureBias 정의').toBeDefined();

    // 각 entry는 baseline + range
    expect(typeof spec.leafInstanceRules.curlMultiplier.baseline).toBe('number');
    expect(typeof spec.leafInstanceRules.curlMultiplier.range).toBe('number');

    // computeLeafMacroState 결정성 — 동일 idx/seed → 동일 출력
    const a = computeLeafMacroState(spec.leafInstanceRules, 5, 42);
    const b = computeLeafMacroState(spec.leafInstanceRules, 5, 42);
    expect(a.curlMultiplier).toBeCloseTo(b.curlMultiplier, 10);
    expect(a.opennessOffset).toBeCloseTo(b.opennessOffset, 10);

    // baseline 근처 (range = 1.0/0.10 등 작음)
    expect(a.curlMultiplier).toBeGreaterThanOrEqual(spec.leafInstanceRules.curlMultiplier.baseline - spec.leafInstanceRules.curlMultiplier.range);
    expect(a.curlMultiplier).toBeLessThanOrEqual(spec.leafInstanceRules.curlMultiplier.baseline + spec.leafInstanceRules.curlMultiplier.range);
  });
});
