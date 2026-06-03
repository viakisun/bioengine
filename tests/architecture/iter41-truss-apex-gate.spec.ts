// ★ S115 (Iter 41) — Truss/Fruit apex-distance visibility gate invariants.
//
// 사용자 진단: "생장점 근처에 토마토가 열려있잖아".
// 본 phase가 visual gate — engine cohort 보존, visibility/diameter cap만 적용.
//
// 본 spec은 _runtime_ — dev server 사용, __lastPlantBase eval로 실제 build 검증.

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');
const PLANTBASE = path.join(REPO_ROOT, 'src/plant/PlantBase.ts');

async function readFile(p: string): Promise<string> {
  return fs.readFile(p, 'utf-8');
}

interface TrussSample {
  nodeIdx: number;
  nodeFromApex: number;
  distanceFromApexM: number;
  visibility: { visible: boolean; reason: string };
  floralSites: Array<{
    index: number;
    stage: string;
    fruit?: { diameterMm: number };
  }>;
}

async function buildPlantTrussesForTest(page: Page, day = 80): Promise<TrussSample[]> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000);
  await page.evaluate((d) => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute?: (m: number) => void } } };
    const setter = w.__twinStore?.getState().setSinglePlantMinute;
    if (typeof setter === 'function') setter(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);

  return page.evaluate(() => {
    const w = window as unknown as {
      __lastPlantBase?: {
        mainAxis?: {
          stemCurve: Array<{ nodeIdx: number; position: { x: number; y: number; z: number } }>;
          trusses?: Array<{
            nodeIdx: number;
            worldOrigin: { x: number; y: number; z: number };
            visibility: { visible: boolean; reason: string };
            floralSites?: Array<{
              index: number;
              stage: string;
              fruit?: { diameterMm: number };
            }>;
          }>;
        };
        sideShoots?: Array<{
          stemCurve: Array<{ nodeIdx: number; position: { x: number; y: number; z: number } }>;
          trusses?: Array<{
            nodeIdx: number;
            worldOrigin: { x: number; y: number; z: number };
            visibility: { visible: boolean; reason: string };
            floralSites?: Array<{ index: number; stage: string; fruit?: { diameterMm: number } }>;
          }>;
        }>;
      };
    };
    const pb = w.__lastPlantBase;
    if (!pb) return [];
    const axes = [pb.mainAxis, ...(pb.sideShoots ?? [])].filter(Boolean) as Array<NonNullable<typeof pb.mainAxis>>;

    const samples: TrussSample[] = [];
    for (const axis of axes) {
      if (!axis.stemCurve || axis.stemCurve.length === 0) continue;
      const apexPos = axis.stemCurve[axis.stemCurve.length - 1].position;
      const N = axis.stemCurve.length;
      for (const t of axis.trusses ?? []) {
        const dx = t.worldOrigin.x - apexPos.x;
        const dy = t.worldOrigin.y - apexPos.y;
        const dz = t.worldOrigin.z - apexPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        samples.push({
          nodeIdx: t.nodeIdx,
          nodeFromApex: (N - 1) - t.nodeIdx,
          distanceFromApexM: distance,
          visibility: t.visibility,
          floralSites: (t.floralSites ?? []).map(s => ({
            index: s.index,
            stage: s.stage,
            fruit: s.fruit ? { diameterMm: s.fruit.diameterMm } : undefined,
          })),
        });
      }
    }
    return samples;
  });
}

