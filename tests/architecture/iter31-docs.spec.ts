// Iter 31 Phase 8 — Docs invariants.
//
// Plan §9 (sleepy-growing-pretzel.md v3).
//
// Acceptance:
//   DOCS-V0.16-01: v0.16-iter31-visual-recovery.md exists + Phase 0-7 trace
//   DOCS-LEAF-PROJECTION-01: computeLeafGeometryProjection 가이드 (LeafGrowthModel JSDoc)
//   DOCS-STEM-BUG-AUDIT-01: F3 R6 commit chain 인용
//   DOCS-LEAF-PROJECTION-BUG-AUDIT-01: F2 R5 commit chain 인용
//   DOCS-ITER32-CANDIDATES-01: R7/R8/R9/R10 자동 분류

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readDoc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

test.describe('Iter 31 Phase 8 — Docs', () => {
  test('DOCS-V0.16-01: v0.16 calibration report exists + 7 Phase trace', async () => {
    const md = await readDoc('docs/calibration-checkpoint-reports/v0.16-iter31-visual-recovery.md');
    expect(md.length, 'report 비어있음').toBeGreaterThan(5000);
    expect(md, 'Phase 0').toMatch(/Phase 0/);
    expect(md, 'Phase 1 R6').toMatch(/Phase 1.{0,30}R6/);
    expect(md, 'Phase 2 R5').toMatch(/Phase 2.{0,30}R5/);
    expect(md, 'Phase 3 R4').toMatch(/Phase 3.{0,30}R4/);
    expect(md, 'Phase 4 visual').toMatch(/Phase 4/);
    expect(md, 'Phase 5-6 analysis').toMatch(/Phase 5-6/);
    expect(md, 'Phase 7 self-loop').toMatch(/Phase 7/);
    // Delta table 명시
    expect(md, 'D=30 side max bbox delta').toMatch(/55\.6.*?36\.4/);
    expect(md, '-35% 회복').toMatch(/-35%/);
  });

  test('DOCS-LEAF-PROJECTION-01: computeLeafGeometryProjection JSDoc 가이드', async () => {
    const text = await readDoc('packages/tomato-engine/src/growth/LeafGrowthModel.ts');
    expect(text, 'LeafGeometryProjectionState 인터페이스').toMatch(/interface\s+LeafGeometryProjectionState/);
    expect(text, 'computeLeafGeometryProjection 함수').toMatch(/function\s+computeLeafGeometryProjection/);
    expect(text, 'Botanical fact 주석').toMatch(/Botanical fact|sqrt\(area\)/i);
    expect(text, '9 필드 분리 명시').toMatch(/absoluteAreaRatio.*linearAreaScale.*lengthMaturity.*apicalYouthFactor/s);
  });

  test('DOCS-STEM-BUG-AUDIT-01: R6 stem fix audit (Plan v3 Phase 1 산식)', async () => {
    const map = await readDoc('docs/iter31-problem-map.md');
    expect(map, 'R6 root cause 산식').toMatch(/synthesizeGrowthDir.*prev\.position/);
    expect(map, 'Phase 1 1-line fix').toMatch(/1-line|nodes\[i\]\.position/);
  });

  test('DOCS-LEAF-PROJECTION-BUG-AUDIT-01: R5 leaf fix audit', async () => {
    const map = await readDoc('docs/iter31-problem-map.md');
    expect(map, 'R5 LeafGenerator.ts:309 인용').toMatch(/LeafGenerator/);
    expect(map, 'leafChunk 0.32 hardcoded 인용').toMatch(/0\.32m?\s*hardcoded|hardcoded\s*0\.32/);
    expect(map, 'sqrt(current/reference) 산식 인용').toMatch(/sqrt|reference/i);
  });

  test('DOCS-ITER32-CANDIDATES-01: R7/R8/R9/R10 자동 분류', async () => {
    const md = await readDoc('docs/iter32-candidates.md');
    expect(md, 'R7 sideShootPotential').toMatch(/R7.*sideShootPotential/);
    expect(md, 'R8 plantSourceFactor').toMatch(/R8.*plantSourceFactor/);
    expect(md, 'R9 referenceLeafArea').toMatch(/R9.*referenceLeafArea/);
    expect(md, 'R10 sourceSinkSensitivity').toMatch(/R10.*sourceSinkSensitivity/);
    // Delta table 인용
    expect(md, 'Iter 30 → Iter 31 회복 표').toMatch(/D=30 side max bbox/);
  });
});
