// Iter 31 — R22: 줄기 기준 잎 회전 각도 측정.
//
// 사용자 질문: "실제로 줄기 기준으로 몇도 방향으로 얼마나 꺾여있어?"
//
// 측정:
//   각 leaf별:
//     stem_tangent vs leaf_petiole (mesh +x → world)  — _정상은 90° (petiole이 stem 측면)_
//     stem_tangent vs leaf_bladeUp (mesh +y → world)   — _stem 수직이면 0°, 휘면 stem.y만큼_
//     world_up vs leaf_bladeUp                          — _정상은 0° (blade horizontal)_
//     stem_normal vs leaf_petiole                       — _Phase 10.2: 0° (일치)_

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/?quality=8', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
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

test.describe('Iter 31 R22 — 줄기 기준 잎 회전 각도 측정', () => {
  test('R22-DIAG-01: stem tangent/normal vs leaf petiole/bladeUp angle', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);

    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Quat = { x: number; y: number; z: number; w: number };
      type Frame = { tangent: V3; normal: V3 };
      type Anchor = { id: string; kind: string; position?: V3; rotation?: Quat; meshAnchorNodeId?: string; anchorNodeId: string };
      type Node = { id: string; type?: string; pos: V3; frame?: Frame };
      type Edge = { id: number; organAnchors?: Anchor[] };
      const w = window as unknown as {
        __skinplantGraph?: { nodes: Map<string, Node>; edges: Map<number, Edge> };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;

      function dot3(a: V3, b: V3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
      function len(v: V3): number { return Math.sqrt(dot3(v, v)); }
      function angleDeg(a: V3, b: V3): number {
        const cosA = Math.max(-1, Math.min(1, dot3(a, b) / (len(a) * len(b) + 1e-9)));
        return Math.acos(cosA) * 180 / Math.PI;
      }
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

      const WORLD_UP: V3 = { x: 0, y: 1, z: 0 };

      const measurements: Array<{
        anchorId: string;
        stem: { tangent: V3; normal: V3; tangentY: number; nodeId: string };
        leaf: { petiole: V3; bladeUp: V3; width: V3 };
        angles: {
          stemTangent_to_petiole: number;       // 정상 90° (petiole이 stem 측면)
          stemTangent_to_bladeUp: number;        // 정상 0° (stem 직립 시) — stem 휨에 따라 변화
          stemNormal_to_petiole: number;         // Phase 10.2: 정상 0° (mesh +x ← stemFrame.normal)
          stemNormal_to_bladeUp: number;         // 정상 90° (orthonormal)
          worldUp_to_bladeUp: number;            // 정상 0° (blade horizontal)
          worldUp_to_petiole: number;            // 정상 90° (petiole horizontal)
        };
      }> = [];

      for (const edge of g.edges.values()) {
        for (const a of edge.organAnchors ?? []) {
          if (a.kind !== 'leaf_blade' || !a.rotation) continue;
          const meshNodeId = a.meshAnchorNodeId ?? a.anchorNodeId;
          const meshNode = g.nodes.get(meshNodeId);
          if (!meshNode?.frame) continue;

          const stemTangent = meshNode.frame.tangent;
          const stemNormal = meshNode.frame.normal;
          const petiole = rotateVec(a.rotation, { x: 1, y: 0, z: 0 });  // mesh +x → world
          const bladeUp = rotateVec(a.rotation, { x: 0, y: 1, z: 0 });   // mesh +y → world
          const width = rotateVec(a.rotation, { x: 0, y: 0, z: 1 });

          measurements.push({
            anchorId: a.id,
            stem: { tangent: stemTangent, normal: stemNormal, tangentY: stemTangent.y, nodeId: meshNode.id },
            leaf: { petiole, bladeUp, width },
            angles: {
              stemTangent_to_petiole: angleDeg(stemTangent, petiole),
              stemTangent_to_bladeUp: angleDeg(stemTangent, bladeUp),
              stemNormal_to_petiole: angleDeg(stemNormal, petiole),
              stemNormal_to_bladeUp: angleDeg(stemNormal, bladeUp),
              worldUp_to_bladeUp: angleDeg(WORLD_UP, bladeUp),
              worldUp_to_petiole: angleDeg(WORLD_UP, petiole),
            },
          });
        }
      }

      function stats(values: number[]) {
        const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
        const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length));
        const min = Math.min(...values);
        const max = Math.max(...values);
        return { mean, std, min, max };
      }

      return {
        count: measurements.length,
        measurements,
        summary: {
          stemTangent_to_petiole: stats(measurements.map((m) => m.angles.stemTangent_to_petiole)),
          stemTangent_to_bladeUp: stats(measurements.map((m) => m.angles.stemTangent_to_bladeUp)),
          stemNormal_to_petiole: stats(measurements.map((m) => m.angles.stemNormal_to_petiole)),
          stemNormal_to_bladeUp: stats(measurements.map((m) => m.angles.stemNormal_to_bladeUp)),
          worldUp_to_bladeUp: stats(measurements.map((m) => m.angles.worldUp_to_bladeUp)),
          worldUp_to_petiole: stats(measurements.map((m) => m.angles.worldUp_to_petiole)),
        },
      };
    });

    if (!result) {
      // eslint-disable-next-line no-console
      console.log('ERROR: graph not available');
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`\n========== R22 STEM-LEAF ANGLES — D=30, ${result.count} leaves ==========\n`);

    // Per-leaf
    // eslint-disable-next-line no-console
    console.log(`★ Per-leaf angles (deg):`);
    // eslint-disable-next-line no-console
    console.log(`  ${'anchorId'.padEnd(30)} | stemT~pet  stemT~blade  stemN~pet  stemN~blade  worldUp~blade  worldUp~pet  | stem.tangent.y`);
    for (const m of result.measurements) {
      const a = m.angles;
      // eslint-disable-next-line no-console
      console.log(
        `  ${m.anchorId.padEnd(30)} | ${a.stemTangent_to_petiole.toFixed(0).padStart(7)}    ${a.stemTangent_to_bladeUp.toFixed(0).padStart(7)}    ` +
        `${a.stemNormal_to_petiole.toFixed(0).padStart(6)}     ${a.stemNormal_to_bladeUp.toFixed(0).padStart(7)}     ` +
        `${a.worldUp_to_bladeUp.toFixed(0).padStart(7)}      ${a.worldUp_to_petiole.toFixed(0).padStart(6)}    | ${m.stem.tangentY.toFixed(2)}`
      );
    }

    // Summary
    // eslint-disable-next-line no-console
    console.log(`\n★ Summary (mean ± std, [min, max]):`);
    const s = result.summary;
    const fmt = (st: { mean: number; std: number; min: number; max: number }) =>
      `${st.mean.toFixed(1).padStart(6)}° ± ${st.std.toFixed(1).padStart(5)}°  [${st.min.toFixed(0).padStart(3)}, ${st.max.toFixed(0).padStart(3)}]`;
    // eslint-disable-next-line no-console
    console.log(`  stem.tangent ~ leaf.petiole (정상 90°):       ${fmt(s.stemTangent_to_petiole)}`);
    // eslint-disable-next-line no-console
    console.log(`  stem.tangent ~ leaf.bladeUp  (stem 직립=0°):   ${fmt(s.stemTangent_to_bladeUp)}`);
    // eslint-disable-next-line no-console
    console.log(`  stem.normal  ~ leaf.petiole  (Phase 10.2: 0°): ${fmt(s.stemNormal_to_petiole)}`);
    // eslint-disable-next-line no-console
    console.log(`  stem.normal  ~ leaf.bladeUp  (정상 90°):       ${fmt(s.stemNormal_to_bladeUp)}`);
    // eslint-disable-next-line no-console
    console.log(`  WORLD_UP     ~ leaf.bladeUp  (정상 0°):        ${fmt(s.worldUp_to_bladeUp)}`);
    // eslint-disable-next-line no-console
    console.log(`  WORLD_UP     ~ leaf.petiole  (정상 90°):       ${fmt(s.worldUp_to_petiole)}`);

    // Diagnosis
    // eslint-disable-next-line no-console
    console.log(`\n★ 진단:`);
    const stemNormalPetioleDeviation = Math.abs(s.stemNormal_to_petiole.mean - 0);
    const worldUpBladeUpDeviation = Math.abs(s.worldUp_to_bladeUp.mean - 0);
    const stemTangentPetiole = Math.abs(s.stemTangent_to_petiole.mean - 90);
    if (stemNormalPetioleDeviation < 5 && worldUpBladeUpDeviation < 5 && stemTangentPetiole < 15) {
      // eslint-disable-next-line no-console
      console.log(`  ✅ 모든 각도 정상 — leaf rotation 정확`);
    } else {
      if (stemNormalPetioleDeviation >= 5) {
        // eslint-disable-next-line no-console
        console.log(`  ⚠️ stemNormal ~ petiole = ${s.stemNormal_to_petiole.mean.toFixed(1)}° (Phase 10.2 의도 = 0°)`);
      }
      if (worldUpBladeUpDeviation >= 5) {
        // eslint-disable-next-line no-console
        console.log(`  ⚠️ worldUp ~ bladeUp = ${s.worldUp_to_bladeUp.mean.toFixed(1)}° (정상 = 0°, blade horizontal)`);
      }
      if (stemTangentPetiole >= 15) {
        // eslint-disable-next-line no-console
        console.log(`  ⚠️ stemTangent ~ petiole = ${s.stemTangent_to_petiole.mean.toFixed(1)}° (정상 ≈ 90°)`);
      }
    }
  });
});
