// Probe — check whether gimbalCam.viewport actually matches the GimbalView
// PiP DOM panel rect. The PiP visual bug suggests the viewport stayed at its
// initial small value while the DOM panel grew larger.

import { test, expect } from '@playwright/test';

test.describe('Gimbal viewport sync probe', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('compare gimbal cam viewport vs DOM panel rect', async ({ page }) => {
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

    const info = await page.evaluate(() => {
      const w = window as unknown as {
        __gimbalCam?: { viewport?: { x: number; y: number; width: number; height: number } };
      };
      const drag = document.querySelector('[aria-label*="Drag to rotate gimbal"]') as HTMLElement | null;
      const panel = drag?.parentElement as HTMLElement | null;
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      const panelRect = panel?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      return {
        innerW: window.innerWidth,
        innerH: window.innerHeight,
        canvasPx: canvas ? { w: canvas.width, h: canvas.height } : null,
        canvasRect: canvasRect ? { left: canvasRect.left, top: canvasRect.top, w: canvasRect.width, h: canvasRect.height } : null,
        panelRect: panelRect ? { left: panelRect.left, top: panelRect.top, w: panelRect.width, h: panelRect.height } : null,
        camViewport: w.__gimbalCam?.viewport
          ? { x: w.__gimbalCam.viewport.x, y: w.__gimbalCam.viewport.y, width: w.__gimbalCam.viewport.width, height: w.__gimbalCam.viewport.height }
          : null,
        expectedFromPanel: panelRect && canvasRect ? {
          x: (panelRect.left - canvasRect.left) / canvasRect.width,
          y: (canvasRect.height - (panelRect.top - canvasRect.top) - panelRect.height) / canvasRect.height,
          width: panelRect.width / canvasRect.width,
          height: panelRect.height / canvasRect.height,
        } : null,
        expectedFromInnerSize: panelRect ? {
          x: panelRect.left / window.innerWidth,
          y: (window.innerHeight - panelRect.top - panelRect.height) / window.innerHeight,
          width: panelRect.width / window.innerWidth,
          height: panelRect.height / window.innerHeight,
        } : null,
      };
    });
    console.log(JSON.stringify(info, null, 2));
    expect(true).toBe(true);
  });
});
