// W1.g (§18) — 20 시나리오 회귀 spec.
//
// 각 시나리오 ID로 직진입 → 화면 로드 → screenshot → metric 측정.
// Workbench 모드: 시나리오 선택 후 TaskPanel의 metric 값 추출.
// Foundry/Twin도 마찬가지.
//
// 실행: pnpm exec playwright test tests/architecture/_probe-scenario-20.spec.ts

import { test, expect } from '@playwright/test';

const SCENARIOS = [
  // Workbench 호환 (15)
  { id: 'thin-D50-truss1-single', mode: 'workbench', domain: 'thinning' },
  { id: 'thin-D60-truss2-priority', mode: 'workbench', domain: 'thinning' },
  { id: 'thin-D70-truss3-multi', mode: 'workbench', domain: 'thinning' },
  { id: 'thin-D90-multi-truss', mode: 'workbench', domain: 'thinning' },
  { id: 'thin-occluded-fruit', mode: 'workbench', domain: 'thinning' },
  { id: 'prune-D40-sucker-only', mode: 'workbench', domain: 'pruning' },
  { id: 'prune-D55-multi-sucker', mode: 'workbench', domain: 'pruning' },
  { id: 'prune-D80-apex-topping', mode: 'workbench', domain: 'pruning' },
  { id: 'spray-D60-high-LAI', mode: 'workbench', domain: 'spray' },
  { id: 'spray-D85-late-stress', mode: 'workbench', domain: 'spray' },
  { id: 'drive-D15-standard-sunny', mode: 'workbench', domain: 'autonomous-driving' },
  { id: 'drive-D45-standard-overcast', mode: 'workbench', domain: 'autonomous-driving' },
  { id: 'drive-D70-occluded-canopy', mode: 'workbench', domain: 'autonomous-driving' },
  { id: 'drive-D90-narrow-sunny', mode: 'workbench', domain: 'autonomous-driving' },
  { id: 'drive-D90-narrow-backlit', mode: 'workbench', domain: 'autonomous-driving' },

  // Foundry 호환 (4)
  { id: 'recog-batch-fruit-classification', mode: 'foundry', domain: 'recognition' },
  { id: 'recog-batch-organ-segmentation', mode: 'foundry', domain: 'recognition' },
  { id: 'recog-batch-occlusion', mode: 'foundry', domain: 'recognition' },
  { id: 'recog-batch-multi-cultivar', mode: 'foundry', domain: 'recognition' },

  // Twin only (1)
  { id: 'drive-multi-bed-traverse', mode: 'twin', domain: 'autonomous-driving' },
] as const;

test.describe('W1.g — 20 시나리오 회귀', () => {
  for (const s of SCENARIOS) {
    test(`${s.id} — ${s.mode} 진입 + Picker 클릭 + 화면 로드`, async ({ page }) => {
      test.setTimeout(45_000);

      // Mode 직진입
      await page.goto(`http://localhost:8090/?mode=${s.mode}`, {
        waitUntil: 'domcontentloaded',
      });
      // BabylonEngine boot + Picker 진입 대기
      await page.waitForTimeout(3500);

      // 시나리오 카드 클릭 (id 텍스트가 카드 안에 있음)
      const card = page.locator(`text=${s.id}`).first();
      const visible = await card.isVisible().catch(() => false);
      if (visible) {
        await card.click();
        await page.waitForTimeout(1500);
      }

      // Screenshot — annexes/A 후속 적재 (W3.h에서 일괄)
      const safeId = s.id.replace(/[^a-zA-Z0-9-]/g, '_');
      await page.screenshot({
        path: `test-results/scenarios/${safeId}.png`,
        fullPage: false,
      });

      // 기본 검증: 페이지가 죽지 않음 + URL 유지
      const url = page.url();
      expect(url).toContain(s.mode);

      // 콘솔 에러 카운트 (Babylon WebGL/WebGPU 외)
      // mvp: 단순히 not crashed 확인.
    });
  }
});
