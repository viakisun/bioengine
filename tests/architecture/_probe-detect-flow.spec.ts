// Probe — detection flow trace. See whether detector init blocks frames, see
// per-frame detection counts with filter rejection details.

import { test, expect } from '@playwright/test';

test.describe('Detect-flow probe', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('trace from START to first detection', async ({ page }) => {
    test.setTimeout(180_000);
    const logs: string[] = [];
    page.on('console', (m) => {
      const t = m.text();
      if (t.includes('[surveyRunner]') || t.includes('[runPerFrameDetect]')
        || t.includes('[frameCapture]') || t.includes('ONNX') || t.includes('detector')
        || t.includes('Failed to load') || t.includes('survey')) {
        logs.push(`[${m.type()}] ${t.slice(0, 220)}`);
      }
    });
    page.on('pageerror', (e) => logs.push(`[ERR] ${e.message}`));

    const url =
      'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey' +
      '&bedLayout=2-4-4&activeBedIds=4,5,6,7,8,9' +
      '&robotProfile=phenotyping&robotTraverse=1&gimbalView=1&qualityPreset=1';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return c != null && c.width > 100 && c.height > 100;
    }, { timeout: 60_000 });
    await page.waitForTimeout(8_000);

    const startBtn = page.locator('button', { hasText: 'START SURVEY' }).first();
    await expect(startBtn).toBeVisible({ timeout: 30_000 });
    await startBtn.click({ force: true, timeout: 30_000 });
    console.log('[probe] START SURVEY clicked');

    // Wait long enough for ONNX init (~5-15s) AND a few frames of traverse.
    await page.waitForTimeout(50_000);

    const summary = await page.evaluate(() => {
      const w = window as unknown as {
        __twinStore?: { getState?: () => { phenotypingSurvey?: { phase?: string; status?: string; frameCount?: number; liveDetections?: unknown[]; detectorLoadProgress?: number } } };
        __capturedFrames?: string[];
      };
      const st = w.__twinStore?.getState?.()?.phenotypingSurvey ?? {};
      return {
        phase: st.phase,
        status: st.status,
        frameCount: st.frameCount,
        detectorLoadProgress: st.detectorLoadProgress,
        liveDetectionCount: st.liveDetections?.length ?? 0,
        capturedFrames: w.__capturedFrames?.length ?? 0,
      };
    });
    console.log(`\n=== State after 50s ===\n${JSON.stringify(summary, null, 2)}`);

    console.log('\n=== Filtered console log (last 80) ===');
    for (const l of logs.slice(-80)) console.log(l);

    expect(true).toBe(true);
  });
});
