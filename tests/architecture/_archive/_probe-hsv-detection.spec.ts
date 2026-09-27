// Probe — capture gimbal cam PiP at multiple time points during a phenotyping
// survey, run HSV inline against the pixels, dump gimbal cam world pose so we
// can tell whether the camera is even pointing at tomatoes.
//
// Output: test-results/scenarios/hsv-probe-frame-{i}.png + JSON report per
// sample (band counts, hue/sat/val histograms, cam pose, top-saturated pixels).

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT_DIR = 'test-results/scenarios';

test.describe('HSV detection probe', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('multi-sample gimbal PiP during scan', async ({ page }) => {
    test.setTimeout(300_000);

    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      consoleMessages.push(`[ERR] ${err.message}`);
    });

    const url =
      'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey' +
      '&bedLayout=2-4-4&activeBedIds=4,5,6,7,8,9' +
      '&robotProfile=phenotyping&robotTraverse=1&gimbalView=1&qualityPreset=1';

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(
      () => {
        const c = document.querySelector('canvas');
        return c != null && c.width > 100 && c.height > 100;
      },
      { timeout: 60_000 },
    );
    await page.waitForTimeout(15_000);

    // Click START SURVEY
    const startBtn = page.locator('button', { hasText: 'START SURVEY' }).first();
    await expect(startBtn).toBeVisible({ timeout: 30_000 });
    await startBtn.click({ timeout: 10_000, force: true });
    console.log('[probe] clicked START SURVEY');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Sample at: 5s, 15s, 30s, 50s, 70s after start (covers left scan ~50s)
    const sampleTimings = [5_000, 15_000, 30_000, 50_000, 70_000];

    // ── Diagnostic: check scene.activeCameras + try expand gimbal viewport fullscreen
    const sceneInfo = await page.evaluate(() => {
      const win = window as unknown as { __gimbalCam?: { getScene?: () => { activeCameras?: Array<{ name: string }> | null; activeCamera?: { name: string } | null; cameras?: Array<{ name: string }> } } };
      const scene = win.__gimbalCam?.getScene?.();
      if (!scene) return { error: 'no scene' };
      return {
        activeCameras: scene.activeCameras?.map((c) => c.name) ?? null,
        activeCamera: scene.activeCamera?.name ?? null,
        allCameras: scene.cameras?.map((c) => c.name) ?? null,
      };
    });
    console.log(`[probe] scene cameras: ${JSON.stringify(sceneInfo)}`);

    // (probe is observer-only — see _probe-phenotyping.spec.ts for additional diagnostics)
    let elapsed = 0;
    for (let i = 0; i < sampleTimings.length; i++) {
      const wait = sampleTimings[i] - elapsed;
      await page.waitForTimeout(wait);
      elapsed = sampleTimings[i];

      const sample = await page.evaluate((idx) => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
        if (!canvas) return { error: 'no canvas' };

        const dragDiv = document.querySelector('[aria-label*="Drag to rotate gimbal"]') as HTMLElement | null;
        const videoPanel = dragDiv?.parentElement as HTMLElement | null;
        if (!videoPanel) return { error: 'no video panel' };

        const panelRect = videoPanel.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        // Map DOM panel rect → canvas pixel coords
        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;
        const srcX = Math.max(0, Math.round((panelRect.left - canvasRect.left) * scaleX));
        const srcY = Math.max(0, Math.round((panelRect.top - canvasRect.top) * scaleY));
        const srcW = Math.max(1, Math.round(panelRect.width * scaleX));
        const srcH = Math.max(1, Math.round(panelRect.height * scaleY));

        const off = document.createElement('canvas');
        off.width = srcW;
        off.height = srcH;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { error: 'no 2d ctx' };
        ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        const img = ctx.getImageData(0, 0, srcW, srcH);
        const pixels = img.data;

        // Inline HSV
        type Bin = 'red' | 'pink' | 'turning' | 'breaker' | 'green';
        interface Band { bin: Bin; hueRanges: Array<[number, number]>; satMin: number; valMin: number }
        const BANDS: Band[] = [
          { bin: 'red',     hueRanges: [[0, 18], [340, 360]], satMin: 0.30, valMin: 0.25 },
          { bin: 'pink',    hueRanges: [[325, 340]],          satMin: 0.20, valMin: 0.30 },
          { bin: 'turning', hueRanges: [[18, 30]],            satMin: 0.30, valMin: 0.30 },
          { bin: 'breaker', hueRanges: [[30, 55]],            satMin: 0.25, valMin: 0.30 },
          { bin: 'green',   hueRanges: [[70, 150]],           satMin: 0.30, valMin: 0.20 },
        ];
        const rgb2hsv = (r: number, g: number, b: number) => {
          const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
          let h = 0;
          if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60; if (h < 0) h += 360;
          }
          return { h, s: max === 0 ? 0 : d / max, v: max };
        };
        const W = srcW, H = srcH;
        const bands: Record<Bin, number> = { red: 0, pink: 0, turning: 0, breaker: 0, green: 0 };
        let sat30 = 0;
        const topSat: Array<{ x: number; y: number; r: number; g: number; b: number; h: number; s: number; v: number }> = [];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const o = (y * W + x) * 4;
            const r = pixels[o] / 255, g = pixels[o + 1] / 255, b = pixels[o + 2] / 255;
            const { h, s, v } = rgb2hsv(r, g, b);
            if (s >= 0.3) sat30++;
            for (const band of BANDS) {
              if (s < band.satMin || v < band.valMin) continue;
              let inHue = false;
              for (const [mn, mx] of band.hueRanges) {
                if (h >= mn && h <= mx) { inHue = true; break; }
              }
              if (inHue) { bands[band.bin]++; break; }
            }
            if (s > 0.45 && v > 0.4 && topSat.length < 8) {
              topSat.push({ x, y, r: pixels[o], g: pixels[o + 1], b: pixels[o + 2], h, s, v });
            }
          }
        }

        // Try to grab gimbal cam pose from a debug global if exposed,
        // else from twinStore / scene. Defensive across schema changes.
        const win = window as unknown as {
          __gimbalCam?: {
            globalPosition?: { x: number; y: number; z: number };
            getForwardRay?: (l?: number) => { direction: { x: number; y: number; z: number } };
            viewport?: { x: number; y: number; width: number; height: number };
            fov?: number;
            layerMask?: number;
            getScene?: () => {
              meshes: Array<{
                name: string;
                isVisible: boolean;
                isPickable: boolean;
                layerMask: number;
                getAbsolutePosition?: () => { x: number; y: number; z: number };
                getBoundingInfo?: () => { boundingSphere: { centerWorld: { x: number; y: number; z: number }; radiusWorld: number } };
              }>;
            };
          };
          gimbalCamRef?: { current: { globalPosition?: { x: number; y: number; z: number }; getForwardRay?: () => { direction: { x: number; y: number; z: number } } } | null };
          __twinStore?: { getState?: () => unknown };
        };
        // try Babylon scene globals
        let camPose: unknown = null;
        let nearestMeshes: unknown[] = [];
        try {
          const cam = win.__gimbalCam ?? win.gimbalCamRef?.current;
          if (cam) {
            const p = cam.globalPosition;
            const fwd = (cam as { getForwardRay?: (l?: number) => { direction: { x: number; y: number; z: number } } }).getForwardRay?.();
            camPose = {
              pos: p ? { x: p.x, y: p.y, z: p.z } : null,
              fwd: fwd ? { x: fwd.direction.x, y: fwd.direction.y, z: fwd.direction.z } : null,
              viewport: win.__gimbalCam?.viewport,
              fov: win.__gimbalCam?.fov,
              layerMask: win.__gimbalCam?.layerMask,
            };
            // Enumerate plant-related meshes regardless of distance
            const scene = win.__gimbalCam?.getScene?.();
            if (scene && p) {
              const px = p.x, py = p.y, pz = p.z;
              const plantLike: Array<{ name: string; visible: boolean; layer: number; dist: number; pos: { x: number; y: number; z: number } | null }> = [];
              let totalMeshes = 0;
              let plantNameCount = 0;
              for (const m of scene.meshes) {
                totalMeshes++;
                const isPlant = m.name.includes('plant') || m.name.includes('fruit') || m.name.includes('leaf') || m.name.includes('stem') || m.name.includes('tomato');
                if (!isPlant) continue;
                plantNameCount++;
                if (!m.getAbsolutePosition) continue;
                let mp: { x: number; y: number; z: number } | null = null;
                try { mp = m.getAbsolutePosition(); } catch { continue; }
                if (!mp) continue;
                const dx = mp.x - px, dy = mp.y - py, dz = mp.z - pz;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                plantLike.push({
                  name: m.name,
                  visible: m.isVisible,
                  layer: m.layerMask,
                  dist,
                  pos: { x: mp.x, y: mp.y, z: mp.z },
                });
              }
              plantLike.sort((a, b) => a.dist - b.dist);
              // Group plants by Z (bed position) to see distribution
              const zBuckets: Record<string, number> = {};
              for (const c of plantLike) {
                const zKey = c.pos ? c.pos.z.toFixed(1) : 'na';
                zBuckets[zKey] = (zBuckets[zKey] ?? 0) + 1;
              }
              // Count plants that should be in the gimbal view: z > -0.8 (bed 6+),
              // x within ±1m of camera, y within reasonable height range
              const inViewBed6 = plantLike.filter((c) => c.pos && c.pos.z > -0.4 && Math.abs(c.pos.x - px) < 1.5 && c.pos.y > 0.3 && c.pos.y < 2.5);
              // Compare bed 5 (z near -1.6)
              const inViewBed5 = plantLike.filter((c) => c.pos && c.pos.z < -1.2 && Math.abs(c.pos.x - px) < 1.5 && c.pos.y > 0.3 && c.pos.y < 2.5);
              nearestMeshes = [
                { _summary: `totalMeshes=${totalMeshes} plantNameMatches=${plantNameCount}` },
                { _zBuckets: zBuckets },
                { _inViewBed6: `${inViewBed6.length} plants z>-0.4 within 1.5m X of cam (forward direction)` },
                { _inViewBed5: `${inViewBed5.length} plants z<-1.2 within 1.5m X of cam (backward direction)` },
                ...plantLike.slice(0, 8).map((c) => ({
                  name: c.name.slice(0, 60),
                  vis: c.visible,
                  layer: '0x' + c.layer.toString(16),
                  d: c.dist.toFixed(2),
                  pos: c.pos ? `(${c.pos.x.toFixed(1)},${c.pos.y.toFixed(1)},${c.pos.z.toFixed(1)})` : null,
                })),
              ];
            }
          }
        } catch (e) { (camPose as { error?: string }) = { error: String(e).slice(0, 200) }; }

        // Survey state from twinStore if exposed
        let surveyState: unknown = null;
        try {
          const st = win.__twinStore?.getState?.() as { phenotypingSurvey?: unknown; robot?: unknown } | undefined;
          if (st) {
            surveyState = {
              phenotypingSurvey: st.phenotypingSurvey,
              robotMode: (st.robot as { mode?: string } | undefined)?.mode,
            };
          }
        } catch { /* */ }

        // Frustum check: nearby plant meshes in cam's view direction
        let nearbyPlantsInFrustum: unknown[] = [];
        try {
          const cam2 = win.__gimbalCam;
          const scene2 = cam2?.getScene?.();
          const p2 = cam2?.globalPosition;
          if (cam2 && scene2 && p2) {
            const cIsInFrustum = (cam2 as { isInFrustum?: (m: unknown) => boolean }).isInFrustum?.bind(cam2);
            const collected: Array<{ name: string; pos: { x: number; y: number; z: number }; inFrustum: boolean | null; vis: boolean }> = [];
            for (const m of scene2.meshes) {
              if (!m.name.includes('plant') && !m.name.includes('fruit') && !m.name.includes('leaf')) continue;
              const mAny = m as { getAbsolutePosition?: () => { x: number; y: number; z: number }; isVisible: boolean };
              if (!mAny.getAbsolutePosition) continue;
              let mp: { x: number; y: number; z: number } | null = null;
              try { mp = mAny.getAbsolutePosition(); } catch { continue; }
              if (!mp) continue;
              if (mp.z < p2.z - 0.2 || mp.z > p2.z + 2) continue;
              if (Math.abs(mp.x - p2.x) > 1.5) continue;
              if (mp.y < 0.3 || mp.y > 2.5) continue;
              const inF = cIsInFrustum ? cIsInFrustum(m) : null;
              collected.push({ name: m.name.slice(0, 50), pos: { x: +mp.x.toFixed(2), y: +mp.y.toFixed(2), z: +mp.z.toFixed(2) }, inFrustum: inF, vis: mAny.isVisible });
              if (collected.length >= 6) break;
            }
            nearbyPlantsInFrustum = collected;
          }
        } catch { /* */ }

        return {
          idx,
          canvas: { w: canvas.width, h: canvas.height },
          panel: { left: Math.round(panelRect.left), top: Math.round(panelRect.top), w: Math.round(panelRect.width), h: Math.round(panelRect.height) },
          src: { x: srcX, y: srcY, w: srcW, h: srcH },
          totalPx: W * H,
          sat30Px: sat30,
          bands,
          topSat,
          camPose,
          nearestMeshes,
          nearbyPlantsInFrustum,
          surveyState,
          framePng: off.toDataURL('image/png').split(',')[1],
        };
      }, i);

      console.log(`\n=== Sample ${i} @ ${elapsed / 1000}s ===`);
      const { framePng: _png, ...summary } = sample as { framePng?: string; [k: string]: unknown };
      console.log(JSON.stringify(summary, null, 2));
      if ((sample as { framePng?: string }).framePng) {
        const file = path.join(OUT_DIR, `hsv-probe-frame-${i}-t${elapsed}.png`);
        fs.writeFileSync(file, Buffer.from((sample as { framePng: string }).framePng, 'base64'));
        console.log(`  → ${file}`);
      }

      // Sample 3 is where the camera should see 634 plants — take FULL CANVAS
      // screenshot too so we can verify what the gimbal viewport actually
      // contains (vs. just my drawImage crop).
      if (i === 3) {
        const fullPng = await page.evaluate(() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement;
          return c.toDataURL('image/png').split(',')[1];
        });
        const file = path.join(OUT_DIR, `hsv-probe-full-canvas-t${elapsed}.png`);
        fs.writeFileSync(file, Buffer.from(fullPng, 'base64'));
        console.log(`  → ${file}`);
        // Native Playwright screenshot (uses CDP, bypasses canvas readback)
        const nativePath = path.join(OUT_DIR, `hsv-probe-native-t${elapsed}.png`);
        try {
          await page.screenshot({ path: nativePath, fullPage: false, timeout: 60_000 });
          console.log(`  → ${nativePath} (native)`);
        } catch (e) {
          console.log(`  native screenshot failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    console.log('\n=== runPerFrameHsv / surveyRunner / GimbalDetectionOverlay console ===');
    for (const m of consoleMessages) {
      if (m.includes('runPerFrameHsv') || m.includes('surveyRunner') || m.includes('GimbalDetectionOverlay') || m.includes('[surveyRunner]')) {
        console.log(m.slice(0, 250));
      }
    }

    expect(true).toBe(true);
  });
});
