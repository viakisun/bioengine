// Iter 31 Phase 9.3 — R13 leaf diversity diagnostic (사용자 2 결함).
//
// 결함 1: 모든 잎 방향 동일 (petiole world direction spiral 분산 측정)
// 결함 2: 모든 잎 패턴 동일 (leafletCount, mesh vertex count, bbox variation 측정)

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/?quality=8', { waitUntil: 'networkidle' });
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

test.describe('Iter 31 Phase 9.3 — R13 leaf diversity diagnostic', () => {
  test('R13-DIAG-01: petiole direction world spiral + morphology variation 측정', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Quat = { x: number; y: number; z: number; w: number };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        rotationQuaternion?: Quat | null;
        getBoundingInfo(): { boundingBox: { minimumWorld: V3; maximumWorld: V3 } };
        getTotalVertices?(): number;
        geometry?: { getTotalVertices(): number };
      };
      type Phyto = { index: number; leaf: { leafletCount: number; currentAreaCm2: number; ageTT: number; stage: string } };
      type Node = { id: string; type?: string; phytomer?: Phyto };
      const w = window as unknown as {
        __debugScene?: { meshes?: Mesh[] };
        __skinplantGraph?: { nodes: Map<string, Node> };
      };

      function rotateVec(q: Quat, v: V3): V3 {
        const ix = q.w * v.x + q.y * v.z - q.z * v.y;
        const iy = q.w * v.y + q.z * v.x - q.x * v.z;
        const iz = q.w * v.z + q.x * v.y - q.y * v.x;
        const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
        return {
          x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
          y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
          z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
        };
      }

      const meshes = (w.__debugScene?.meshes ?? []) as Mesh[];
      const g = w.__skinplantGraph;
      if (!g) return { error: 'no graph' };

      // Build phytomer lookup by mesh name suffix
      const phytoByKey = new Map<string, Phyto>();
      for (const node of g.nodes.values()) {
        if (!node.phytomer) continue;
        const axisM = node.id.match(/axis(\d+)/);
        const axisIdx = axisM ? Number(axisM[1]) : 0;
        phytoByKey.set(`a${axisIdx}_n${node.phytomer.index}`, node.phytomer);
      }

      const leafMeshes = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());
      const data = leafMeshes.map((m) => {
        const q = m.rotationQuaternion ?? { x: 0, y: 0, z: 0, w: 1 };
        const petioleWorld = rotateVec(q, { x: 1, y: 0, z: 0 });  // mesh +x = petiole
        const bladeWorld = rotateVec(q, { x: 0, y: 1, z: 0 });    // mesh +y = blade normal
        // petiole world azimuth (atan2 of horizontal projection)
        const azimuthWorldDeg = Math.atan2(petioleWorld.z, petioleWorld.x) * 180 / Math.PI;
        const bb = m.getBoundingInfo().boundingBox;
        const dx = (bb.maximumWorld.x - bb.minimumWorld.x) * 100;
        const dy = (bb.maximumWorld.y - bb.minimumWorld.y) * 100;
        const dz = (bb.maximumWorld.z - bb.minimumWorld.z) * 100;
        const bboxCm = Math.hypot(dx, dy, dz);
        const match = m.name.match(/_(a\d+_n\d+)$/);
        const key = match ? match[1] : '';
        const phyto = phytoByKey.get(key);
        const vertCount = m.geometry?.getTotalVertices() ?? m.getTotalVertices?.() ?? 0;
        return {
          name: m.name,
          azimuthWorldDeg,
          petioleWorld,
          bladeWorld,
          bboxCm,
          bboxDimensions: { dx, dy, dz },
          leafletCount: phyto?.leaf.leafletCount ?? -1,
          currentAreaCm2: phyto?.leaf.currentAreaCm2 ?? -1,
          ageTT: phyto?.leaf.ageTT ?? -1,
          stage: phyto?.leaf.stage ?? 'unknown',
          vertCount,
        };
      });

      // ─── Spiral analysis (petiole world azimuth) ───
      const azimuths = data.map((d) => d.azimuthWorldDeg);
      const azMean = azimuths.reduce((s, a) => s + a, 0) / azimuths.length;
      const azStd = Math.sqrt(
        azimuths.reduce((s, a) => s + (a - azMean) ** 2, 0) / azimuths.length
      );
      // 137.5° golden angle spiral 검증: 연속 leaf의 azimuth diff
      const sortedByName = [...data].sort((a, b) => a.name.localeCompare(b.name));
      const diffs: number[] = [];
      for (let i = 1; i < sortedByName.length; i++) {
        let diff = sortedByName[i].azimuthWorldDeg - sortedByName[i - 1].azimuthWorldDeg;
        while (diff < 0) diff += 360;
        while (diff > 360) diff -= 360;
        diffs.push(diff);
      }

      // ─── Morphology variation analysis ───
      const leafletCounts = data.map((d) => d.leafletCount).filter((c) => c >= 0);
      const uniqueLeafletCounts = [...new Set(leafletCounts)];
      const vertCounts = data.map((d) => d.vertCount).filter((v) => v > 0);
      const vertMean = vertCounts.reduce((s, v) => s + v, 0) / Math.max(1, vertCounts.length);
      const vertStd = Math.sqrt(
        vertCounts.reduce((s, v) => s + (v - vertMean) ** 2, 0) / Math.max(1, vertCounts.length)
      );
      const bboxes = data.map((d) => d.bboxCm);
      const bboxMean = bboxes.reduce((s, b) => s + b, 0) / Math.max(1, bboxes.length);
      const bboxStd = Math.sqrt(
        bboxes.reduce((s, b) => s + (b - bboxMean) ** 2, 0) / Math.max(1, bboxes.length)
      );

      return {
        count: data.length,
        data,
        azimuthAnalysis: { mean: azMean, std: azStd, diffs },
        morphologyAnalysis: {
          leafletCounts,
          uniqueLeafletCounts,
          vertCounts,
          vertMean,
          vertStd,
          vertStdRatio: vertMean > 0 ? vertStd / vertMean : 0,
          bboxMean,
          bboxStd,
          bboxStdRatio: bboxMean > 0 ? bboxStd / bboxMean : 0,
        },
      };
    });

    if ('error' in result) {
      // eslint-disable-next-line no-console
      console.log('ERROR:', result.error);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`\n========== R13 DIAGNOSTIC — D=30, ${result.count} leaves ==========\n`);

    // ─── 결함 1: 방향 동일성 ───
    // eslint-disable-next-line no-console
    console.log(`★ 결함 1: petiole world direction (azimuth) spiral`);
    // eslint-disable-next-line no-console
    console.log(`  mean azimuth: ${result.azimuthAnalysis.mean.toFixed(1)}° | std: ${result.azimuthAnalysis.std.toFixed(1)}°`);
    // eslint-disable-next-line no-console
    console.log(`  per-leaf azimuth world:`);
    for (const d of result.data) {
      // eslint-disable-next-line no-console
      console.log(`    ${d.name}: az=${d.azimuthWorldDeg.toFixed(1).padStart(7)}° | petiole=(${d.petioleWorld.x.toFixed(2)}, ${d.petioleWorld.y.toFixed(2)}, ${d.petioleWorld.z.toFixed(2)}) | blade=(${d.bladeWorld.x.toFixed(2)}, ${d.bladeWorld.y.toFixed(2)}, ${d.bladeWorld.z.toFixed(2)})`);
    }
    // eslint-disable-next-line no-console
    console.log(`  연속 azimuth diff (golden 137.5° 기대): [${result.azimuthAnalysis.diffs.map((d) => d.toFixed(0)).join(', ')}]`);

    // ─── 결함 2: 패턴 동일성 ───
    // eslint-disable-next-line no-console
    console.log(`\n★ 결함 2: leaf morphology variation`);
    // eslint-disable-next-line no-console
    console.log(`  leafletCount values: [${result.morphologyAnalysis.leafletCounts.join(', ')}]`);
    // eslint-disable-next-line no-console
    console.log(`  unique leafletCounts: [${result.morphologyAnalysis.uniqueLeafletCounts.join(', ')}] (${result.morphologyAnalysis.uniqueLeafletCounts.length} variations)`);
    // eslint-disable-next-line no-console
    console.log(`  mesh vertex count mean: ${result.morphologyAnalysis.vertMean.toFixed(0)} | std: ${result.morphologyAnalysis.vertStd.toFixed(0)} | std/mean: ${(result.morphologyAnalysis.vertStdRatio * 100).toFixed(1)}%`);
    // eslint-disable-next-line no-console
    console.log(`  mesh bbox mean: ${result.morphologyAnalysis.bboxMean.toFixed(1)}cm | std: ${result.morphologyAnalysis.bboxStd.toFixed(1)}cm | std/mean: ${(result.morphologyAnalysis.bboxStdRatio * 100).toFixed(1)}%`);

    // eslint-disable-next-line no-console
    console.log(`  per-leaf detail:`);
    for (const d of result.data) {
      // eslint-disable-next-line no-console
      console.log(`    ${d.name}: leaflets=${d.leafletCount.toString().padStart(2)} | verts=${d.vertCount.toString().padStart(4)} | bbox=${d.bboxCm.toFixed(1).padStart(5)}cm | stage=${d.stage} | ageTT=${d.ageTT}`);
    }

    // ─── 진단 결론 ───
    // eslint-disable-next-line no-console
    console.log(`\n★ 진단 결론:`);
    // 결함 1 evaluation
    // ─── 추가 진단: H6/H7 가설 ───
    // R14 후보: baseAlign이 azimuth와 cancel. 가설:
    //   H6 (baseAlign만, no azimuth)  — parallel-transport frame이 phyllotaxy 표현
    //   H7 (no baseAlign, world Y az만) — azimuth만으로 spread
    const hypothesisResult = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Quat = { x: number; y: number; z: number; w: number };
      type Frame = { tangent: V3; normal: V3 };
      type Posture = { azimuthDeg: number; finalBladePlaneTiltDeg?: number; droopDeg?: number; twistDeg: number };
      type Phyto = { index: number; leaf: { posture: Posture } };
      type Node = { id: string; type?: string; frame?: Frame; phytomer?: Phyto };
      const w = window as unknown as { __skinplantGraph?: { nodes: Map<string, Node> } };
      const g = w.__skinplantGraph;
      if (!g) return null;

      function normalize(v: V3): V3 {
        const L = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
        return L < 1e-9 ? { x: 1, y: 0, z: 0 } : { x: v.x/L, y: v.y/L, z: v.z/L };
      }
      function cross(a: V3, b: V3): V3 {
        return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x };
      }
      function quatAroundAxis(axis: V3, deg: number): Quat {
        const a = normalize(axis);
        const h = (deg * Math.PI / 180) / 2;
        const s = Math.sin(h);
        return { x: a.x*s, y: a.y*s, z: a.z*s, w: Math.cos(h) };
      }
      function quatMul(a: Quat, b: Quat): Quat {
        return {
          x: a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
          y: a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
          z: a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
          w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
        };
      }
      function rotateVec(q: Quat, v: V3): V3 {
        const ix = q.w*v.x + q.y*v.z - q.z*v.y;
        const iy = q.w*v.y + q.z*v.x - q.x*v.z;
        const iz = q.w*v.z + q.x*v.y - q.y*v.x;
        const iw = -q.x*v.x - q.y*v.y - q.z*v.z;
        return {
          x: ix*q.w + iw*-q.x + iy*-q.z - iz*-q.y,
          y: iy*q.w + iw*-q.y + iz*-q.x - ix*-q.z,
          z: iz*q.w + iw*-q.z + ix*-q.y - iy*-q.x,
        };
      }
      function matrixToQuat(ex: V3, ey: V3, ez: V3): Quat {
        const m00=ex.x, m01=ey.x, m02=ez.x, m10=ex.y, m11=ey.y, m12=ez.y, m20=ex.z, m21=ey.z, m22=ez.z;
        const t = m00+m11+m22;
        if (t > 0) {
          const s = Math.sqrt(t+1)*2;
          return { w: 0.25*s, x: (m21-m12)/s, y: (m02-m20)/s, z: (m10-m01)/s };
        } else if (m00>m11 && m00>m22) {
          const s = Math.sqrt(1+m00-m11-m22)*2;
          return { w: (m21-m12)/s, x: 0.25*s, y: (m01+m10)/s, z: (m02+m20)/s };
        } else if (m11>m22) {
          const s = Math.sqrt(1+m11-m00-m22)*2;
          return { w: (m02-m20)/s, x: (m01+m10)/s, y: 0.25*s, z: (m12+m21)/s };
        } else {
          const s = Math.sqrt(1+m22-m00-m11)*2;
          return { w: (m10-m01)/s, x: (m02+m20)/s, y: (m12+m21)/s, z: 0.25*s };
        }
      }
      function baseAlign(stemNormal: V3): Quat {
        const tx = normalize(stemNormal);
        const upDot = tx.x*0 + tx.y*1 + tx.z*0;
        const upProj = { x: -tx.x*upDot, y: 1 - tx.y*upDot, z: -tx.z*upDot };
        const len = Math.sqrt(upProj.x*upProj.x + upProj.y*upProj.y + upProj.z*upProj.z);
        const ty = len > 1e-6 ? { x: upProj.x/len, y: upProj.y/len, z: upProj.z/len } : { x: 1, y: 0, z: 0 };
        return matrixToQuat(tx, ty, cross(tx, ty));
      }

      const data: Array<{
        id: string;
        h6_petAz: number;  // baseAlign만 (az=0)
        h7_petAz: number;  // no baseAlign, world Y az만
        h8_petAz: number;  // baseAlign + tangent-axis az (Phase 0.D 원래)
      }> = [];

      for (const node of g.nodes.values()) {
        if (!node.phytomer || !node.frame) continue;
        const az = node.phytomer.leaf.posture.azimuthDeg;
        const droopDeg = node.phytomer.leaf.posture.finalBladePlaneTiltDeg ?? node.phytomer.leaf.posture.droopDeg ?? 0;
        const binormal = cross(node.frame.tangent, node.frame.normal);

        // H6: baseAlign만, no azimuth
        const h6_q = baseAlign(node.frame.normal);  // qAz=identity, qDroop=identity, qTwist=identity
        const h6_petiole = rotateVec(h6_q, { x: 1, y: 0, z: 0 });
        const h6_az = Math.atan2(h6_petiole.z, h6_petiole.x) * 180 / Math.PI;

        // H7: no baseAlign, world Y azimuth만
        const h7_qAz = quatAroundAxis({ x: 0, y: 1, z: 0 }, az);
        const h7_petiole = rotateVec(h7_qAz, { x: 1, y: 0, z: 0 });
        const h7_az = Math.atan2(h7_petiole.z, h7_petiole.x) * 180 / Math.PI;

        // H8: baseAlign + tangent-axis az (Phase 0.D 원래 동작)
        const h8_ba = baseAlign(node.frame.normal);
        const h8_qDroop = quatAroundAxis(binormal, -droopDeg);
        const h8_qAz = quatAroundAxis(node.frame.tangent, az);
        const h8_q = quatMul(h8_qAz, quatMul(h8_qDroop, h8_ba));
        const h8_petiole = rotateVec(h8_q, { x: 1, y: 0, z: 0 });
        const h8_az = Math.atan2(h8_petiole.z, h8_petiole.x) * 180 / Math.PI;

        const axisM = node.id.match(/axis(\d+)/);
        data.push({
          id: `axis${axisM?.[1]}_n${node.phytomer.index}`,
          h6_petAz: h6_az, h7_petAz: h7_az, h8_petAz: h8_az,
        });
      }

      function stats(values: number[]) {
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
        return { mean, std };
      }
      const h6Stats = stats(data.map((d) => d.h6_petAz));
      const h7Stats = stats(data.map((d) => d.h7_petAz));
      const h8Stats = stats(data.map((d) => d.h8_petAz));
      return { data, h6Stats, h7Stats, h8Stats };
    });

    if (hypothesisResult) {
      // eslint-disable-next-line no-console
      console.log(`\n★ R14 가설 검증 — petiole world azimuth std (높을수록 분산 OK):`);
      // eslint-disable-next-line no-console
      console.log(`  current R12 (baseAlign + world Y az): std = ${result.azimuthAnalysis.std.toFixed(1)}°`);
      // eslint-disable-next-line no-console
      console.log(`  H6 (baseAlign만, az=0):                 std = ${hypothesisResult.h6Stats.std.toFixed(1)}°`);
      // eslint-disable-next-line no-console
      console.log(`  H7 (no baseAlign, world Y az만):        std = ${hypothesisResult.h7Stats.std.toFixed(1)}°`);
      // eslint-disable-next-line no-console
      console.log(`  H8 (baseAlign + tangent az = Phase 0.D): std = ${hypothesisResult.h8Stats.std.toFixed(1)}°`);
      // eslint-disable-next-line no-console
      console.log(`  per-leaf H6/H7/H8 petiole azimuth:`);
      for (const d of hypothesisResult.data) {
        // eslint-disable-next-line no-console
        console.log(`    ${d.id}: H6=${d.h6_petAz.toFixed(0).padStart(5)}° | H7=${d.h7_petAz.toFixed(0).padStart(5)}° | H8=${d.h8_petAz.toFixed(0).padStart(5)}°`);
      }
    }

    // ─── 진단 결론 ───
    // eslint-disable-next-line no-console
    console.log(`\n★ 진단 결론:`);
    // 결함 1 evaluation
    if (result.azimuthAnalysis.std > 60) {
      // eslint-disable-next-line no-console
      console.log(`  결함 1 (방향): azimuth std ${result.azimuthAnalysis.std.toFixed(0)}° > 60° → 산식상 분산 OK. 사용자 _시각_상 stack 보임 = R14 후보 (sterm-local frame 결합 또는 view angle bias).`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  결함 1 (방향): azimuth std ${result.azimuthAnalysis.std.toFixed(0)}° < 60° → spiral 분산 _부족_. R14 fix 필요.`);
    }
    // 결함 2 evaluation
    if (result.morphologyAnalysis.uniqueLeafletCounts.length >= 3 && result.morphologyAnalysis.vertStdRatio > 0.2) {
      // eslint-disable-next-line no-console
      console.log(`  결함 2 (패턴): leafletCount variation ${result.morphologyAnalysis.uniqueLeafletCounts.length}종 + vert std ${(result.morphologyAnalysis.vertStdRatio * 100).toFixed(0)}% → 산식상 분산 OK. 사용자 _시각_상 동일 = R15 후보 (leaf shape micro-variation).`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  결함 2 (패턴): leafletCount variation ${result.morphologyAnalysis.uniqueLeafletCounts.length}종 또는 vert std ${(result.morphologyAnalysis.vertStdRatio * 100).toFixed(0)}% _부족_. R15 fix 필요.`);
    }
  });
});
