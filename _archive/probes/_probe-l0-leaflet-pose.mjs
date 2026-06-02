// L0 진단 v2 — per-leaflet rotation 효과 측정.
//
// 가설: foldDroopDeg(30° mature) × opennessFactor(1.0) = pitch 30° around
// mesh-local X (= bladeDir). 좌우 leaflet의 bladeDir이 반대 방향이면 pitch가
// world에서 _마주보는 slant_ → "안쪽 cup" 인상.
//
// 측정:
// - 각 leaflet mesh.rotationQuaternion → world rotation 효과
// - bladeDir (mesh +X) 방향 분포
// - leaf plane normal (mesh +Y after rotation) → world Z component
//   = leaflet plane이 _세로_ 기울기 (cup 정도)
// - 좌/우 leaflet 쌍의 normal Z 부호가 반대인지 (마주보는 slant)

import { chromium } from 'playwright';

const URL = 'http://localhost:8090/';
const DAY = 45;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('page error:', err.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate((d) => {
    const w = window;
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, DAY);
  await page.waitForTimeout(3500);

  const probe = await page.evaluate(() => {
    const w = window;
    const scene = w.__scene || w.__debugScene;
    if (!scene?.meshes) return { error: 'no scene' };

    // Quaternion → unit vector rotation (mesh-local +X, +Y, +Z → world).
    function rotateVec(q, v) {
      const { x: qx, y: qy, z: qz, w: qw } = q;
      const { x, y, z } = v;
      // v' = q × v × q⁻¹
      const ix =  qw * x + qy * z - qz * y;
      const iy =  qw * y + qz * x - qx * z;
      const iz =  qw * z + qx * y - qy * x;
      const iw = -qx * x - qy * y - qz * z;
      return {
        x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
        y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
        z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
      };
    }

    const samples = [];
    for (const m of scene.meshes) {
      if (!m.name || !/skinplant_leaf_.*_l\d+_/.test(m.name)) continue;
      if (!m.rotationQuaternion) continue;
      const q = {
        x: m.rotationQuaternion.x, y: m.rotationQuaternion.y,
        z: m.rotationQuaternion.z, w: m.rotationQuaternion.w,
      };
      const meshXWorld = rotateVec(q, { x: 1, y: 0, z: 0 });  // bladeDir world
      const meshYWorld = rotateVec(q, { x: 0, y: 1, z: 0 });  // leaflet plane normal world
      const meshZWorld = rotateVec(q, { x: 0, y: 0, z: 1 });  // leaflet width world
      const m1 = m.name.match(/_a(\d+)_n(\d+)_l(\d+)_(\w+)$/);
      if (!m1) continue;
      samples.push({
        leafTag: `a${m1[1]}_n${m1[2]}`,
        leafletIdx: +m1[3],
        position: m1[4],
        meshXWorld,    // bladeDir
        meshYWorld,    // plane normal — should be ~world UP for flat leaf
        meshZWorld,    // width
        // 측정 metric: plane normal과 WORLD_UP 각도 = "기울기"
        normalDotUp: meshYWorld.y,  // 1 = flat, 0 = vertical
        // 가로 width 방향이 world에서 _위/아래_ 기울 정도
        widthVerticalTilt: meshZWorld.y,  // ≠ 0 = slanted plane
      });
    }

    // axis0:n13 (사용자 reference) 잎 sample 전체 (~15 leaflets).
    const n13 = samples.filter(s => s.leafTag === 'a0_n13');

    // 통계: normalDotUp 분포 (1=flat, 0=vertical, -1=upside-down).
    //   기대값 1.0 (정상 mature plant 잎은 hemisphere 거의 위).
    //   pitch 30° around X → mesh +Y가 30° 기울어짐 → cos(30°) = 0.87.
    const normalDots = samples.map(s => s.normalDotUp);
    const tilts = samples.map(s => s.widthVerticalTilt);
    const stat = (a) => {
      const s = a.slice().sort((x, y) => x - y);
      return {
        n: s.length, min: s[0], p10: s[Math.floor(s.length * 0.1)],
        p50: s[Math.floor(s.length * 0.5)], p90: s[Math.floor(s.length * 0.9)],
        max: s[s.length - 1], avg: a.reduce((x, y) => x + y, 0) / a.length,
      };
    };

    return {
      sampleCount: samples.length,
      normalDotUpStat: stat(normalDots),
      widthVerticalTiltStat: stat(tilts),
      n13Detail: n13.map(s => ({
        idx: s.leafletIdx, pos: s.position,
        bladeDirWorld: s.meshXWorld,
        planeNormalDotUp: s.normalDotUp,
        widthTilt: s.widthVerticalTilt,
        // foldDroopDeg 30° around X면 widthTilt ≈ sin(30°) = 0.5 (절대값)
      })),
      // 좌/우 leaflet 쌍의 widthTilt 부호 비교
      tiltSignDistribution: {
        positive: samples.filter(s => s.widthVerticalTilt > 0.1).length,
        negative: samples.filter(s => s.widthVerticalTilt < -0.1).length,
        nearZero: samples.filter(s => Math.abs(s.widthVerticalTilt) <= 0.1).length,
      },
    };
  });

  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
