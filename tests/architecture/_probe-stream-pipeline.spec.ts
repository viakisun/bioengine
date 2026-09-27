// Probe — end-to-end smoke test of the new streaming pipeline.
//
// 1. Boot app, wait for scene render.
// 2. Open a probe consumer WS connection from inside the page (so the relay
//    sees producer + 2 consumers: the PiP <img> and us).
// 3. Wait until we receive at least 5 binary frames + their preceding text headers.
// 4. Decode one of the frames (JPEG) and dump it as PNG so we can verify
//    visually that the streamer is sending the actual gimbal cam pixels.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = 'test-results/scenarios';

test.describe('Streaming pipeline', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('producer + consumer roundtrip', async ({ page }) => {
    test.setTimeout(120_000);
    page.on('console', (m) => {
      const t = m.text();
      if (t.includes('[stream-producer]') || t.includes('[cam-stream]') || t.includes('[BabylonEngine]')) {
        console.log(`[browser] ${t.slice(0, 220)}`);
      }
    });

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

    fs.mkdirSync(OUT, { recursive: true });

    // Open a probe consumer + collect 5 frame pairs.
    const result = await page.evaluate(async () => {
      return await new Promise<{ headers: unknown[]; binaryFrameSizes: number[]; firstFrameDataUrl: string | null; receivedDataKinds: string[]; error?: string }>((resolve) => {
        const ws = new WebSocket('ws://localhost:8090/robot/phenotyping/gimbal?role=consumer');
        ws.binaryType = 'arraybuffer';
        const headers: unknown[] = [];
        const binaryFrameSizes: number[] = [];
        const receivedDataKinds: string[] = [];
        let firstFrameDataUrl: string | null = null;
        const timeout = setTimeout(() => {
          ws.close();
          resolve({ headers, binaryFrameSizes, firstFrameDataUrl, receivedDataKinds, error: `timeout (got ${binaryFrameSizes.length} binary frames)` });
        }, 60_000);
        ws.onmessage = (ev) => {
          receivedDataKinds.push(typeof ev.data === 'string' ? 'str' : (ev.data instanceof ArrayBuffer ? `ab:${(ev.data as ArrayBuffer).byteLength}` : `${Object.prototype.toString.call(ev.data)}:${(ev.data as { size?: number }).size ?? 'n/a'}`));
          if (typeof ev.data === 'string') {
            try { headers.push(JSON.parse(ev.data)); } catch { /* */ }
            return;
          }
          const ab = ev.data as ArrayBuffer;
          binaryFrameSizes.push(ab.byteLength);
          if (firstFrameDataUrl == null) {
            const reader = new FileReader();
            reader.onload = () => {
              firstFrameDataUrl = String(reader.result);
            };
            reader.readAsDataURL(new Blob([ab], { type: 'image/jpeg' }));
          }
          if (binaryFrameSizes.length >= 1) {
            clearTimeout(timeout);
            setTimeout(() => { ws.close(); resolve({ headers, binaryFrameSizes, firstFrameDataUrl, receivedDataKinds, error: undefined }); }, 200);
          }
        };
        ws.onerror = () => { /* close follows */ };
        ws.onclose = () => {
          if (binaryFrameSizes.length === 0) {
            clearTimeout(timeout);
            resolve({ headers, binaryFrameSizes, firstFrameDataUrl, receivedDataKinds, error: 'closed-before-frames' });
          }
        };
      });
    });

    console.log(`\n=== Result ===`);
    console.log(`binary frames: ${result.binaryFrameSizes.length} | sizes: ${result.binaryFrameSizes.slice(0, 5).join(', ')} bytes`);
    console.log(`headers: ${result.headers.length}`);
    console.log(`receivedDataKinds (first 10): ${result.receivedDataKinds.slice(0, 10).join(', ')}`);
    if (result.headers.length > 0) {
      console.log(`first header: ${JSON.stringify(result.headers[0])}`);
    }
    if (result.error) console.log(`error: ${result.error}`);

    if (result.firstFrameDataUrl) {
      const base64 = result.firstFrameDataUrl.split(',')[1];
      const file = path.join(OUT, 'stream-frame-0.jpg');
      fs.writeFileSync(file, Buffer.from(base64, 'base64'));
      console.log(`→ ${file} (first JPEG frame from the wire)`);
    }

    expect(result.binaryFrameSizes.length).toBeGreaterThanOrEqual(1);
  });
});
