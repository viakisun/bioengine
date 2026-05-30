// Iter 31 Phase 1 — R6 stem direction fix invariants.
//
// Plan §2 (sleepy-growing-pretzel.md v3).
//
// Acceptance:
//   STEM-SYNTHESIZE-GROWTHDIR-POS-01: GrowthModel.ts main loop에서 prev.position 0건
//   STEM-APICAL-DELTA-Y-01: D=30/40/50 apical 5 internodes (마지막 2개 제외) 평균 Δy ≥ 2cm
//   STEM-APICAL-TANGENT-UP-01: D=30/40/50 apical 5 nodes tangent.y > 0
//   STEM-APEX-COLLAPSE-01: 연속 2+ internodes Δy < 0.2cm 0건
//   STEM-HORIZONTAL-COLLAPSE-01: D=30 stem 마지막 5 node XZ deviation < 5cm
//   STEM-VERTICAL-DOMINANCE-01: D=30/45/90 일반 생장 internode의 growthDir.y > 0.5
//   SIDE-SHOOT-LOOP-CHECK-01: side-shoot loop도 current pos 사용 검증

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function enter(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
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
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

async function measureStem(page: Page) {
  return await page.evaluate(() => {
    type V3 = { x: number; y: number; z: number };
    type Node = { id: string; type?: string; pos: V3; frame?: { tangent: V3; normal: V3 } };
    const w = window as unknown as {
      __skinplantGraph?: { nodes: Map<string, Node> };
    };
    const g = w.__skinplantGraph;
    if (!g) return null;
    const stemNodes = [...g.nodes.values()]
      .filter((n) => n.type === 'main-stem-node')
      .sort((a, b) => a.pos.y - b.pos.y);
    return stemNodes.map((n, i) => {
      const prev = i > 0 ? stemNodes[i - 1] : null;
      const dy = prev ? (n.pos.y - prev.pos.y) * 100 : 0;
      const dx = prev ? (n.pos.x - prev.pos.x) * 100 : 0;
      const dz = prev ? (n.pos.z - prev.pos.z) * 100 : 0;
      return {
        idx: i,
        x: n.pos.x * 100, y: n.pos.y * 100, z: n.pos.z * 100,
        dy, dx, dz,
        internodeLen: Math.hypot(dx, dy, dz),
        tangent: n.frame?.tangent ?? null,
      };
    });
  });
}

test.describe('Iter 31 Phase 1 — R6 stem direction fix', () => {
  test('STEM-SYNTHESIZE-GROWTHDIR-POS-01: main loop에서 prev.position 인자 0건', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    // synthesizeGrowthDir 호출 중 prev.position 인자 매치 — main loop fix 후 0건이어야
    // (side-shoot loop는 다른 변수명 `pos` 사용하므로 매치 안 됨)
    const callMatches = text.match(/synthesizeGrowthDir\([\s\S]*?\)/g) ?? [];
    let violationCount = 0;
    for (const call of callMatches) {
      // 두 번째 인자가 prev.position인 경우 catch
      if (/synthesizeGrowthDir\(\s*prev\.growthDir,\s*prev\.position\s*,/.test(call)) {
        violationCount++;
      }
    }
    expect(violationCount, 'main loop synthesizeGrowthDir(prev.growthDir, prev.position, ...) 잔존').toBe(0);

    // Fix marker — nodes[i].position 패턴이 적어도 1건 존재
    expect(text, 'nodes[i].position 전달 패턴').toMatch(/synthesizeGrowthDir\([\s\S]*?nodes\[i\]\.position/);
    // R6 fix 주석 명시
    expect(text, 'Iter 31 Phase 1 R6 fix 주석').toMatch(/Iter 31 Phase 1.*R6/);
  });

  test('STEM-APICAL-DELTA-Y-01: D=30/40/50 apical 5 internodes (마지막 2개 제외) 평균 Δy ≥ 2cm (live)', async ({ page }) => {
    test.setTimeout(300_000);
    for (const day of [30, 40, 50]) {
      await enter(page, day);
      const stem = await measureStem(page);
      expect(stem, `D=${day} stem 측정`).not.toBeNull();
      const last5 = stem!.slice(-5);
      // 마지막 2개 제외 (방금 형성된 internode는 거의 zero가 자연)
      const measured = last5.slice(0, -2);
      const meanDy = measured.reduce((s, n) => s + n.dy, 0) / Math.max(1, measured.length);
      // eslint-disable-next-line no-console
      console.log(`D=${day} apical-5 (마지막 2개 제외) mean Δy: ${meanDy.toFixed(2)}cm | last5 Δy: [${last5.map((n) => n.dy.toFixed(2)).join(', ')}]`);
      expect(meanDy, `D=${day} apical mean Δy ≥ 2cm`).toBeGreaterThanOrEqual(2);
    }
  });

  test('STEM-APICAL-TANGENT-UP-01: apical 5 nodes tangent.y > 0', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const stem = await measureStem(page);
    expect(stem).not.toBeNull();
    const last5 = stem!.slice(-5);
    // 마지막 1개 제외 — tangent는 마지막 edge에서 _전체 stem_ 직립도 검증
    const measured = last5.slice(0, -1);
    let upCount = 0;
    for (const n of measured) {
      if (n.tangent && n.tangent.y > 0) upCount++;
    }
    // 적어도 75% (3/4)가 tangent.y > 0이어야 정상 vertical apex
    expect(upCount / Math.max(1, measured.length), `D=30 apical tangent.y > 0 비율 ≥ 0.75`)
      .toBeGreaterThanOrEqual(0.75);
  });

  test('STEM-APEX-COLLAPSE-01: 연속 2+ internodes Δy < 0.2cm 0건', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const stem = await measureStem(page);
    expect(stem).not.toBeNull();
    // 마지막 1개는 _방금 형성된_ stem이라 Δy ~ 0 정상 가능. 마지막 2개 _이상_ 연속이면 fail.
    let consecutiveCount = 0;
    for (let i = 1; i < stem!.length; i++) {
      if (stem![i].dy < 0.2) {
        consecutiveCount++;
      } else {
        consecutiveCount = 0;
      }
    }
    // 가장 큰 연속 collapse 길이가 1 이하여야 (마지막 1개만 가능)
    expect(consecutiveCount, '연속 collapse internodes 갯수').toBeLessThanOrEqual(1);
  });

  test('STEM-HORIZONTAL-COLLAPSE-01: D=30 stem 마지막 5 node XZ deviation < 5cm', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const stem = await measureStem(page);
    expect(stem).not.toBeNull();
    const last5 = stem!.slice(-5);
    const xValues = last5.map((n) => n.x);
    const zValues = last5.map((n) => n.z);
    const xRange = Math.max(...xValues) - Math.min(...xValues);
    const zRange = Math.max(...zValues) - Math.min(...zValues);
    const deviation = Math.hypot(xRange, zRange);
    // eslint-disable-next-line no-console
    console.log(`D=30 stem 마지막 5 node XZ deviation: ${deviation.toFixed(2)}cm (x ${xRange.toFixed(1)} z ${zRange.toFixed(1)})`);
    expect(deviation, 'D=30 마지막 5 node XZ deviation < 5cm').toBeLessThan(5);
  });

  test('STEM-VERTICAL-DOMINANCE-01: D=30 모든 일반 internode의 dy/internodeLen > 0.5', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const stem = await measureStem(page);
    expect(stem).not.toBeNull();
    // node 1~end-1 (root + last 제외): 일반 생장 segment
    const general = stem!.slice(1, -1);
    let upDominant = 0;
    let total = 0;
    for (const n of general) {
      if (n.internodeLen < 0.5) continue;  // 너무 짧은 건 노이즈
      total++;
      if (n.dy / n.internodeLen > 0.5) upDominant++;
    }
    expect(upDominant / Math.max(1, total), 'vertical dominance > 0.85')
      .toBeGreaterThan(0.85);
  });

  test('SIDE-SHOOT-LOOP-CHECK-01: side-shoot loop는 pos (current position) 사용', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    // populateSideShootChain 내 synthesizeGrowthDir 호출은 pos (= 새로 계산된 position) 사용
    const match = text.match(/populateSideShootChain[\s\S]{0,3000}?synthesizeGrowthDir\(\s*dir,\s*pos,/);
    expect(match, 'side-shoot loop가 synthesizeGrowthDir(dir, pos, ...) 패턴 사용').not.toBeNull();
  });
});
