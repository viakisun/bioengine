// Iter 36 v5 Phase H — Leaf ontogeny linear gradient invariants.
//
// 사용자 "linear gradient" feedback 보호:
//   - YOUNG_LEAF_FULL_LENGTH_TT 250 (apex 5 nodes linear ramp)
//   - petiole clamp 0.05 (young 0.6cm)
//   - 6단계 ontogeny 매핑 검증 (source-level)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 36 v5 — Leaf ontogeny (linear gradient)', () => {
  test('LEAF-AGE-YOUNG-LENGTH-TT-01: YOUNG_LEAF_FULL_LENGTH_TT = 250 (Iter 36 v5)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/growth/LeafGrowthModel.ts'),
      'utf-8',
    );
    // v1: 80 (6 day, too fast) → v5: 250 (19 day, linear ramp)
    expect(src, 'YOUNG_LEAF_FULL_LENGTH_TT = 250 의무 (v5)').toMatch(
      /const\s+YOUNG_LEAF_FULL_LENGTH_TT\s*=\s*250\b/,
    );
    // 회귀 방지 — 80 사용 금지
    expect(src, 'YOUNG_LEAF_FULL_LENGTH_TT = 80 회귀 금지 (Iter 36 v5 폐기)').not.toMatch(
      /const\s+YOUNG_LEAF_FULL_LENGTH_TT\s*=\s*80\b/,
    );
  });

  test('LEAF-PETIOLE-CLAMP-FLOOR-01: petioleLengthM clamp floor 0.05 (Iter 36 v5)', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/PlantBase.ts'),
      'utf-8',
    );
    // v1: 0.3 (3.6cm 고정) → v5: 0.05 (0.6cm young leaf)
    expect(src, 'petiole clamp floor 0.05 의무 (v5)').toMatch(
      /petioleLengthM\s*=\s*0\.12\s*\*\s*Math\.max\(0\.05,/,
    );
    // 회귀 방지 — 0.3 사용 금지
    expect(src, 'petiole clamp floor 0.3 회귀 금지 (Iter 36 v5 폐기)').not.toMatch(
      /petioleLengthM\s*=\s*0\.12\s*\*\s*Math\.max\(0\.3,/,
    );
  });
});
