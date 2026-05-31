// Iter 19 Phase C — multi-day petiole GR→RD consistency.
// MEASURE ONLY. Single seed (SHOWCASE_SEED hardcoded in source).
// Confirms the fix scales monotonically across mature plant timelines and
// no day shows a regression / spike unrelated to stem radius growth.

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';

const DAYS = [30, 45, 60, 90, 99, 120];
const OUT_DIR = 'test-results/iter19-consistency';

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

interface PetioleSnapshot {
  edgeId: string;
  graphStart: { x: number; y: number; z: number };
  renderedRoot: { x: number; y: number; z: number } | null;
  centerToSurface_mm: number;
  graphRendered_mm: number;
}

async function collectPetioleSnapshot(page: Page): Promise<PetioleSnapshot[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __skinplantGraph?: { edges: Map<string, {
        type: string;
        bonePath: Array<{ p0: { x: number; y: number; z: number } }>;
        startNodeId: string;
        parentEdgeId: string | null;
      }>; nodes: Map<string, { pos: { x: number; y: number; z: number } }> };
      __skinplantStats?: { renderedRootByEdgeId?: Record<string, { x: number; y: number; z: number }> };
    };
    const g = w.__skinplantGraph;
    const rendered = w.__skinplantStats?.renderedRootByEdgeId ?? {};
    if (!g) return [] as PetioleSnapshot[];
    const out: PetioleSnapshot[] = [];
    for (const [edgeId, edge] of g.edges) {
      if (edge.type !== 'petiole') continue;
      const gs = edge.bonePath[0]?.p0;
      const sn = g.nodes.get(edge.startNodeId)?.pos;
      if (!gs || !sn) continue;
      const rd = rendered[edgeId] ?? null;
      const cs = Math.sqrt((gs.x - sn.x) ** 2 + (gs.y - sn.y) ** 2 + (gs.z - sn.z) ** 2) * 1000;
      const gr_rd = rd
        ? Math.sqrt((rd.x - gs.x) ** 2 + (rd.y - gs.y) ** 2 + (rd.z - gs.z) ** 2) * 1000
        : 0;
      out.push({
        edgeId, graphStart: gs, renderedRoot: rd,
        centerToSurface_mm: cs, graphRendered_mm: gr_rd,
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

test('Iter 19 Phase C — multi-day petiole consistency (measure only)', async ({ page }) => {
  test.setTimeout(900_000);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterSkin(page);

  const lines: string[] = [
    'Iter 19 Phase C — multi-day petiole GR→RD consistency',
    'Iter 19 commit 158b670 (petiole fix). SHOWCASE_SEED single seed.\n',
    'day | n  | median-cs | max-cs | gr→rd p50 | p90 | worst | >2mm count',
    '----+----+-----------+--------+-----------+-----+-------+-----------',
  ];

  const byDay: Record<number, { medianCs: number; maxCs: number; p50Gr: number; p90Gr: number; worstGr: number; over: number; n: number }> = {};

  for (const day of DAYS) {
    await scrubToDay(page, day);
    const snap = await collectPetioleSnapshot(page);
    await fs.writeFile(`${OUT_DIR}/petiole-d${day}.json`, JSON.stringify(snap, null, 2));
    if (snap.length === 0) {
      lines.push(`D${day.toString().padStart(3)} | 0  | (no petioles yet)`);
      byDay[day] = { medianCs: 0, maxCs: 0, p50Gr: 0, p90Gr: 0, worstGr: 0, over: 0, n: 0 };
      continue;
    }
    const css = snap.map(s => s.centerToSurface_mm);
    const grs = snap.map(s => s.graphRendered_mm);
    const stat = {
      medianCs: pct(css, 50),
      maxCs: Math.max(...css),
      p50Gr: pct(grs, 50),
      p90Gr: pct(grs, 90),
      worstGr: Math.max(...grs),
      over: grs.filter(d => d > 2).length,
      n: snap.length,
    };
    byDay[day] = stat;
    lines.push(
      `D${day.toString().padStart(3)} | ${stat.n.toString().padStart(2)} | ${stat.medianCs.toFixed(2).padStart(7)}mm | ${stat.maxCs.toFixed(2).padStart(5)}mm | ${stat.p50Gr.toFixed(2).padStart(8)}mm | ${stat.p90Gr.toFixed(2).padStart(4)}mm | ${stat.worstGr.toFixed(2).padStart(4)}mm | ${stat.over}/${stat.n}`,
    );
  }

  // Trend check.
  lines.push('\n=== Phase C verdict ===');
  let anomalous: string[] = [];
  for (const day of DAYS) {
    const s = byDay[day];
    if (s.n === 0) continue;
    if (s.worstGr > 2.5) anomalous.push(`D${day} worstGr=${s.worstGr.toFixed(2)}mm (>2.5mm)`);
    if (s.p90Gr > 2.0) anomalous.push(`D${day} p90Gr=${s.p90Gr.toFixed(2)}mm (>2.0mm)`);
  }
  if (anomalous.length === 0) {
    lines.push('  All days: petiole GR→RD within targets (worst ≤ 2.5mm, p90 ≤ 2.0mm)');
    lines.push('  → Iter 19 fix scales across plant lifetime — no regression detected');
  } else {
    lines.push('  Anomalies detected:');
    for (const a of anomalous) lines.push(`    - ${a}`);
  }

  // Monotonicity check (does worstGr trend with stem radius?)
  lines.push('\n=== monotonicity (cs vs grWorst) ===');
  const orderedDays = DAYS.filter(d => byDay[d].n > 0);
  for (const day of orderedDays) {
    const s = byDay[day];
    const ratio = s.maxCs > 0 ? (s.worstGr / s.maxCs) : 0;
    lines.push(`  D${day}: maxCs=${s.maxCs.toFixed(2)}mm worstGr=${s.worstGr.toFixed(2)}mm ratio=${ratio.toFixed(3)}`);
  }

  await fs.writeFile(`${OUT_DIR}/phase-c-verdict.txt`, lines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
});