test.describe('S115 — Truss/Fruit Apex-Distance Gate (runtime + source)', () => {

  // ─── Runtime invariants (필수, v3 보정 #2) ──────────────────────────

  test('TRUSS-APEX-GATE-VISIBILITY-01: apex 8cm 이내 truss invisible + reason=apex_proximity', async ({ page }) => {
    test.setTimeout(60_000);
    const trusses = await buildPlantTrussesForTest(page, 80);
    expect(trusses.length, 'trusses 존재').toBeGreaterThan(0);

    for (const t of trusses) {
      const inApexZone = t.distanceFromApexM < 0.08 || t.nodeFromApex < 3;
      if (inApexZone) {
        expect(t.visibility.visible,
          `truss n${t.nodeIdx} @ apex ${(t.distanceFromApexM * 100).toFixed(1)}cm (nodeFromApex=${t.nodeFromApex})`,
        ).toBe(false);
        expect(t.visibility.reason).toBe('apex_proximity');
      }
    }
  });

  test('TRUSS-APEX-GATE-FRUIT-HIDDEN-01: apex 26cm 이내 모든 fruit undefined', async ({ page }) => {
    test.setTimeout(60_000);
    const trusses = await buildPlantTrussesForTest(page, 80);
    for (const t of trusses) {
      if (!t.visibility.visible) continue;  // truss 자체 hidden은 별 invariant
      const noFruitZone = t.distanceFromApexM < 0.26 || t.nodeFromApex < 5;
      if (noFruitZone) {
        for (const site of t.floralSites) {
          expect(site.fruit,
            `truss n${t.nodeIdx} @ apex ${(t.distanceFromApexM * 100).toFixed(1)}cm, site ${site.index} fruit hidden`,
          ).toBeUndefined();
        }
      }
    }
  });

  test('TRUSS-APEX-GATE-DIAMETER-CAP-01: fruit diameter ≤ smoothstep cap', async ({ page }) => {
    test.setTimeout(60_000);
    const trusses = await buildPlantTrussesForTest(page, 80);
    // 26cm → 4mm, 55cm → 60mm full smoothstep cap.
    for (const t of trusses) {
      if (!t.visibility.visible) continue;
      if (t.distanceFromApexM < 0.26) continue;  // fruit-hidden zone (다른 spec)
      const tt = Math.max(0, Math.min(1, (t.distanceFromApexM - 0.26) / (0.55 - 0.26)));
      const factor = tt * tt * (3 - 2 * tt);
      const expectedCapMm = 4 + (60 - 4) * factor;
      for (const site of t.floralSites) {
        if (!site.fruit) continue;
        expect(site.fruit.diameterMm,
          `truss n${t.nodeIdx} @ apex ${(t.distanceFromApexM * 100).toFixed(1)}cm, expected cap ${expectedCapMm.toFixed(1)}mm, got ${site.fruit.diameterMm.toFixed(1)}mm`,
        ).toBeLessThanOrEqual(expectedCapMm + 0.5);
      }
    }
  });

  // ─── Source-grep invariants (보조, v3 보정 #1, #4) ──────────────────

  test('REPRODUCTIVE-APEX-GATE-CONSTANTS-01: REPRODUCTIVE_APEX_GATE 상수 정의 (v3 #1)', async () => {
    const src = await readFile(PLANTBASE);
    expect(src, 'REPRODUCTIVE_APEX_GATE 상수 객체 + trussStartM 0.08').toMatch(
      /const\s+REPRODUCTIVE_APEX_GATE\s*=\s*\{[\s\S]*?trussStartM:\s*0\.08/,
    );
    expect(src, 'flowerStartM 0.16, fruitStartM 0.26').toMatch(
      /flowerStartM:\s*0\.16[\s\S]*?fruitStartM:\s*0\.26/,
    );
  });

  test('REPRODUCTIVE-APEX-VISIBILITY-REASON-01: apex_proximity reason 추가', async () => {
    const src = await readFile(PLANTBASE);
    expect(src, "VisibilityReason에 'apex_proximity' 추가").toMatch(
      /'apex_proximity'/,
    );
  });

  test('REPRODUCTIVE-APEX-MAX-VISUAL-STAGE-01: maxVisualStage decision-first (v3 #4)', async () => {
    const src = await readFile(PLANTBASE);
    expect(src, 'maxVisualStage type 정의 + decision').toMatch(
      /type MaxVisualStage[\s\S]{0,200}'bud'\s*\|\s*'flowering'\s*\|\s*'fruit'/,
    );
    expect(src, 'maxVisualStage 분기 — apexGate.flowerAllowed/fruitAllowed 결정').toMatch(
      /!apexGate\.flowerAllowed\s*\?\s*'bud'[\s\S]{0,200}!apexGate\.fruitAllowed\s*\?\s*'flowering'/,
    );
  });
});
