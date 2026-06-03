// ★ S114 — Leaf branch apex-distance probe (via browser eval).

import { test } from '@playwright/test';

test('S114 leaf-branch apex-distance probe', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(10000);

  // Check what's exposed on window
  const dump = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return {
      hasTwinStore: '__twinStore' in w,
      hasLastGraph: '__lastGraph' in w,
      hasLastPlantBase: '__lastPlantBase' in w,
      keys: Object.keys(w).filter(k => k.startsWith('__')),
    };
  });
  console.log('window state:', dump);

  // Day 80
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): Record<string, unknown> };
    };
    const store = w.__twinStore?.getState();
    if (store && typeof store.setSinglePlantMinute === 'function') {
      (store.setSinglePlantMinute as (m: number) => void)(80 * 1440 + 12 * 60);
    }
  });
  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => {
    const w = window as unknown as {
      __lastPlantBase?: {
        mainAxis?: {
          leaves: Array<{
            nodeIdx: number;
            sizeFactor: number;
            bladeRef?: {
              rachisLengthM: number;
              leafLengthM: number;
              visualMaturity?: number;
              primaryPairs?: number;
              agePreset?: string;
            };
          }>;
          stemCurve: Array<{ nodeIdx: number; position: { x: number; y: number; z: number } }>;
        };
      };
    };
    if (!w.__lastPlantBase) return { error: '__lastPlantBase not set' };

    const pb = w.__lastPlantBase;
    if (!pb.mainAxis) return { error: 'no mainAxis' };

    const mainAxis = pb.mainAxis;
    if (!mainAxis.stemCurve || mainAxis.stemCurve.length === 0) {
      return { error: 'no stemCurve' };
    }

    const stemCurve = mainAxis.stemCurve;
    const apexPos = stemCurve[stemCurve.length - 1].position;
    const totalNodes = stemCurve.length;

    const dist3 = (a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}) => {
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      return Math.sqrt(dx*dx + dy*dy + dz*dz);
    };

    // Debug: dump first leaf raw structure
    const debugFirstLeaf = mainAxis.leaves?.[0] ?? null;
    void debugFirstLeaf;

    const leaves = (mainAxis.leaves ?? [])
      .filter(l => l.bladeRef)
      .map(l => {
        const stemNode = stemCurve.find(s => s.nodeIdx === l.nodeIdx);
        const apexDist = stemNode ? dist3(stemNode.position, apexPos) : -1;
        const r = l.bladeRef!.rachisLengthM;
        const p = l.bladeRef!.leafLengthM - r;
        return {
          nodeIdx: l.nodeIdx,
          nodeFromApex: totalNodes - 1 - l.nodeIdx,
          apexDistCm: apexDist * 100,
          sf: Math.round(l.sizeFactor * 100) / 100,
          visualMaturity: l.bladeRef!.visualMaturity != null
            ? Math.round(l.bladeRef!.visualMaturity * 1000) / 1000 : null,
          rachisCm: Math.round(r * 1000) / 10,
          petioleCm: Math.round(p * 1000) / 10,
          ratio: Math.round((r / Math.max(1e-6, p)) * 100) / 100,
          primaryPairs: l.bladeRef!.primaryPairs,
          agePreset: l.bladeRef!.agePreset,
          inflated: r > 0.40,
        };
      })
      .sort((a, b) => a.nodeFromApex - b.nodeFromApex);

    // PlantBase는 petioleLengthM을 _직접_ 가지고 있음 (PlantBase.ts:482, S114 미적용).
    // skeleton bladeRef는 별도 graph layer.
    // 두 값을 _둘 다_ 비교.
    const plantBaseLeaves = (mainAxis.leaves ?? [])
      .filter(l => (l as { visibility?: { visible?: boolean } }).visibility?.visible !== false)
      .map(l => {
        const lAny = l as {
          nodeIdx: number;
          sizeFactor: number;
          petioleLengthM: number;
          attachPosition: { x: number; y: number; z: number };
        };
        const stemNode = stemCurve.find(s => s.nodeIdx === lAny.nodeIdx);
        const apexDist = stemNode ? dist3(stemNode.position, apexPos) : -1;
        return {
          nodeIdx: lAny.nodeIdx,
          nodeFromApex: totalNodes - 1 - lAny.nodeIdx,
          apexDistCm: Math.round(apexDist * 1000) / 10,
          sf: Math.round(lAny.sizeFactor * 100) / 100,
          petioleLengthCm: Math.round(lAny.petioleLengthM * 1000) / 10,
          attachY: Math.round(lAny.attachPosition.y * 100) / 100,
        };
      })
      .sort((a, b) => a.nodeFromApex - b.nodeFromApex);

    return {
      plantBaseLeaves,
      totalNodes,
      apexPos: {
        x: Math.round(apexPos.x*1000)/1000,
        y: Math.round(apexPos.y*1000)/1000,
        z: Math.round(apexPos.z*1000)/1000,
      },
      leafCount: leaves.length,
      inflatedCount: leaves.filter(l => l.inflated).length,
      maxRachisCm: Math.max(...leaves.map(l => l.rachisCm)),
      leaves,
    };
  });

  console.log('=== S114 PROBE RESULT (day=80) ===');
  console.log(JSON.stringify(result, null, 2));
});
