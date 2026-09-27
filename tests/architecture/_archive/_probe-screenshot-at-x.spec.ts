// Probe — drive rail to a known X, take a Playwright screenshot of the PiP
// element.  Goal: confirm we can reproduce the user's reference framing
// (tomatoes-filling-view) via headless capture before tuning the detector.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = 'test-results/scenarios';
const TARGET_RAIL_X = -0.95;

test.describe('Screenshot at rail-X', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('drive rail + screenshot PiP', async ({ page }) => {
    test.setTimeout(120_000);
    const url =
      'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey' +
      '&bedLayout=2-4-4&activeBedIds=4,5,6,7,8,9' +
      '&robotProfile=phenotyping&robotTraverse=1&gimbalView=1&qualityPreset=1';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return c != null && c.width > 100 && c.height > 100;
    }, { timeout: 60_000 });
    await page.waitForTimeout(10_000);

    fs.mkdirSync(OUT, { recursive: true });

    // Drive rail to target via the slider input in the RobotTransport dock.
    // RAIL X has type=range; set value programmatically + dispatch input event.
    const drove = await page.evaluate((target) => {
      const sliders = Array.from(document.querySelectorAll('input[type=range]'));
      const railSlider = sliders.find((s) => {
        const label = s.parentElement?.previousElementSibling?.textContent?.toLowerCase() ?? '';
        return label.includes('rail');
      }) ?? sliders[0];
      if (!railSlider) return { ok: false, sliderCount: sliders.length };
      const input = railSlider as HTMLInputElement;
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      desc?.set?.call(input, String(target));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, slidersFound: sliders.length, attrs: { min: input.min, max: input.max, value: input.value } };
    }, TARGET_RAIL_X);
    console.log(`[probe] drove rail: ${JSON.stringify(drove)}`);

    // Wait a moment for the scene to redraw at the new rail X.
    await page.waitForTimeout(2_000);

    const railX = await page.evaluate(() => (window as unknown as { __railX?: number }).__railX);
    console.log(`[probe] railX after drive: ${railX}`);

    // Locate the PiP video panel via the existing drag-handler element's parent.
    const pip = page.locator('[aria-label*="Drag to rotate gimbal"]').first().locator('..');
    const box = await pip.boundingBox();
    console.log(`[probe] PiP bbox: ${JSON.stringify(box)}`);

    // Screenshot the PiP region directly.
    const file = path.join(OUT, `pip-at-railX-${TARGET_RAIL_X.toFixed(2)}.png`);
    if (box) {
      await page.screenshot({
        path: file,
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
      console.log(`→ ${file}`);
    } else {
      console.log('[probe] PiP bbox not found — full page screenshot fallback');
      await page.screenshot({ path: file });
    }

    // Also dump the MAIN canvas via DOM toDataURL — captures the rendered
    // scene reliably even in headless (where PiP region readback can be blank
    // due to WebGL drawing-buffer swap timing).
    const canvasDataUrl = await page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement;
      return c.toDataURL('image/png').split(',')[1];
    });
    const canvasFile = path.join(OUT, `canvas-at-railX-${TARGET_RAIL_X.toFixed(2)}.png`);
    fs.writeFileSync(canvasFile, Buffer.from(canvasDataUrl, 'base64'));
    console.log(`→ ${canvasFile} (main canvas)`);

    // Also save the outer PiP chrome (with REC label etc) — same area but include some margin.
    const outer = page.locator('[aria-label*="Drag to rotate gimbal"]').first().locator('xpath=ancestor::div[2]');
    const outerBox = await outer.boundingBox();
    if (outerBox) {
      const outerFile = path.join(OUT, `pip-frame-at-railX-${TARGET_RAIL_X.toFixed(2)}.png`);
      await page.screenshot({ path: outerFile, clip: { x: outerBox.x, y: outerBox.y, width: outerBox.width, height: outerBox.height } });
      console.log(`→ ${outerFile}`);
    }

    expect(true).toBe(true);
  });
});
