// Iter 19 Phase B — audit peduncle/rachis/pedicel for the same Case B
// (Graph→Render embed mismatch) pattern that motivated the petiole fix.
// MEASURE ONLY. Per Iter 19 plan, no fix this Iter; Phase G decides Iter 20
// scope based on these results.

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';

const DAYS = [45, 99];
const OUT_DIR = 'test-results/iter19-multi-edge';
const TARGET_TYPES = ['peduncle', 'rachis', 'pedicel'] as const;

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
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
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

interface EdgeDiag {
  edgeId: string;
  edgeType: string;
  parentEdgeId: string | null;
  graphStart: { x: number; y: number; z: number };
  renderedRoot: { x: number; y: number; z: number } | null;
  graphRenderedDelta_mm: number;
  hasRendered: boolean;
}

async function collectEdgeDiag(page: Page): Promise<EdgeDiag[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __skinplantGraph?: { edges: Map<string, {
        type: string;
        bonePath: Array<{ p0: { x: number; y: number; z: number } }>;
        parentEdgeId: string | null;
        startNodeId: string;
      }> };
      __skinplantStats?: { renderedRootByEdgeId?: Record<string, { x: number; y: number; z: number }> };
    };
    const g = w.__skinplantGraph;
    const rendered = w.__skinplantStats?.renderedRootByEdgeId ?? {};
    if (!g) return [] as EdgeDiag[];
    const out: EdgeDiag[] = [];
    for (const [edgeId, edge] of g.edges) {
      if (edge.parentEdgeId === null) continue;
      const gs = edge.bonePath[0]?.p0;
      if (!gs) continue;
      const rd = rendered[edgeId] ?? null;
      const delta_mm = rd
        ? Math.sqrt((rd.x - gs.x) ** 2 + (rd.y - gs.y) ** 2 + (rd.z - gs.z) ** 2) * 1000
        : 0;
      out.push({
        edgeId, edgeType: edge.type, parentEdgeId: edge.parentEdgeId,
        graphStart: gs, renderedRoot: rd, graphRenderedDelta_mm: delta_mm,
        hasRendered: rd !== null,
      });
    }
    return out;
  });
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p / 100)] ?? 0;
}

test('Iter 19 Phase B — peduncle/rachis/pedicel docking audit (measure only)', async ({ page }) => {
  test.setTimeout(700_000);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterSkin(page);

  const lines: string[] = ['Iter 19 Phase B — multi-edge GR→RD audit (MEASURE ONLY)\n'];
  lines.push('Iter 19 commit 158b670 — petiole fix only. peduncle/rachis/pedicel unchanged.\n');

  const allByDay: Record<number, EdgeDiag[]> = {};

  for (const day of DAYS) {
    await scrubToDay(page, day);
    const diag = await collectEdgeDiag(page);
    allByDay[day] = diag;
    await fs.writeFile(`${OUT_DIR}/edge-diag-d${day}.json`, JSON.stringify(diag, null, 2));

    lines.push(`\n=== D${day} ===`);

    // Per-edge-type breakdown.
    for (const type of ['petiole', ...TARGET_TYPES] as const) {
      const subset = diag.filter(d => d.edgeType === type);
      if (subset.length === 0) {
        lines.push(`  ${type.padEnd(10)} | n=0 (no edges of this type)`);
        continue;
      }
      const withRender = subset.filter(d => d.hasRendered);
      const deltas = withRender.map(d => d.graphRenderedDelta_mm);
      const noRender = subset.filter(d => !d.hasRendered);
      lines.push(`  ${type.padEnd(10)} | n=${subset.length} rendered=${withRender.length} no-rd=${noRender.length}`);
      if (deltas.length > 0) {
        const p50 = pct(deltas, 50);
        const p90 = pct(deltas, 90);
        const worst = Math.max(...deltas);
        const overThreshold = deltas.filter(d => d > 2).length;
        lines.push(`             p50=${p50.toFixed(2)}mm p90=${p90.toFixed(2)}mm worst=${worst.toFixed(2)}mm  >2mm: ${overThreshold}/${deltas.length}`);
        // Top 3 worst
        const top = [...withRender].sort((a, b) => b.graphRenderedDelta_mm - a.graphRenderedDelta_mm).slice(0, 3);
        for (const t of top) {
          lines.push(`             ${t.edgeId} → gr→rd=${t.graphRenderedDelta_mm.toFixed(2)}mm`);
        }
      }
    }
  }

  // Phase B verdict.
  lines.push('\n=== Phase B verdict ===');
  let iter20FixNeeded = false;
  const verdictByType: Record<string, string> = {};
  for (const type of TARGET_TYPES) {
    let typeMax = 0;
    let typeOverCount = 0;
    let typeTotal = 0;
    for (const day of DAYS) {
      const subset = allByDay[day].filter(d => d.edgeType === type && d.hasRendered);
      typeTotal += subset.length;
      for (const d of subset) {
        if (d.graphRenderedDelta_mm > typeMax) typeMax = d.graphRenderedDelta_mm;
        if (d.graphRenderedDelta_mm > 2) typeOverCount++;
      }
    }
    if (typeTotal === 0) {
      verdictByType[type] = 'n/a (no edges of this type in test days)';
    } else if (typeMax <= 2.5) {
      verdictByType[type] = `OK (worst ${typeMax.toFixed(2)}mm, ${typeOverCount}/${typeTotal} > 2mm) — no Iter 20 needed`;
    } else {
      verdictByType[type] = `Case B pattern detected (worst ${typeMax.toFixed(2)}mm, ${typeOverCount}/${typeTotal} > 2mm) — Iter 20 fix recommended`;
      iter20FixNeeded = true;
    }
    lines.push(`  ${type.padEnd(10)} | ${verdictByType[type]}`);
  }
  lines.push(`\n  Overall: ${iter20FixNeeded ? 'Iter 20 fix needed for at least one edge type' : 'All non-petiole edge types within tolerance — Iter 20 fix NOT needed for embed/radialDir'}`);

  await fs.writeFile(`${OUT_DIR}/phase-b-verdict.txt`, lines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
});
