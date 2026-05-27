// Iter 18C — Petiole docking debug capture.
//
// Runs the __skinplantPetioleDock overlay on D45 + D99 showcase plants,
// captures multi-angle screenshots, and dumps the dockingDiag JSON. The
// JSON drives Phase C Case classification (A/B/C/D/E/F).

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';

const DAYS = [45, 99];
const OUT_DIR = 'test-results/iter18c-docking';

async function enterSkin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): {
        setMode(m: string): void; setUseImplicitMesh(v: boolean): void;
      } };
    };
    w.__twinStore?.getState().setMode('single-plant');
    w.__twinStore?.getState().setUseImplicitMesh(false);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setUseImplicitMesh(true);
  });
  await page.waitForTimeout(3000);
}

async function scrubToDay(page: Page, day: number) {
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

async function setCamera(page: Page, alpha: number, beta: number, radius: number, targetY: number) {
  await page.evaluate(({ a, b, r, y }) => {
    const w = window as unknown as {
      __debugScene?: { activeCamera?: { alpha: number; beta: number; radius: number; target: { x: number; y: number; z: number } } };
    };
    const cam = w.__debugScene?.activeCamera;
    if (!cam) throw new Error('no camera');
    cam.alpha = a; cam.beta = b; cam.radius = r;
    cam.target.x = 0; cam.target.y = y; cam.target.z = 0;
  }, { a: alpha, b: beta, r: radius, y: targetY });
  await page.waitForTimeout(400);
}

async function enableDocking(page: Page, worstN = 0) {
  await page.evaluate((wn) => {
    const w = window as unknown as { __skinplantPetioleDock?: (o: { enable: boolean; worstN?: number; metric?: string }) => void };
    w.__skinplantPetioleDock?.({ enable: true, worstN: wn, metric: 'tipDelta' });
  }, worstN);
  await page.waitForTimeout(600);
}

interface DockingDiag {
  perPetiole: Array<{
    edgeId: string;
    nodeIdx: number;
    plantBaseGraphDelta_mm: number;
    graphRenderedDelta_mm: number | null;
    tipDelta_mm: number | null;
    centerToSurfaceDelta_mm: number;
    severity: 'green' | 'yellow' | 'red';
  }>;
  summary: {
    totalCount: number;
    worstPlantBaseGraphDelta_mm: number;
    worstGraphRenderedDelta_mm: number;
    worstTipDelta_mm: number;
    expectedCenterToSurfaceMedian_mm: number;
  };
}

async function readDiag(page: Page): Promise<DockingDiag | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __skinplantStats?: { dockingDiag?: DockingDiag } };
    return w.__skinplantStats?.dockingDiag ?? null;
  });
}

