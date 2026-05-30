// Iter 31 Phase 0 — Baseline freeze invariants.
//
// Plan §1 (sleepy-growing-pretzel.md v3).
//
// Acceptance:
//   BASELINE-DUMP-FROZEN-01: multi-timepoint-leaf-node-data.md 존재
//   BASELINE-D30-EVIDENCE-01: side:0 idx=0 (target=102, current=102, bbox=55.6) 인용
//   BASELINE-STEM-COLLAPSE-01: D=30 apex Δy=0.07cm 인용
//   BASELINE-FRAME-LOCK-01: D=30/40/50 normal.y=0 evidence 인용
//   BASELINE-LITERATURE-01: TOMGRO + Marcelis + Heuvelink reference 명시

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readDoc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

test.describe('Iter 31 Phase 0 — Baseline freeze', () => {
  test('BASELINE-DUMP-FROZEN-01: multi-timepoint data file exists', async () => {
    const data = await readDoc('docs/iter31-multi-timepoint-leaf-node-data.md');
    expect(data.length, 'multi-timepoint data 비어있음').toBeGreaterThan(10000);
    expect(data, 'D=10~D=90 9시점').toMatch(/## D=10/);
    expect(data).toMatch(/## D=90/);
  });

  test('BASELINE-D30-EVIDENCE-01: D=30 side:0 idx=0 mature small leaf bbox 폭주 인용', async () => {
    const baseline = await readDoc('docs/iter31-baseline.md');
    expect(baseline, 'side:0 idx=0 target=102 인용').toMatch(/target.{0,30}102/);
    expect(baseline, 'bbox 55.6cm 인용').toMatch(/55\.6/);
    expect(baseline, '5.5× 폭주 배수 명시').toMatch(/5\.5/);
  });

  test('BASELINE-STEM-COLLAPSE-01: stem apex Δy collapse 인용', async () => {
    const baseline = await readDoc('docs/iter31-baseline.md');
    expect(baseline, 'apex Δy = 0.06cm 또는 0.07cm 패턴').toMatch(/0\.0[67]/);
    expect(baseline, 'apex collapse 패턴 시점').toMatch(/D=30/);
  });

  test('BASELINE-FRAME-LOCK-01: frame.normal.y=0 evidence 인용', async () => {
    const baseline = await readDoc('docs/iter31-baseline.md');
    expect(baseline, 'normal.y=0 명시').toMatch(/normal\.y/);
    expect(baseline, 'XZ plane lock 명시').toMatch(/XZ.{0,10}(lock|plane)|horizontal.{0,15}plane/i);
    expect(baseline, 'WORLD_UP × tangent 산식 인용').toMatch(/WORLD_UP.*tangent/);
  });

  test('BASELINE-LITERATURE-01: TOMGRO + Marcelis + Heuvelink reference', async () => {
    const baseline = await readDoc('docs/iter31-baseline.md');
    expect(baseline).toMatch(/TOMGRO/i);
    expect(baseline).toMatch(/Marcelis/i);
    expect(baseline).toMatch(/Heuvelink/i);
    expect(baseline, 'sink strength 또는 LAI 또는 plastochron 인용').toMatch(/sink strength|LAI|plastochron/i);
  });

  test('Problem map exists + R7/R8 분리', async () => {
    const map = await readDoc('docs/iter31-problem-map.md');
    expect(map, 'R6 F3 인용').toMatch(/R6|F3/);
    expect(map, 'R5 F2 인용').toMatch(/R5|F2/);
    expect(map, 'R4 F1 인용').toMatch(/R4|F1/);
    expect(map, 'R7 Iter 32 후보').toMatch(/R7/);
    expect(map, 'R8 Iter 32 후보').toMatch(/R8/);
    expect(map, '1차 vs 2차 결함 분리').toMatch(/1차|2차|Iter 32 후보/);
  });
});
