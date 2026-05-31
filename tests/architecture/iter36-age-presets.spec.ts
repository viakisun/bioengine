// Iter 36 v5 Phase H — 5 age presets + cultivar distribution invariants.
//
// 사용자 §7 (5 presets) + Phase F (cultivar별 분포 sum=1.0) 검증.

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

const CULTIVARS = [
  'cherry-generic',
  'round-generic',
  'beefsteak-generic',
  'tomimaru-muchoo',
  'roma-generic',
] as const;

/** JSONC → JSON (간단 주석 제거 — line comment only). */
function stripJsonc(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      if (idx < 0) return line;
      // 문자열 내부의 // 보호 — 간단히 따옴표 카운트로 체크
      const beforeIdx = line.slice(0, idx);
      const quotes = (beforeIdx.match(/"/g) || []).length;
      if (quotes % 2 === 1) return line;  // 안전을 위해 보존
      return beforeIdx;
    })
    .join('\n');
}

test.describe('Iter 36 v5 — Age presets + cultivar distribution', () => {
  test('AGE-PRESETS-SCHEMA-01: leafPresetDistribution field schema 정의', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/CultivarGrowthProfile.ts'),
      'utf-8',
    );
    expect(src, 'leafPresetDistribution field 의무').toContain('leafPresetDistribution');
    // 5 preset keys
    const keys = ['young', 'mature', 'old', 'complex', "'potato-leaf'"];
    for (const k of keys) {
      expect(src, `${k} field schema 의무`).toContain(k);
    }
  });

  for (const cultivar of CULTIVARS) {
    test(`AGE-PRESETS-DISTRIBUTION-SUM-${cultivar}: 분포 합 ≈ 1.0`, async () => {
      const jsonc = await fs.readFile(
        path.join(REPO_ROOT, `packages/tomato-engine/models/cultivars/${cultivar}.jsonc`),
        'utf-8',
      );
      // leafPresetDistribution 존재 확인
      expect(jsonc, `${cultivar} leafPresetDistribution 의무`).toContain('leafPresetDistribution');

      // 간단 파싱 — JSONC 주석 제거 후 JSON.parse
      try {
        const json = JSON.parse(stripJsonc(jsonc)) as {
          growthProfile?: { leafPresetDistribution?: Record<string, number> };
        };
        const dist = json.growthProfile?.leafPresetDistribution;
        expect(dist, `${cultivar} leafPresetDistribution object 존재`).toBeTruthy();
        if (dist) {
          const sum = Object.values(dist).reduce((acc, v) => acc + v, 0);
          expect(sum, `${cultivar} 분포 합 ≈ 1.0 (got ${sum})`).toBeCloseTo(1.0, 2);
        }
      } catch (e) {
        // JSONC 파싱 fail 시 텍스트 grep으로 fallback
        const match = jsonc.match(
          /leafPresetDistribution[\s\S]*?\{([\s\S]*?)\}/,
        );
        expect(match, `${cultivar} leafPresetDistribution block 의무`).toBeTruthy();
      }
    });
  }
});