test('Iter 18C — D45 + D99 docking debug capture + Case classification hint', async ({ page }) => {
  test.setTimeout(700_000);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterSkin(page);

  for (const day of DAYS) {
    await scrubToDay(page, day);

    // 1) Dump the full JSON (all petioles, no rendering yet) — set worstN=0
    //    AND enable so JSON populates. enable=true still publishes; we render
    //    spheres but switch view to stem-only later to hide leaves.
    await enableDocking(page, 0);
    const diag = await readDiag(page);
    await fs.writeFile(`${OUT_DIR}/diag_d${day}.json`, JSON.stringify(diag, null, 2));
    // eslint-disable-next-line no-console
    console.log(`[D${day}] perPetiole=${diag?.perPetiole.length} summary=`, diag?.summary);

    // 2) Capture: side / closeup / front × full view.
    const views = [
      { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.1, radius: 1.5, targetY: 1.4, tag: 'side' },
      { alpha: -Math.PI / 2, beta: Math.PI / 2 - 0.25, radius: 0.9, targetY: 1.5, tag: 'closeup' },
      { alpha: 0, beta: Math.PI / 2 - 0.1, radius: 1.5, targetY: 1.4, tag: 'front' },
    ];
    for (const v of views) {
      await setCamera(page, v.alpha, v.beta, v.radius, v.targetY);
      await page.screenshot({ path: `${OUT_DIR}/d${day}_${v.tag}.png`, fullPage: false });
    }

    // 3) Stem-only view to make markers more readable.
    await page.evaluate(() => {
      const w = window as unknown as { __skinplantView?: (m: string) => void };
      w.__skinplantView?.('stem');
    });
    await page.waitForTimeout(400);
    for (const v of views) {
      await setCamera(page, v.alpha, v.beta, v.radius, v.targetY);
      await page.screenshot({ path: `${OUT_DIR}/d${day}_${v.tag}_stemonly.png`, fullPage: false });
    }
    // Restore full view before next day.
    await page.evaluate(() => {
      const w = window as unknown as { __skinplantView?: (m: string) => void };
      w.__skinplantView?.('full');
    });
  }

  // 4) Auto Case classification hint — read both diags + write a single TXT
  //    table.
  const lines: string[] = ['Iter 18C — Case classification hint\n'];
  for (const day of DAYS) {
    const raw = await fs.readFile(`${OUT_DIR}/diag_d${day}.json`, 'utf-8');
    const diag = JSON.parse(raw) as DockingDiag;
    lines.push(`\n=== D${day} (n=${diag.summary.totalCount}) ===`);
    lines.push(`  worst PB→GR = ${diag.summary.worstPlantBaseGraphDelta_mm.toFixed(2)} mm`);
    lines.push(`  worst GR→RD = ${diag.summary.worstGraphRenderedDelta_mm.toFixed(2)} mm`);
    lines.push(`  worst Tip→Leaf = ${diag.summary.worstTipDelta_mm.toFixed(2)} mm`);
    lines.push(`  median Center→Surface = ${diag.summary.expectedCenterToSurfaceMedian_mm.toFixed(2)} mm (= stem radius expected)`);
    // Top 5 worst
    const sorted = [...diag.perPetiole].sort((a, b) => (b.tipDelta_mm ?? 0) - (a.tipDelta_mm ?? 0));
    lines.push('  top-5 worst tipDelta:');
    lines.push('    edgeId | pb→gr | gr→rd | tip→leaf | center→surf | sev');
    for (const d of sorted.slice(0, 5)) {
      lines.push(`    ${d.edgeId.padEnd(28)} | ${d.plantBaseGraphDelta_mm.toFixed(2).padStart(5)} | ${(d.graphRenderedDelta_mm ?? -1).toFixed(2).padStart(5)} | ${(d.tipDelta_mm ?? -1).toFixed(2).padStart(7)} | ${d.centerToSurfaceDelta_mm.toFixed(2).padStart(5)} | ${d.severity}`);
    }
    // Heuristic Case hint
    const pb = diag.summary.worstPlantBaseGraphDelta_mm;
    const gr = diag.summary.worstGraphRenderedDelta_mm;
    const tip = diag.summary.worstTipDelta_mm;
    const center = diag.summary.expectedCenterToSurfaceMedian_mm;
    const hints: string[] = [];
    if (pb > 1) hints.push(`Case A (PlantBase→Graph): worst ${pb.toFixed(2)}mm`);
    if (gr > 1) hints.push(`Case B (Graph→Render): worst ${gr.toFixed(2)}mm`);
    if (tip > 1) hints.push(`Case C (Tip→Leaf): worst ${tip.toFixed(2)}mm`);
    if (pb <= 1 && gr <= 1 && tip <= 1 && center > 1) {
      hints.push(`Case D (Centerline-Surface false positive): center→surface=${center.toFixed(2)}mm (~ stem radius) but all real deltas ≤1mm`);
    }
    lines.push('  → Case hint: ' + (hints.length ? hints.join(' / ') : 'all clean (no mismatch)'));
  }
  await fs.writeFile(`${OUT_DIR}/case-hint.txt`, lines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
});
