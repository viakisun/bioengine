// Iter 19 Phase D — floatingCandidateCount metric classification.
// MEASURE ONLY. Compares post-Iter-19 raw floatingCandidateCount against
// alternative metrics to identify false positives. Per plan, metric
// redefinition is deferred to Iter 20 if needed.
//
// Baseline (Iter 18A → 18B, pre-Iter-19): floatingCandidateCount = 41 at D45
// (audit doc v0.13-iter18c-petiole-docking-debug.md noted false positive
// suspicion).
//
// Iter 19 fix changed:
// - parentSurfacePoint now uses interpolated parentCenter + interpolated
//   parentRadius (instead of nearest endpoint snap)
// - For petioles, radialDir derived from PlantBase azimuth
// → expected: floatingCandidateCount drops significantly.

import { test, type Page } from '@playwright/test';
import * as fs from 'node:fs/promises';

const DAYS = [45, 99];
const OUT_DIR = 'test-results/iter19-floating';

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

interface FloatingSnapshot {
  rawFloatingCandidateCount: number;
  rawFloatingIds: string[];
  // For petioles: 3 alternative reference metrics.
  // All metrics count edges where the chosen reference distance > 1mm.
  // raw uses runtime parentSurfacePoint.
  petioleAlternatives: {
    vsRenderedRoot: number;       // ||bonePath[0].p0 - renderedRoot|| > 1mm
    vsGraphStart: number;         // sanity baseline, always 0 (same point)
  };
  petioleN: number;
}

async function collectFloating(page: Page): Promise<FloatingSnapshot> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __skinplantStats?: {
        floatingCandidateCount?: number;
        floatingCandidateIds?: string[];
        renderedRootByEdgeId?: Record<string, { x: number; y: number; z: number }>;
      };
      __skinplantGraph?: { edges: Map<string, {
        type: string;
        bonePath: Array<{ p0: { x: number; y: number; z: number } }>;
      }> };
    };
    const stats = w.__skinplantStats;
    const g = w.__skinplantGraph;
    const rendered = stats?.renderedRootByEdgeId ?? {};
    let vsRenderedRoot = 0;
    let vsGraphStart = 0;
    let petioleN = 0;
    if (g) {
      for (const [edgeId, edge] of g.edges) {
        if (edge.type !== 'petiole') continue;
        petioleN++;
        const gs = edge.bonePath[0]?.p0;
        const rd = rendered[edgeId];
        if (!gs || !rd) continue;
        const d = Math.sqrt((gs.x - rd.x) ** 2 + (gs.y - rd.y) ** 2 + (gs.z - rd.z) ** 2);
        if (d > 0.001) vsRenderedRoot++;
      }
    }
    return {
      rawFloatingCandidateCount: stats?.floatingCandidateCount ?? -1,
      rawFloatingIds: (stats?.floatingCandidateIds ?? []).slice(0, 100),
      petioleAlternatives: { vsRenderedRoot, vsGraphStart },
      petioleN,
    };
  });
}

test('Iter 19 Phase D — floatingCandidateCount metric classification (measure only)', async ({ page }) => {
  test.setTimeout(700_000);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await enterSkin(page);

  const lines: string[] = [
    'Iter 19 Phase D — floating metric classification',
    'Iter 19 commit 158b670 (petiole fix). Baseline (Iter 18B): 41 at D45.\n',
    'day | raw | vsGraphStart | vsRenderedRoot(petiole) | petioleN | breakdown of raw IDs',
    '----+-----+--------------+--------------------------+----------+----------------------',
  ];

  for (const day of DAYS) {
    await scrubToDay(page, day);
    const f = await collectFloating(page);
    await fs.writeFile(`${OUT_DIR}/floating-d${day}.json`, JSON.stringify(f, null, 2));
    // Classify raw IDs by edge type.
    const byType: Record<string, number> = {};
    for (const id of f.rawFloatingIds) {
      const m = id.match(/^e:(\w+):/);
      const t = m ? m[1] : 'unknown';
      byType[t] = (byType[t] || 0) + 1;
    }
    const breakdown = Object.entries(byType).map(([t, c]) => `${t}:${c}`).join(',');
    lines.push(
      `D${day.toString().padStart(3)} | ${f.rawFloatingCandidateCount.toString().padStart(3)} | ${f.petioleAlternatives.vsGraphStart.toString().padStart(12)} | ${f.petioleAlternatives.vsRenderedRoot.toString().padStart(24)} | ${f.petioleN.toString().padStart(8)} | ${breakdown || '(none)'}`,
    );
  }

  lines.push('\n=== Phase D verdict ===');
  lines.push('Pre-Iter-19 baseline (Iter 18B D45): raw=41 (suspected false positive)');
  lines.push('Post-Iter-19 (above): see raw column.');
  lines.push('');
  lines.push('Interpretation:');
  lines.push('  vsGraphStart=0  → trivially identical (bonePath[0].p0 = graphRoot), baseline.');
  lines.push('  vsRenderedRoot  → number of petioles where rendered root is > 1mm from graph start.');
  lines.push('                    This is the metric that matters for visual disconnect.');
  lines.push('  raw count       → still uses runtime parentSurfacePoint comparison. Lower raw');
  lines.push('                    after Iter 19 fix = parent interpolation tightened the metric.');
  lines.push('');
  lines.push('Iter 20 recommendation: if raw count still inflated relative to vsRenderedRoot,');
  lines.push('the metric is a false positive indicator — recommend replacing with vsRenderedRoot.');

  await fs.writeFile(`${OUT_DIR}/phase-d-verdict.txt`, lines.join('\n'));
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
});
