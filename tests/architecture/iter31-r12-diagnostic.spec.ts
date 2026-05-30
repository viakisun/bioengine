// Iter 31 Phase 9.1 — R12 diagnostic: per-leaf 단계별 blade normal trace.
//
// 3 가설 _모두_ 검증:
//   H1: 회전 순서 — baseAlign이 outermost vs innermost
//   H2: droop 부호 — quatAroundAxis(binormal, -droop) vs +droop
//   H3: azimuth axis — tangent vs stem-local 다른 축
//
// 측정: 각 leaf의 stem frame + posture + 4 variant 회전 결과 blade normal world y.
// 결과 → R12 fix 선택 + spec acceptance.

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
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

test.describe('Iter 31 Phase 9.1 — R12 diagnostic', () => {
  test('R12-DIAG-01: 각 leaf의 stem frame + posture + 가설별 blade normal world trace', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);

    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Quat = { x: number; y: number; z: number; w: number };
      type Frame = { tangent: V3; normal: V3 };
      type Posture = { azimuthDeg: number; finalBladePlaneTiltDeg?: number; droopDeg?: number; twistDeg: number };
      type Phyto = { index: number; leaf: { posture: Posture } };
      type Node = { id: string; type?: string; pos: V3; frame?: Frame; phytomer?: Phyto };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        rotationQuaternion?: Quat | null;
      };

      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, Node>;
          edges: Map<number, { organAnchors?: Array<{ id: string; kind: string; meshAnchorNodeId?: string; anchorNodeId: string }> }>;
        };
        __debugScene?: { meshes?: Mesh[] };
      };
      const g = w.__skinplantGraph;
      if (!g) return { error: 'no graph' };

      // Helpers — replicate quat math
      function dot3(a: V3, b: V3) { return a.x * b.x + a.y * b.y + a.z * b.z; }
      function cross(a: V3, b: V3): V3 {
        return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
      }
      function normalize(v: V3): V3 {
        const L = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
        if (L < 1e-9) return { x: 1, y: 0, z: 0 };
        return { x: v.x / L, y: v.y / L, z: v.z / L };
      }
      function quatMul(a: Quat, b: Quat): Quat {
        return {
          x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
          y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
          z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
          w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        };
      }
      function quatAroundAxis(axis: V3, deg: number): Quat {
        const a = normalize(axis);
        const rad = deg * Math.PI / 180;
        const h = rad / 2;
        const s = Math.sin(h);
        return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(h) };
      }
      function rotateVec(q: Quat, v: V3): V3 {
        // v' = q × v × q⁻¹
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
      function matrixToQuat(ex: V3, ey: V3, ez: V3): Quat {
        const m00 = ex.x, m01 = ey.x, m02 = ez.x;
        const m10 = ex.y, m11 = ey.y, m12 = ez.y;
        const m20 = ex.z, m21 = ey.z, m22 = ez.z;
        const trace = m00 + m11 + m22;
        if (trace > 0) {
          const s = Math.sqrt(trace + 1) * 2;
          return { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
        } else if (m00 > m11 && m00 > m22) {
          const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
          return { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
        } else if (m11 > m22) {
          const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
          return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
        } else {
          const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
          return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
        }
      }
      function baseAlign(stemNormal: V3): Quat {
        const tx = normalize(stemNormal);
        const worldUp = { x: 0, y: 1, z: 0 };
        const upDot = dot3(tx, worldUp);
        const upProj = { x: worldUp.x - tx.x * upDot, y: worldUp.y - tx.y * upDot, z: worldUp.z - tx.z * upDot };
        const ty = Math.sqrt(dot3(upProj, upProj)) > 1e-6 ? normalize(upProj) : { x: 1, y: 0, z: 0 };
        const tz = cross(tx, ty);
        return matrixToQuat(tx, ty, tz);
      }

      // Collect leaf anchors + matching stem frame + posture
      const leafData: Array<{
        id: string;
        nodeIdx: number;
        stemTangent: V3;
        stemNormal: V3;
        azimuthDeg: number;
        droopDeg: number;
        twistDeg: number;
        actualMeshBladeY: number;
      }> = [];

      // Map mesh by name pattern → phytomer index
      const meshes = (w.__debugScene?.meshes ?? []) as Mesh[];
      const leafMeshes = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());
      const meshByIndex = new Map<string, Mesh>();
      for (const m of leafMeshes) {
        const match = m.name.match(/_a(\d+)_n(\d+)$/);
        if (match) meshByIndex.set(`a${match[1]}_n${match[2]}`, m);
      }

      // Walk phytomer-bound nodes
      for (const node of g.nodes.values()) {
        if (!node.phytomer || !node.frame) continue;
        const axisM = node.id.match(/axis(\d+)/);
        const axisIdx = axisM ? Number(axisM[1]) : 0;
        const key = `a${axisIdx}_n${node.phytomer.index}`;
        const mesh = meshByIndex.get(key);
        if (!mesh) continue;
        const posture = node.phytomer.leaf.posture;
        const droopDeg = posture.finalBladePlaneTiltDeg ?? posture.droopDeg ?? 0;
        // Actual mesh blade normal world y (current production result)
        const q = mesh.rotationQuaternion ?? { x: 0, y: 0, z: 0, w: 1 };
        const meshBladeY = rotateVec(q, { x: 0, y: 1, z: 0 }).y;

        leafData.push({
          id: mesh.name,
          nodeIdx: node.phytomer.index,
          stemTangent: node.frame.tangent,
          stemNormal: node.frame.normal,
          azimuthDeg: posture.azimuthDeg,
          droopDeg,
          twistDeg: posture.twistDeg,
          actualMeshBladeY: meshBladeY,
        });
      }

      // ─── Hypothesis variants (compute blade normal world y for each) ───
      type Variant = {
        name: string;
        compute(stem: { tangent: V3; normal: V3 }, az: number, droop: number, twist: number): Quat;
      };

      const BIN = (t: V3, n: V3) => cross(t, n);

      const variants: Variant[] = [
        {
          name: 'current_R11',  // qAz × qDroop × qTwist × baseAlign
          compute: (s, az, droop, twist) => {
            const ba = baseAlign(s.normal);
            const qT = quatAroundAxis(s.normal, twist);
            const qD = quatAroundAxis(BIN(s.tangent, s.normal), -droop);
            const qA = quatAroundAxis(s.tangent, az);
            return quatMul(qA, quatMul(qD, quatMul(qT, ba)));
          },
        },
        {
          name: 'baseAlign_only',  // baseAlign 단독 (sanity check)
          compute: (s) => baseAlign(s.normal),
        },
        {
          name: 'baseAlign_plus_az',  // qAz × baseAlign
          compute: (s, az) => {
            const ba = baseAlign(s.normal);
            const qA = quatAroundAxis(s.tangent, az);
            return quatMul(qA, ba);
          },
        },
        {
          name: 'H1_baseAlign_outermost',  // baseAlign × qAz × qDroop × qTwist
          compute: (s, az, droop, twist) => {
            const ba = baseAlign(s.normal);
            const qT = quatAroundAxis(s.normal, twist);
            const qD = quatAroundAxis(BIN(s.tangent, s.normal), -droop);
            const qA = quatAroundAxis(s.tangent, az);
            return quatMul(ba, quatMul(qA, quatMul(qD, qT)));
          },
        },
        {
          name: 'H2_droop_positive',  // -droop → +droop
          compute: (s, az, droop, twist) => {
            const ba = baseAlign(s.normal);
            const qT = quatAroundAxis(s.normal, twist);
            const qD = quatAroundAxis(BIN(s.tangent, s.normal), droop);  // ★ +droop
            const qA = quatAroundAxis(s.tangent, az);
            return quatMul(qA, quatMul(qD, quatMul(qT, ba)));
          },
        },
        {
          name: 'H3_az_around_localY',  // azimuth around (0,1,0) world up instead of stemFrame.tangent
          compute: (s, az, droop, twist) => {
            const ba = baseAlign(s.normal);
            const qT = quatAroundAxis(s.normal, twist);
            const qD = quatAroundAxis(BIN(s.tangent, s.normal), -droop);
            const qA = quatAroundAxis({ x: 0, y: 1, z: 0 }, az);  // ★ world Y
            return quatMul(qA, quatMul(qD, quatMul(qT, ba)));
          },
        },
        {
          name: 'H4_az_baseAlign_first',  // baseAlign first then in stem-local: qTwist × qDroop × qAz applied
          // i.e. q = qAz × qDroop × qTwist applied after baseAlign in 'leaf-local' frame.
          // Equivalent to: q = qAz_stemLocal × qDroop_stemLocal × qTwist_stemLocal × baseAlign
          // where stem-local axes are post-baseAlign frame.
          compute: (s, az, droop, twist) => {
            const ba = baseAlign(s.normal);
            // After baseAlign, axes are:
            //   leaf +x (post) = stemNormal
            //   leaf +y (post) = upProj
            //   leaf +z (post) = cross
            // azimuth should rotate around the "stem axis" — which in post-baseAlign frame
            // is _the rotation we just made's local Y axis_ = local +z of stem-local-frame
            // (which is the binormal direction).
            // Actually simpler: rotate by az around stem.tangent _but_ apply _before_ baseAlign
            // so the rotation is in stem-local frame.
            const qA = quatAroundAxis(s.tangent, az);
            const qD = quatAroundAxis(BIN(s.tangent, s.normal), -droop);
            const qT = quatAroundAxis(s.normal, twist);
            // Sequence: rotate leaf in stem-local frame first (twist→droop→az), then baseAlign
            return quatMul(ba, quatMul(qA, quatMul(qD, qT)));
          },
        },
        {
          name: 'H5_no_droop',  // baseAlign + qAz only (droop = 0 시뮬)
          compute: (s, az, _, twist) => {
            const ba = baseAlign(s.normal);
            const qT = quatAroundAxis(s.normal, twist);
            const qA = quatAroundAxis(s.tangent, az);
            return quatMul(qA, quatMul(qT, ba));
          },
        },
      ];

      // Compute blade normal world y for each variant per leaf
      const summary: Array<{ leaf: string; az: number; droop: number; actual: number; variants: Record<string, number> }> = [];
      const variantTotals = new Map<string, { sum: number; count: number; upCount: number }>();
      for (const v of variants) variantTotals.set(v.name, { sum: 0, count: 0, upCount: 0 });

      for (const leaf of leafData) {
        const variantResults: Record<string, number> = {};
        for (const v of variants) {
          const q = v.compute(
            { tangent: leaf.stemTangent, normal: leaf.stemNormal },
            leaf.azimuthDeg, leaf.droopDeg, leaf.twistDeg,
          );
          const bladeWorld = rotateVec(q, { x: 0, y: 1, z: 0 });
          variantResults[v.name] = bladeWorld.y;
          const t = variantTotals.get(v.name)!;
          t.sum += bladeWorld.y;
          t.count++;
          if (bladeWorld.y > 0.5) t.upCount++;
        }
        summary.push({
          leaf: leaf.id,
          az: leaf.azimuthDeg,
          droop: leaf.droopDeg,
          actual: leaf.actualMeshBladeY,
          variants: variantResults,
        });
      }

      const variantSummary: Array<{ name: string; meanY: number; upRatio: number }> = [];
      for (const [name, t] of variantTotals) {
        variantSummary.push({
          name,
          meanY: t.count > 0 ? t.sum / t.count : 0,
          upRatio: t.count > 0 ? t.upCount / t.count : 0,
        });
      }

      return { leafCount: leafData.length, summary, variantSummary };
    });

    if ('error' in result) {
      // eslint-disable-next-line no-console
      console.log('ERROR:', result.error);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`\n========== R12 DIAGNOSTIC — D=30, ${result.leafCount} leaves ==========\n`);

    // Per-leaf detail
    // eslint-disable-next-line no-console
    console.log(`Per-leaf blade normal world y (each hypothesis):`);
    for (const s of result.summary) {
      const az = s.az.toFixed(0).padStart(3);
      const dr = s.droop.toFixed(1).padStart(5);
      const actualStr = s.actual.toFixed(3).padStart(7);
      const variantStr = Object.entries(s.variants)
        .map(([n, y]) => `${n}=${y.toFixed(2)}`)
        .join(' | ');
      // eslint-disable-next-line no-console
      console.log(`  ${s.leaf} az=${az}° droop=${dr}° actual=${actualStr} | ${variantStr}`);
    }

    // ─── Variant ranking ───
    // eslint-disable-next-line no-console
    console.log(`\nVariant ranking (mean blade normal world y, blade up ratio y>0.5):`);
    result.variantSummary.sort((a, b) => b.meanY - a.meanY);
    for (const v of result.variantSummary) {
      // eslint-disable-next-line no-console
      console.log(`  ${v.name.padEnd(30)} mean y = ${v.meanY.toFixed(3).padStart(7)} | up ratio = ${(v.upRatio * 100).toFixed(0).padStart(3)}%`);
    }

    // eslint-disable-next-line no-console
    console.log(`\n★ Winner (highest meanY): ${result.variantSummary[0].name}`);
  });
});
