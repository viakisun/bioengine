// Iter 31 R23 — leaf mesh build _벡터 계산_ 전수 추적 (마지막 진단).
//
// 사용자: "이제 남은 건 벡터 계산밖에 없어"
//
// 진단 대상:
//   각 leaf mesh마다:
//     1. leafletCount, currentArea, ageTT
//     2. mesh-local vertex range x/y/z (어느 axis가 dominant)
//     3. expected leaf length (petioleLen + rachisLen 계산)
//     4. _실제_ mesh의 leaf length axis가 +x인가?
//     5. anomaly: dominant axis가 +x가 아닌 leaf의 build pattern

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/?quality=8', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setMode('single-plant');
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

test.describe('Iter 31 R23 — leaf mesh build 벡터 계산 추적', () => {
  test('R23-DIAG-01: 각 leaf의 mesh build axes + leafletCount + expected length', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);

    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        getVerticesData?(kind: string): Float32Array | null;
      };
      type Phyto = {
        index: number;
        leaf: {
          leafletCount: number;
          currentAreaCm2: number;
          ageTT: number;
          stage: string;
          geometryProjection?: {
            leafAxisLengthScale: number;
            referencePetioleLengthM: number;
            referenceRachisLengthM: number;
          };
        };
      };
      type Node = { id: string; type?: string; phytomer?: Phyto };
      const w = window as unknown as {
        __debugScene?: { meshes?: Mesh[] };
        __skinplantGraph?: { nodes: Map<string, Node> };
      };
      const meshes = (w.__debugScene?.meshes ?? []) as Mesh[];
      const g = w.__skinplantGraph;
      if (!g) return null;

      const phytoByKey = new Map<string, Phyto>();
      for (const node of g.nodes.values()) {
        if (!node.phytomer) continue;
        const axisM = node.id.match(/axis(\d+)/);
        const axisIdx = axisM ? Number(axisM[1]) : 0;
        phytoByKey.set(`a${axisIdx}_n${node.phytomer.index}`, node.phytomer);
      }

      const leafMeshes = meshes.filter((m) => m.name.startsWith('skinplant_leaf_') && m.isEnabled());
      const data = leafMeshes.map((m) => {
        const positions = m.getVerticesData?.('position');
        if (!positions || positions.length === 0) return null;
        // Bin into 3 buckets by +x position to find "where" vertices concentrated
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        const xs: number[] = [];
        const zs: number[] = [];
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i], y = positions[i + 1], z = positions[i + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
          xs.push(x);
          zs.push(z);
        }
        const rangeX = (maxX - minX) * 100;
        const rangeY = (maxY - minY) * 100;
        const rangeZ = (maxZ - minZ) * 100;
        const xAbs = xs.reduce((s, v) => s + Math.abs(v), 0) / xs.length * 100;
        const zAbs = zs.reduce((s, v) => s + Math.abs(v), 0) / zs.length * 100;

        const match = m.name.match(/_(a\d+_n\d+)$/);
        const key = match ? match[1] : '';
        const phyto = phytoByKey.get(key);

        const expectedPetioleLenM = phyto?.leaf.geometryProjection?.referencePetioleLengthM ?? 0.10;
        const expectedRachisLenM = phyto?.leaf.geometryProjection?.referenceRachisLengthM ?? 0.30;
        const axisScale = phyto?.leaf.geometryProjection?.leafAxisLengthScale ?? 1;
        const expectedLength = (expectedPetioleLenM + expectedRachisLenM) * axisScale * 100;  // cm

        const dominantAxis = rangeX >= rangeY && rangeX >= rangeZ ? 'x'
          : rangeY >= rangeZ ? 'y' : 'z';

        return {
          name: m.name,
          key,
          leafletCount: phyto?.leaf.leafletCount ?? -1,
          currentAreaCm2: phyto?.leaf.currentAreaCm2 ?? -1,
          ageTT: phyto?.leaf.ageTT ?? -1,
          stage: phyto?.leaf.stage ?? 'unknown',
          axisScale,
          expectedLength,
          range: { x: rangeX, y: rangeY, z: rangeZ },
          meanAbs: { x: xAbs, z: zAbs },
          dominantAxis,
          vertexCount: positions.length / 3,
        };
      }).filter((d) => d !== null);

      return data;
    });

    if (!result) {
      // eslint-disable-next-line no-console
      console.log('ERROR: graph not available');
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`\n========== R23 LEAF MESH BUILD TRACE — D=30, ${result.length} leaves ==========\n`);

    // Per-leaf
    // eslint-disable-next-line no-console
    console.log(`★ Per-leaf mesh build trace:`);
    // eslint-disable-next-line no-console
    console.log(`  ${'leaf'.padEnd(12)} | leaflets | current  age | stage              | axisScale | expectedLen | rangeX  rangeY  rangeZ  | dominant | meanAbs(x,z)`);
    for (const d of result) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${d.key.padEnd(12)} | ${d.leafletCount.toString().padStart(8)} | ${d.currentAreaCm2.toString().padStart(7)} ${d.ageTT.toFixed(0).padStart(4)} | ` +
        `${d.stage.padEnd(18)} | ${d.axisScale.toFixed(3).padStart(8)} | ${d.expectedLength.toFixed(1).padStart(10)}cm | ` +
        `${d.range.x.toFixed(1).padStart(6)} ${d.range.y.toFixed(1).padStart(6)} ${d.range.z.toFixed(1).padStart(6)} | ` +
        `${d.dominantAxis.padStart(8)} | ${d.meanAbs.x.toFixed(2).padStart(5)} ${d.meanAbs.z.toFixed(2).padStart(5)}`
      );
    }

    // Anomaly catch
    const anomalies = result.filter((d) => d.dominantAxis !== 'x');
    // eslint-disable-next-line no-console
    console.log(`\n★ Anomalies (dominant axis ≠ +x):`);
    if (anomalies.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`  ✅ 모든 leaf의 dominant axis가 +x — mesh-local convention 정확`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  ⚠️ ${anomalies.length} / ${result.length} leaves with anomaly:`);
      for (const a of anomalies) {
        // eslint-disable-next-line no-console
        console.log(`    ${a.key}: dominant=${a.dominantAxis}, rangeX=${a.range.x.toFixed(1)} rangeZ=${a.range.z.toFixed(1)}, leafletCount=${a.leafletCount}, current=${a.currentAreaCm2}`);
      }
    }

    // Expected vs actual length ratio
    // eslint-disable-next-line no-console
    console.log(`\n★ Expected leaf length vs actual mesh rangeX:`);
    // eslint-disable-next-line no-console
    console.log(`  (정상이면 rangeX ≈ expectedLength × 1.0)`);
    for (const d of result) {
      const ratio = d.expectedLength > 0 ? d.range.x / d.expectedLength : 0;
      const status = ratio >= 0.8 && ratio <= 1.5 ? '✅' : '⚠️';
      // eslint-disable-next-line no-console
      console.log(`  ${d.key}: expectedLen=${d.expectedLength.toFixed(1)}cm, rangeX=${d.range.x.toFixed(1)}cm, ratio=${ratio.toFixed(2)} ${status}`);
    }

    // Cross-check: zsRangeZ / xsRangeX should be < 1 (leaf elongated +x)
    // eslint-disable-next-line no-console
    console.log(`\n★ rangeZ/rangeX ratio (width/length, 정상 < 0.6):`);
    for (const d of result) {
      const ratio = d.range.x > 0 ? d.range.z / d.range.x : 0;
      const status = ratio < 0.6 ? '✅' : ratio < 1.0 ? '⚠️' : '❌';
      // eslint-disable-next-line no-console
      console.log(`  ${d.key}: rangeZ/rangeX = ${ratio.toFixed(2)} ${status} (leafletCount=${d.leafletCount})`);
    }
  });
});
