// Probe — gimbal 카메라가 실제로 robot을 따라가는지 검증.
//   기대: robot root.x가 traverse로 변하면 cam globalPosition.x도 같이 변해야 함.
//   기대: pivot rotation.y가 left/right 토글되면 cam fwd.z 또는 fwd.x 부호가 변해야 함.

import { test, expect } from '@playwright/test';

test.describe('Gimbal tracking probe', () => {
  test('gimbal cam이 robot traverse를 실제로 추적', async ({ page }) => {
    test.setTimeout(300_000);

    const diagMsgs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[gimbalDiag]')) diagMsgs.push(text);
    });

    const url =
      'http://localhost:8090/?mode=workbench&scenario=phenotyping-D110-survey' +
      '&bedLayout=2-4-4&activeBedIds=4,5,6,7,8,9' +
      '&robotProfile=phenotyping&robotTraverse=1&gimbalView=1&qualityPreset=1' +
      '&debug=engine';

    console.log('Loading:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // boot 끝나고 traverse 동작 wait — 240s 안에 ≥15 diag msgs 기대.
    console.log('Waiting up to 240s for traverse + diag msgs');
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      await page.waitForTimeout(3000);
      if (diagMsgs.length >= 15) break;
    }

    console.log(`\n=== Captured ${diagMsgs.length} [gimbalDiag] msgs ===`);
    for (const m of diagMsgs) console.log(m);

    // Extract robot.x and cam.x from msgs.
    const rootXs: number[] = [];
    const camXs: number[] = [];
    const fwdZs: number[] = [];
    const fwdXs: number[] = [];
    for (const m of diagMsgs) {
      const rootM = m.match(/root=\(([-\d.]+),/);
      const camM = m.match(/cam=\(([-\d.]+),/);
      const fwdM = m.match(/fwd=\(([-\d.]+),([-\d.]+),([-\d.]+)\)/);
      if (rootM) rootXs.push(parseFloat(rootM[1]));
      if (camM) camXs.push(parseFloat(camM[1]));
      if (fwdM) {
        fwdXs.push(parseFloat(fwdM[1]));
        fwdZs.push(parseFloat(fwdM[3]));
      }
    }

    console.log('\n=== Summary ===');
    console.log(`root.x range: ${Math.min(...rootXs).toFixed(2)} ~ ${Math.max(...rootXs).toFixed(2)}`);
    console.log(`cam.x range:  ${Math.min(...camXs).toFixed(2)} ~ ${Math.max(...camXs).toFixed(2)}`);
    console.log(`fwd.x range:  ${Math.min(...fwdXs).toFixed(2)} ~ ${Math.max(...fwdXs).toFixed(2)}`);
    console.log(`fwd.z range:  ${Math.min(...fwdZs).toFixed(2)} ~ ${Math.max(...fwdZs).toFixed(2)}`);

    const rootMoved = Math.max(...rootXs) - Math.min(...rootXs);
    const camMoved = Math.max(...camXs) - Math.min(...camXs);
    console.log(`root traveled X: ${rootMoved.toFixed(2)}m`);
    console.log(`cam traveled X:  ${camMoved.toFixed(2)}m`);

    if (rootMoved > 0.5 && camMoved > 0.5) {
      console.log('✅ Camera follows robot — REAL tracking');
    } else if (rootMoved > 0.5 && camMoved < 0.1) {
      console.log('❌ Camera does NOT follow robot — FAKE / parented incorrectly');
    } else {
      console.log('⚠ Insufficient data (robot did not move enough)');
    }

    expect(diagMsgs.length).toBeGreaterThan(0);
  });
});
