// Iter 19 Phase E — visual regression diff vs baseline/phase-E.
// Mirrors iter18b-baseline-capture camera config; captures D45 × 12 azimuth ×
// stem/full into test-results/iter19-after/ and runs bbox-aware pixel-diff.
//
// Per Iter 19 plan, dockingDiag is the primary signal; visual diff is a
// regression net: leaf-upper/leaf-lower/truss bbox should stay ≈ 0 (no
// off-target changes), stem/petiole area should show controlled change.

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';
import { compareImages } from '../lib/pixel-diff';

const DAY = 45;
const AZIMUTHS = 12;
const BASELINE_DIR = 'test-results/baseline/phase-E';
const OUT_DIR = 'test-results/iter19-after';

async function enterSkin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setMode(m: string): void; setUseImplicitMesh(v: boolean): void;
      } };
    };
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, DAY);
  await page.waitForTimeout(3500);
}

async function setCamera(page: Page, alpha: number) {
  await page.evaluate(({ a }) => {
    const w = window as unknown as {
      __debugScene?: { activeCamera?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } } };
    };
    const cam = w.__debugScene?.activeCamera;
    if (!cam) throw new Error('no camera');
    cam.alpha = a;
    cam.beta = Math.PI / 2 - 0.08;
    cam.radius = 1.8;
    cam.target.x = 0; cam.target.y = 1.2; cam.target.z = 0;
  }, { a: alpha });
  await page.waitForTimeout(500);
}

async function setView(page: Page, mode: 'stem' | 'full') {
  await page.evaluate((m) => {
    const w = window as unknown as { __skinplantView?: (m: string) => void };
    w.__skinplantView?.(m);
  }, mode);
  await page.waitForTimeout(300);
}

test('Iter 19 Phase E — D45 × 12 azimuth visual regression vs phase-E baseline', async ({ page }) => {
  test.setTimeout(600_000);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterSkin(page);

  for (let i = 0; i < AZIMUTHS; i++) {
    const alpha = -Math.PI + (2 * Math.PI * i) / AZIMUTHS;
    const deg = Math.round((alpha * 180) / Math.PI);
    const tag = `${i.toString().padStart(2, '0')}_${deg >= 0 ? 'p' : 'n'}${Math.abs(deg)}deg`;
    await setCamera(page, alpha);
    for (const mode of ['stem', 'full'] as const) {
      await setView(page, mode);
      await page.screenshot({ path: `${OUT_DIR}/d${DAY}_${tag}_${mode}.png`, fullPage: false });
    }
  }

  // Run pixel diff per shot.
  const lines: string[] = [
    'Iter 19 Phase E — visual regression vs baseline/phase-E (Iter 18B final state)',
    'Iter 19 commit 158b670 (petiole fix). D45 × 12 azimuth × stem/full = 24 images.',
    '',
    'shot                          | overall | sky   | leaf-up | truss   | stem    | leaf-low',
    '------------------------------+---------+-------+---------+---------+---------+---------',
  ];
  const bboxAccum: Record<string, number[]> = { overall: [], sky: [], 'leaf-upper': [], truss: [], stem: [], 'leaf-lower': [] };

  for (let i = 0; i < AZIMUTHS; i++) {
    const alpha = -Math.PI + (2 * Math.PI * i) / AZIMUTHS;
    const deg = Math.round((alpha * 180) / Math.PI);
    const tag = `${i.toString().padStart(2, '0')}_${deg >= 0 ? 'p' : 'n'}${Math.abs(deg)}deg`;
    for (const mode of ['stem', 'full'] as const) {
      const actual = `${OUT_DIR}/d${DAY}_${tag}_${mode}.png`;
      const baseline = `${BASELINE_DIR}/d${DAY}_${tag}_${mode}.png`;
      try {
        const res = await compareImages(actual, baseline);
        const pctByLabel: Record<string, number> = { overall: res.overall.diffPct };
        for (const r of res.regions) pctByLabel[r.label] = r.diffPct;
        for (const lbl of Object.keys(bboxAccum)) {
          if (pctByLabel[lbl] != null) bboxAccum[lbl].push(pctByLabel[lbl]);
        }
        const shot = `d${DAY}_${tag}_${mode}`.padEnd(28);
        lines.push(
          `${shot} | ${pctByLabel.overall.toFixed(2).padStart(5)}% | ${(pctByLabel.sky ?? 0).toFixed(2).padStart(4)}% | ${(pctByLabel['leaf-upper'] ?? 0).toFixed(2).padStart(6)}% | ${(pctByLabel.truss ?? 0).toFixed(2).padStart(6)}% | ${(pctByLabel.stem ?? 0).toFixed(2).padStart(6)}% | ${(pctByLabel['leaf-lower'] ?? 0).toFixed(2).padStart(6)}%`,
        );
      } catch (err) {
        lines.push(`d${DAY}_${tag}_${mode}  ERROR: ${(err as Error).message}`);
      }
    }
  }

  // Aggregate stats.
  lines.push('');
  lines.push('=== Aggregate per bbox (mean across 24 shots) ===');
  for (const lbl of Object.keys(bboxAccum)) {
    const arr = bboxAccum[lbl];
    if (arr.length === 0) continue;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = Math.max(...arr);
    lines.push(`  ${lbl.padEnd(12)} mean=${mean.toFixed(3)}%  max=${max.toFixed(3)}%`);
  }

  // Phase E verdict.
  lines.push('\n=== Phase E verdict ===');
  const leafUpperMean = bboxAccum['leaf-upper'].reduce((a, b) => a + b, 0) / (bboxAccum['leaf-upper'].length || 1);
  const leafLowerMean = bboxAccum['leaf-lower'].reduce((a, b) => a + b, 0) / (bboxAccum['leaf-lower'].length || 1);
  const trussMean = bboxAccum.truss.reduce((a, b) => a + b, 0) / (bboxAccum.truss.length || 1);
  const stemMean = bboxAccum.stem.reduce((a, b) => a + b, 0) / (bboxAccum.stem.length || 1);
  lines.push(`  leaf-upper mean: ${leafUpperMean.toFixed(3)}%  (expected ~ 0% — leaf position unchanged)`);
  lines.push(`  leaf-lower mean: ${leafLowerMean.toFixed(3)}%`);
  lines.push(`  truss mean     : ${trussMean.toFixed(3)}%  (expected ~ 0% — no peduncle/rachis/pedicel change)`);
  lines.push(`  stem mean      : ${stemMean.toFixed(3)}%  (expected SOME change — petiole embed shifted)`);
  if (leafUpperMean < 1.0 && leafLowerMean < 1.0 && trussMean < 1.0) {
    lines.push('  → leaf/truss bbox within ≤ 1% threshold. Iter 19 fix isolated to petiole/stem.');
  } else {
    lines.push('  → WARNING: leaf or truss bbox > 1% — unexpected off-target change.');
  }

  await fs.writeFile(`${OUT_DIR}/phase-e-verdict.txt`, lines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
});
