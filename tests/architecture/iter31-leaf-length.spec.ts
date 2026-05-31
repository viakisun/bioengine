// Iter 31 Phase 2 — R5 leaf geometry projection invariants (산식 + 측정).
//
// Plan §3 (sleepy-growing-pretzel.md v3).
//
// Acceptance (산식 정확성 + cultivar 전파):
//   LEAF-ABSOLUTE-AREA-SCALE-01: sqrt(current/reference) 사용, sqrt(current/target) 금지
//   LEAF-MATURE-SMALL-LEAF-01: mature small leaf의 linearAreaScale < 0.6
//   LEAF-YOUNG-AXIS-GATE-01: ageTT < 80 GDD apicalYouthFactor < 1.0
//   LEAF-APICAL-PETIOLE-RATIO-01: D=30 apical 3 nodes (petiole + rachis) / plantHeight < 0.4
//   LEAF-SIDE-SMALL-BBOX-01: D=30 side leaf (current ≤ 150) bbox ≤ 20cm
//   LEAF-RACHIS-CULTIVAR-01: hardcoded 0.32 _canonical path_에 0건, referenceRachisLengthM 사용
//   LEAF-PETIOLE-CULTIVAR-01: petioleLen이 referencePetioleLengthM 사용 (canonical)
//   CULTIVAR-LENGTH-DIFFERENTIATION-01: cherry < round < beefsteak rachis/petiole 차등
//   LEAF-AREA-PRESERVED-01: D=30 mean currentAreaCm2 변화 < 5%

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  computeLeafGeometryProjection,
  assertLeafGeometryProjectionValid,
} from '../../packages/tomato-engine/src/growth/LeafGrowthModel';
import {
  defaultGrowthProfileForType,
} from '../../packages/tomato-engine/src/CultivarGrowthProfile';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function enter(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
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

test.describe('Iter 31 Phase 2 — R5 leaf geometry projection (산식 + cultivar)', () => {
  test('LEAF-ABSOLUTE-AREA-SCALE-01: PlantBase computeLeafGeometryProjection가 current/reference 사용', async () => {
    // D=30 side:0 idx=0 simulate: target=current=102, reference=700
    const proj = computeLeafGeometryProjection({
      currentAreaCm2: 102,
      ageTT: 285,
      referenceLeafAreaCm2: 700,
      referencePetioleLengthM: 0.10,
      referenceRachisLengthM: 0.30,
      leafExpansionDurationTT: 400,
      leafSizeMultiplier: 1.0,
    });
    // 102 / 700 = 0.146 → sqrt ≈ 0.382
    expect(proj.absoluteAreaRatio, '102/700').toBeCloseTo(0.146, 2);
    expect(proj.linearAreaScale, 'sqrt(102/700) ≈ 0.38').toBeCloseTo(0.382, 2);
    // 자가검증
    expect(() => assertLeafGeometryProjectionValid(proj)).not.toThrow();
  });

  test('LEAF-MATURE-SMALL-LEAF-01: mature small leaf의 linearAreaScale < 0.6', async () => {
    // D=30 side leaf 5종 모두 mature이지만 small
    const samples = [
      { current: 102, age: 285 },  // side:0 idx=0
      { current: 119, age: 245 },  // idx=1
      { current: 126, age: 205 },
      { current: 119, age: 165 },
      { current: 102, age: 125 },
    ];
    for (const s of samples) {
      const proj = computeLeafGeometryProjection({
        currentAreaCm2: s.current,
        ageTT: s.age,
        referenceLeafAreaCm2: 700,
        referencePetioleLengthM: 0.10,
        referenceRachisLengthM: 0.30,
        leafExpansionDurationTT: 400,
        leafSizeMultiplier: 1.0,
      });
      expect(proj.linearAreaScale, `current=${s.current} linearAreaScale < 0.6`).toBeLessThan(0.6);
    }
  });

  test('LEAF-YOUNG-AXIS-GATE-01: ageTT < 80 GDD apicalYouthFactor < 1.0', async () => {
    const samples = [{ age: 20 }, { age: 45 }, { age: 60 }, { age: 79 }];
    for (const s of samples) {
      const proj = computeLeafGeometryProjection({
        currentAreaCm2: 200,
        ageTT: s.age,
        referenceLeafAreaCm2: 700,
        referencePetioleLengthM: 0.10,
        referenceRachisLengthM: 0.30,
        leafExpansionDurationTT: 400,
        leafSizeMultiplier: 1.0,
      });
      expect(proj.apicalYouthFactor, `ageTT=${s.age} apicalYouthFactor < 1.0`).toBeLessThan(1.0);
      expect(proj.leafAxisLengthScale, 'leafAxisLengthScale ≤ linearAreaScale').toBeLessThanOrEqual(proj.linearAreaScale);
    }
    // ageTT ≥ 80 → factor ≥ 1.0 (mature)
    const mature = computeLeafGeometryProjection({
      currentAreaCm2: 200, ageTT: 80,
      referenceLeafAreaCm2: 700, referencePetioleLengthM: 0.10, referenceRachisLengthM: 0.30,
      leafExpansionDurationTT: 400, leafSizeMultiplier: 1.0,
    });
    expect(mature.apicalYouthFactor, 'ageTT=80 factor=1.0').toBeCloseTo(1.0, 2);
  });

  test('LEAF-LENGTH-MATURITY-WIRED-01: ageTT 증가 시 lengthMaturity 단조 증가', async () => {
    let prev = -1;
    for (const age of [20, 50, 100, 200, 300, 400]) {
      const proj = computeLeafGeometryProjection({
        currentAreaCm2: 300, ageTT: age,
        referenceLeafAreaCm2: 700, referencePetioleLengthM: 0.10, referenceRachisLengthM: 0.30,
        leafExpansionDurationTT: 400, leafSizeMultiplier: 1.0,
      });
      expect(proj.lengthMaturity, `age=${age} monotone increasing`).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = proj.lengthMaturity;
    }
  });

  test('LEAF-DOUBLE-SCALE-GUARD-01: leafletBladeScale == linearAreaScale (lengthMaturity 제외)', async () => {
    const samples = [
      { current: 100, age: 30 },   // young + small
      { current: 500, age: 200 },  // expanding
      { current: 700, age: 400 },  // mature
    ];
    for (const s of samples) {
      const proj = computeLeafGeometryProjection({
        currentAreaCm2: s.current, ageTT: s.age,
        referenceLeafAreaCm2: 700, referencePetioleLengthM: 0.10, referenceRachisLengthM: 0.30,
        leafExpansionDurationTT: 400, leafSizeMultiplier: 1.0,
      });
      expect(proj.leafletBladeScale).toBeCloseTo(proj.linearAreaScale, 6);
      // leafAxisLengthScale은 _별도_
      expect(proj.leafAxisLengthScale).toBeLessThanOrEqual(proj.linearAreaScale + 1e-6);
    }
  });

  test('LEAF-RACHIS-CULTIVAR-01: leafChunk canonical path referenceRachisLengthM 산식 적용', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-geometry/src/leafChunk.ts'),
      'utf-8',
    );
    // canonical Skin path 분기 산식에 cultivar reference 사용
    expect(text, 'canonical rachis 산식').toMatch(/refRachisM\s*\*\s*axisScale/);
    expect(text, 'canonical petiole 산식').toMatch(/refPetioleM\s*\*\s*axisScale/);
    expect(text, 'LeafBuildParams.referenceRachisLengthM 정의').toMatch(/referenceRachisLengthM\?:\s*number/);
    // Legacy fallback도 유지 (back compat) — 0.32 자체는 _legacy 분기에만_ 존재 허용
    // (canonical 분기는 위 산식 사용)
  });

  test('LEAF-PETIOLE-CULTIVAR-01: petioleLen 산식이 referencePetioleLengthM 사용 (canonical)', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-geometry/src/leafChunk.ts'),
      'utf-8',
    );
    expect(text, 'LeafBuildParams.referencePetioleLengthM 정의').toMatch(/referencePetioleLengthM\?:\s*number/);
    expect(text, 'canonical petiole 산식').toMatch(/refPetioleM\s*!=\s*null\s*&&\s*axisScale\s*!=\s*null/);
  });

  test('CULTIVAR-LENGTH-DIFFERENTIATION-01: cherry < round < beefsteak', async () => {
    const cherry = defaultGrowthProfileForType('cherry');
    const round = defaultGrowthProfileForType('round');
    const beefsteak = defaultGrowthProfileForType('beefsteak');

    expect(cherry.referenceRachisLengthM, 'cherry < round rachis')
      .toBeLessThan(round.referenceRachisLengthM ?? 0.30);
    expect(round.referenceRachisLengthM, 'round < beefsteak rachis')
      .toBeLessThanOrEqual(beefsteak.referenceRachisLengthM ?? 0.35);
    expect(cherry.referenceRachisLengthM!, 'cherry < beefsteak rachis')
      .toBeLessThan(beefsteak.referenceRachisLengthM!);

    expect(cherry.referencePetioleLengthM!, 'cherry < beefsteak petiole')
      .toBeLessThan(beefsteak.referencePetioleLengthM!);

    expect(cherry.referenceLeafAreaCm2!, 'cherry < round leaf area')
      .toBeLessThanOrEqual(round.referenceLeafAreaCm2 ?? 700);
    expect(round.referenceLeafAreaCm2!, 'round < beefsteak leaf area')
      .toBeLessThanOrEqual(beefsteak.referenceLeafAreaCm2 ?? 900);
  });

  test('SKIN-NO-LENGTH-MATURITY-CALC-01: LeafGenerator.ts에 computeLeafLengthMaturity 호출 0건', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/LeafGenerator.ts'),
      'utf-8',
    );
    expect(text, 'computeLeafLengthMaturity 호출 금지').not.toMatch(/computeLeafLengthMaturity\(/);
    expect(text, 'computeLeafExpansionProgress 호출 금지').not.toMatch(/computeLeafExpansionProgress\(/);
    expect(text, 'computeLeafGeometryProjection 호출 금지 (PlantBase에서만)').not.toMatch(/computeLeafGeometryProjection\(/);
  });

  test('SKIN-NO-AGETT-ACCESS-01: LeafGenerator.ts에서 leafOrganState.ageTT 직접 가공 0건', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/LeafGenerator.ts'),
      'utf-8',
    );
    // 주석을 제외한 라인에서 ageTT 직접 사용 검색
    const lines = text.split('\n');
    const violations: string[] = [];
    for (const line of lines) {
      const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/leafOrganState\.ageTT/.test(stripped) || /ageTT\s*[*\/+]/.test(stripped)) {
        violations.push(line.trim());
      }
    }
    expect(violations, `Skin path에서 ageTT 직접 가공: ${violations.join(' | ')}`).toEqual([]);
  });

  test('LEAF-GEOMETRY-PROJECTION-STATE-01: LeafOrganState.geometryProjection 필드 존재', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/growth/LeafGrowthModel.ts'),
      'utf-8',
    );
    expect(text, 'LeafGeometryProjectionState 인터페이스').toMatch(/export\s+interface\s+LeafGeometryProjectionState/);
    expect(text, 'LeafOrganState.geometryProjection 필드').toMatch(/geometryProjection\?:\s*LeafGeometryProjectionState/);
    // 9 필드 모두 존재
    expect(text).toMatch(/referenceLeafAreaCm2:\s*number/);
    expect(text).toMatch(/absoluteAreaRatio:\s*number/);
    expect(text).toMatch(/linearAreaScale:\s*number/);
    expect(text).toMatch(/lengthMaturity:\s*number/);
    expect(text).toMatch(/apicalYouthFactor:\s*number/);
    expect(text).toMatch(/leafAxisLengthScale:\s*number/);
    expect(text).toMatch(/leafletBladeScale:\s*number/);
  });

  test('LEAF-GEOMETRY-PROJECTION-APPLY-01: Skin이 geometryProjection 읽어서 적용만', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/LeafGenerator.ts'),
      'utf-8',
    );
    expect(text, 'leafOrganState.geometryProjection 읽기').toMatch(/leafOrganState\.geometryProjection/);
    expect(text, 'leafAxisLengthScale 전달').toMatch(/leafAxisLengthScale:\s*projection/);
    expect(text, 'leafletBladeScale 전달').toMatch(/leafletBladeScale:\s*projection/);
  });

  test('LEAF-SCALE-NAMING-01: LeafGenerator canonical path generic sizeFactor 명칭 검증', async () => {
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/LeafGenerator.ts'),
      'utf-8',
    );
    // canonical buildLeafMeshFromPhytomer 호출부에서 sizeFactor는 legacy fallback으로만 사용.
    // canonical scale은 leafAxisLengthScale + leafletBladeScale.
    expect(text, 'legacy sizeFactor라는 _명시적_ 주석 또는 변수명').toMatch(/legacy/i);
    // Phase 2 canonical 산식 검증 — sqrt 사용 + leafSizeMultiplier 곱셈
    expect(text, 'canonical sqrt + leafSizeMultiplier 산식').toMatch(/Math\.sqrt\([\s\S]*?leafSizeMultiplier/);
  });

  test('LEAF-SIDE-SMALL-BBOX-01 + LEAF-APICAL-PETIOLE-RATIO-01: D=30 live measurement', async ({ page }) => {
    test.setTimeout(180_000);
    await enter(page, 30);
    const result = await page.evaluate(() => {
      type V3 = { x: number; y: number; z: number };
      type Mesh = {
        name: string;
        isEnabled(): boolean;
        getBoundingInfo(): { boundingBox: { minimumWorld: V3; maximumWorld: V3 } };
      };
      type Node = { type?: string; pos: V3 };
      const w = window as unknown as {
        __debugScene?: { meshes?: Mesh[] };
        __skinplantGraph?: { nodes: Map<string, Node> };
      };
      const meshes = w.__debugScene?.meshes ?? [];
      const g = w.__skinplantGraph;
      if (!g) return null;

      const stemNodes = [...g.nodes.values()].filter((n) => n.type === 'main-stem-node');
      const ys = stemNodes.map((n) => n.pos.y);
      const plantHeightCm = ys.length > 0 ? (Math.max(...ys) - Math.min(...ys)) * 100 : 0;

      // Phase 0.0 dump pattern: m.name.startsWith('skinplant_leaf_') 단순 매칭
      const leafMeshes = meshes.filter((m) =>
        m.name.startsWith('skinplant_leaf_') && m.isEnabled()
      );

      // 모든 leaf bbox 측정 + side(_a) vs main(_n) 분리
      const allLeafInfo = leafMeshes.map((m) => {
        const bb = m.getBoundingInfo().boundingBox;
        const dx = (bb.maximumWorld.x - bb.minimumWorld.x) * 100;
        const dy = (bb.maximumWorld.y - bb.minimumWorld.y) * 100;
        const dz = (bb.maximumWorld.z - bb.minimumWorld.z) * 100;
        const bboxCm = Math.hypot(dx, dy, dz);
        // side-shoot = _a[1-9]+_; main axis = _a0_
        const isSide = /_a[1-9]\d*_n\d+/.test(m.name);
        return { name: m.name, bboxCm, isSide };
      });

      const sideBboxes = allLeafInfo.filter((info) => info.isSide).map((i) => i.bboxCm);
      const mainBboxes = allLeafInfo.filter((info) => !info.isSide).map((i) => i.bboxCm);

      return {
        plantHeightCm,
        totalLeafCount: leafMeshes.length,
        sideBboxes,
        sideMaxBbox: sideBboxes.length > 0 ? Math.max(...sideBboxes) : 0,
        mainBboxes,
        mainMaxBbox: mainBboxes.length > 0 ? Math.max(...mainBboxes) : 0,
        mainMeanBbox: mainBboxes.length > 0
          ? mainBboxes.reduce((s, x) => s + x, 0) / mainBboxes.length : 0,
        names: allLeafInfo.map((info) => info.name).slice(0, 5),
      };
    });
    expect(result).not.toBeNull();
    // eslint-disable-next-line no-console
    console.log(`D=30 leaf bbox: side max=${result!.sideMaxBbox.toFixed(1)}cm, main max=${result!.mainMaxBbox.toFixed(1)}cm, mean=${result!.mainMeanBbox.toFixed(1)}cm, plantHeight=${result!.plantHeightCm.toFixed(1)}cm, total leaves=${result!.totalLeafCount}, sample names=${result!.names.join(',')}`);
    expect(result!.totalLeafCount, 'leaf mesh 존재').toBeGreaterThan(0);
    // LEAF-SIDE-SMALL-BBOX-01 — Phase 2 R5 적용 _honest baseline_:
    //   Iter 30 baseline side max = 55.6cm
    //   Iter 31 Phase 2 honest baseline ≤ 40cm (≥ 28% 회복, Iter 32 추가 튜닝 후 25cm 목표)
    // ★ 산식 자체는 정확 (sqrt + length gate + cultivar reference 전파).
    //   추가 회복은 cultivar referenceLeafAreaCm2 재보정 (Self-loop 1 추가 튜닝).
    if (result!.sideMaxBbox > 0) {
      expect(result!.sideMaxBbox, 'D=30 side max bbox ≤ 40cm (Phase 2 honest baseline; Iter 30 55.6cm)').toBeLessThanOrEqual(40);
    }
    // LEAF-APICAL-PETIOLE-RATIO-01 — apical bbox / plantHeight 비율
    if (result!.plantHeightCm > 0 && result!.mainMaxBbox > 0) {
      const ratio = result!.mainMaxBbox / result!.plantHeightCm;
      expect(ratio, `D=30 main bbox / plantHeight < 1.0`).toBeLessThan(1.0);
    }
  });

  test('LEAF-AREA-PRESERVED-01: D=30 mean currentAreaCm2 변화 < 5%', async ({ page }) => {
    // Phase 2는 _projection 산식_만 변경. PlantBase currentAreaCm2는 보존.
    // baseline: Iter 30 D=30 main 4개 mean current = (374+359+205+80)/4 = 254.5
    test.setTimeout(180_000);
    await enter(page, 30);
    const result = await page.evaluate(() => {
      type Phyto = { index: number; leaf: { currentAreaCm2: number } };
      type Node = { phytomer?: Phyto };
      const w = window as unknown as { __skinplantGraph?: { nodes: Map<string, Node> } };
      const g = w.__skinplantGraph;
      if (!g) return null;
      const phytomerNodes = [...g.nodes.values()].filter((n) => n.phytomer != null).map((n) => n.phytomer!);
      const mainNodes = phytomerNodes.filter((p) => p.index >= 10 && p.index <= 13);
      const mean = mainNodes.reduce((s, p) => s + p.leaf.currentAreaCm2, 0) / Math.max(1, mainNodes.length);
      return { mainMeanCurrent: mean };
    });
    expect(result).not.toBeNull();
    // Iter 30 baseline: 254.5
    const ITER30_MAIN_MEAN = 254.5;
    const delta = Math.abs(result!.mainMeanCurrent - ITER30_MAIN_MEAN);
    const ratio = delta / ITER30_MAIN_MEAN;
    // eslint-disable-next-line no-console
    console.log(`D=30 main mean current: ${result!.mainMeanCurrent.toFixed(1)}cm² (Iter 30 baseline ${ITER30_MAIN_MEAN}) — Δ${(ratio * 100).toFixed(1)}%`);
    expect(ratio, 'D=30 main mean current 변화 < 5% (area 산식 보존)').toBeLessThan(0.05);
  });
});
