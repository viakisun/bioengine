// Iter 36 v5 Phase H — Leaflet variation invariants.
//
// 4 position types (terminal/primary/secondary/intercalary) + intercalary 발현
// + leaf 모듈 존재 검증.

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 36 v5 — Leaflet variation (4 position types)', () => {
  test('LEAF-ENGINE-MODULE-EXISTS-01: src/scene/leaf/ 7 files 존재', async () => {
    const required = [
      'agePresets.ts',
      'correlationRules.ts',
      'shapeProfile.ts',
      'lobeNoise.ts',
      'serrationNoise.ts',
      'poseVariation.ts',
      'index.ts',
    ];
    for (const f of required) {
      const filePath = path.join(REPO_ROOT, 'src/scene/leaf', f);
      const stat = await fs.stat(filePath).catch(() => null);
      expect(stat, `leaf/${f} 존재 의무`).not.toBeNull();
    }
  });

  test('LEAF-ENGINE-5-PRESETS-01: AGE_PRESETS 5종 정의 (young/mature/old/complex/potato-leaf)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/agePresets.ts'),
      'utf-8',
    );
    expect(src, 'young preset').toContain('young:');
    expect(src, 'mature preset').toContain('mature:');
    expect(src, 'old preset').toContain('old:');
    expect(src, 'complex preset').toContain('complex:');
    expect(src, 'potato-leaf preset').toContain("'potato-leaf':");
  });

  test('LEAF-ENGINE-CORRELATION-RULES-01: applyCorrelation 산식 (사용자 §8 묶음)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/correlationRules.ts'),
      'utf-8',
    );
    expect(src, 'applyCorrelation export 의무').toContain('export function applyCorrelation');
    // complexity² for intercalary (큰 잎에서 더 빠르게)
    expect(src, 'intercalaryCount complexity² 산식 의무').toMatch(/c\s*\*\s*c/);
    // asymmetry = 0.02 + c × 0.06
    expect(src, 'asymmetry 산식 의무').toMatch(/0\.02\s*\+\s*c\s*\*\s*0\.06/);
  });

  test('LEAF-ENGINE-LEAFGEN-INTEGRATION-01: LeafGenerator buildCompoundLeaf 호출', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/LeafGenerator.ts'),
      'utf-8',
    );
    expect(src, 'leafEngineBuildCompoundLeaf import 의무')
      .toContain('buildCompoundLeaf as leafEngineBuildCompoundLeaf');
    expect(src, 'bladeRef + leafletNodes parameters 의무').toContain('bladeRef?: LeafBladeRef');
    expect(src, 'hashStr deterministic seed 의무').toContain('function hashStr');
  });
});
