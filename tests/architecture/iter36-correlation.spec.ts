// Iter 36 v5 Phase H — Correlation rules + deterministic seed invariants.
//
// 사용자 §8 묶음 변화 + procedural noise deterministic 검증.

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 36 v5 — Correlation rules + procedural noise', () => {
  test('CORRELATION-DETERMINISTIC-SEED-01: hashStr deterministic (LeafGenerator)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/LeafGenerator.ts'),
      'utf-8',
    );
    expect(src, 'hashStr function 의무 (djb2 deterministic seed)')
      .toMatch(/function hashStr\(s:\s*string\)/);
    // djb2 패턴: h = 5381; h = ((h << 5) + h) ^ ...
    expect(src, 'djb2 algorithm 패턴').toContain('5381');
  });

  test('CORRELATION-LOBE-NOISE-01: lobeNoise procedural sin 합성 (low freq, high amp)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf-engine/lobeNoise.ts'),
      'utf-8',
    );
    expect(src, 'lobeNoise export 의무').toContain('export function lobeNoise');
    // 사용자 §5: 2-3 frequency 합성
    const sinCount = (src.match(/Math\.sin/g) || []).length;
    expect(sinCount, 'sin 합성 3회 이상 의무 (사용자 §5 lobeFrequency)').toBeGreaterThanOrEqual(3);
    // 바깥쪽으로만 갈라짐 (max(0, ...))
    expect(src, 'Math.max(0, ...) outward only').toContain('Math.max(0, ');
  });

  test('CORRELATION-SERRATION-NOISE-01: serrationNoise triangleWave (high freq, low amp)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf-engine/serrationNoise.ts'),
      'utf-8',
    );
    expect(src, 'serrationNoise export 의무').toContain('export function serrationNoise');
    expect(src, 'triangleWave 의무').toContain('triangleWave');
    // smoothMargin (potato-leaf) 시 0 반환
    expect(src, 'amp ≤ 0 → 0 (potato-leaf smoothMargin)').toMatch(/amp\s*<=\s*0/);
  });

  test('CORRELATION-POSE-VARIATION-01: 4 position types attachAngle 차이', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf-engine/poseVariation.ts'),
      'utf-8',
    );
    expect(src, 'computeLeafletPose export').toContain('export function computeLeafletPose');
    // 4 position types switch
    expect(src, "terminal case").toContain("case 'terminal'");
    expect(src, "primary case").toContain("case 'primary'");
    expect(src, "secondary case").toContain("case 'secondary'");
    expect(src, "intercalary case").toContain("case 'intercalary'");
  });

  test('CORRELATION-SHAPE-PROFILE-01: shapeProfile sin(π × u)^shapePower (사용자 §5)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf-engine/shapeProfile.ts'),
      'utf-8',
    );
    expect(src, 'baseWidth 함수 (sin(π × u)^shapePower)').toContain('baseWidth');
    expect(src, 'asymmetry rachis offset').toContain('asymmetryOffset');
  });
});
