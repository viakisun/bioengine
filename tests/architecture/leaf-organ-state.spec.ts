// Iter 29 Phase 2A — LeafOrganState invariants.
//
// Plan: sleepy-growing-pretzel.md §5, §6, §7, §10, §11, §12.
//
// Phase 2A 핵심: PlantBase가 _모든_ leaf-related growth state를 계산하여
// PhytomerNode.leaf (LeafOrganState)에 보관. Skin은 _값을 적용만_.
//
// Acceptance:
//   LEAF-AGE-TT-01: 모든 LeafOrganState에 ageTT, initiationTT
//   LEAF-TARGET-01: targetAreaCm2 formula (cultivar × position × vigor)
//   LEAF-EXPANSION-01: currentAreaCm2 ≤ targetAreaCm2 항상
//   LEAF-STAGE-01: leafletCount 1→3→5→7→max progression (Iter 29 v1 P0 SSOT 유지)
//   LEAF-POSTURE-01: PlantBase가 posture (azimuth/droop/twist) 계산
//   LEAF-SENESCENCE-TT-01: senescenceProgress = sigmoid(ageTT - senescenceStartTT)
//   LEAF-SENESCENCE-PLANTBASE-01: colorDullness/visibleAreaFactor/curl/droopDeg 모두 PlantBase 계산
//   DAY-LEGACY-LEAF-01: leafSizeFactor/leafMaturity은 legacy alias (canonical = leaf.*)
//   PHYTOMER-ORGAN-SHELL-01: Truss/SideShoot state shell까지만 (full biology 후속 Iter)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  computeLeafExpansionProgress,
  computeNodePositionFactor,
  computePlantVigorFactor,
  classifyLeafStage,
  makeLeafOrganStateFromFlat,
  type LeafOrganState,
  type LeafPostureState,
  type LeafMorphologyState,
  type TrussOrganState,
  type SideShootState,
} from '../../packages/tomato-engine/src/growth/LeafGrowthModel';
import {
  computeSenescenceStartTT,
  computeSenescenceProgress,
  computeColorDullness,
  computeVisibleAreaFactor,
  computeSenescenceCurl,
  computeSenescenceDroopDeg,
  makeSenescenceState,
} from '../../packages/tomato-engine/src/growth/SenescenceModel';
import { leafletCountFromMaturity } from '../../packages/tomato-engine/src/LeafStage';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

function buildLeaf(overrides: Partial<Parameters<typeof makeLeafOrganStateFromFlat>[0]>): LeafOrganState {
  const senescence = overrides.senescence ?? makeSenescenceState(0);
  const posture: LeafPostureState = overrides.posture ?? {
    curl: 0.1,
  };
  const morphology: LeafMorphologyState = overrides.morphology ?? {
    serrationDepth: 0.12, lobeDepth: 0.05, petioleLengthM: 0.3, variationSeed: 1,
  };
  return makeLeafOrganStateFromFlat({
    nodeIndex: 0,
    initiationTT: 100,
    visibleTT: 100,
    ageTT: 50,
    targetAreaCm2: 800,
    currentAreaCm2: 200,
    expansionProgress: 0.25,
    leafletCount: 3,
    posture,
    morphology,
    senescence,
    ...overrides,
  });
}

test.describe('LeafOrganState (Iter 29 Phase 2A)', () => {
  test('LEAF-AGE-TT-01: LeafOrganState ageTT/initiationTT/visibleTT fields', async () => {
    // Interface struct test
    const leaf = buildLeaf({ initiationTT: 200, ageTT: 150, visibleTT: 200 });
    expect(typeof leaf.initiationTT).toBe('number');
    expect(typeof leaf.ageTT).toBe('number');
    expect(typeof leaf.visibleTT).toBe('number');
    expect(leaf.initiationTT).toBe(200);
    expect(leaf.ageTT).toBe(150);
    expect(leaf.visibleTT).toBe(200);

    // PhytomerNode source — `leaf` field declared on NodeState/PhytomerNode
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    const nodeStateMatch = text.match(/export interface NodeState\s*\{[\s\S]*?^\}/m);
    expect(nodeStateMatch![0], 'NodeState.leaf field').toMatch(/leaf:\s*LeafOrganState/);
  });

  test('LEAF-TARGET-01: targetAreaCm2 formula (cultivar × position × vigor)', () => {
    // nodePositionFactor — sin curve, peak at nodeFrac=0.5
    expect(computeNodePositionFactor(0)).toBeCloseTo(0, 4);
    expect(computeNodePositionFactor(0.5)).toBeCloseTo(1, 4);
    expect(computeNodePositionFactor(1)).toBeCloseTo(0, 4);

    // plantVigorFactor — clamp [0.5, 1.5]
    expect(computePlantVigorFactor(0)).toBeCloseTo(0.5, 2);
    expect(computePlantVigorFactor(50)).toBeCloseTo(1.0, 2);
    expect(computePlantVigorFactor(200)).toBeCloseTo(1.5, 2);

    // Compose — cultivar.maxLeafAreaCm2 × pos × vigor
    const cultivarMax = 800;
    const targetMid = cultivarMax * computeNodePositionFactor(0.5) * computePlantVigorFactor(100);
    expect(targetMid).toBeGreaterThan(800);
    expect(targetMid).toBeLessThan(1500);

    const targetBase = cultivarMax * computeNodePositionFactor(0) * computePlantVigorFactor(100);
    expect(targetBase, 'base node position factor 0').toBeCloseTo(0, 2);
  });

  test('LEAF-EXPANSION-01: currentAreaCm2 ≤ targetAreaCm2 항상', () => {
    // makeLeafOrganStateFromFlat clamps current to target
    const overshoot = buildLeaf({
      targetAreaCm2: 500,
      currentAreaCm2: 700,
    });
    expect(overshoot.currentAreaCm2).toBeLessThanOrEqual(overshoot.targetAreaCm2);
    expect(overshoot.currentAreaCm2).toBe(500);

    // computeLeafExpansionProgress always in [0, 1]
    for (let ageTT = 0; ageTT <= 800; ageTT += 50) {
      const p = computeLeafExpansionProgress(ageTT, 400);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    // Before initiation
    expect(computeLeafExpansionProgress(-10, 400)).toBe(0);
    // Past full expansion
    expect(computeLeafExpansionProgress(2000, 400)).toBeCloseTo(1, 2);
  });

  test('LEAF-STAGE-01: leafletCount 1→3→5→7→max progression (cultivar-driven)', () => {
    // classifyLeafStage — discrete stage derivation
    expect(classifyLeafStage(0, 0)).toBe('primordium');
    expect(classifyLeafStage(0.2, 0)).toBe('simple_leaf');
    expect(classifyLeafStage(0.5, 0)).toBe('compound_developing');
    expect(classifyLeafStage(0.95, 0)).toBe('compound_mature');
    expect(classifyLeafStage(0.95, 0.5)).toBe('senescent');
    expect(classifyLeafStage(1.0, 1.0)).toBe('removed');

    // leafletCountFromMaturity progression (cultivar-driven) — covered by
    // cultivar-growth-profile.spec.ts PROFILE-PRE-04. Here we re-verify
    // that the SSOT helper is callable with explicit cultivar max.
    expect(leafletCountFromMaturity(0.0, 0, 9)).toBeCloseTo(1, 1);
    expect(leafletCountFromMaturity(0.4, 0, 9)).toBeCloseTo(5, 1);
    expect(leafletCountFromMaturity(1.0, 0, 7)).toBeCloseTo(7, 1);
    expect(leafletCountFromMaturity(1.0, 0, 11)).toBeCloseTo(11, 1);
  });

  test('LEAF-POSTURE-01: PlantBase가 posture (curl + 9 분해 필드) 계산 — Skin은 anchor + curl만', async () => {
    // ★ Iter 34 C3 — azimuthDeg/petioleElevationDeg/droopDeg/twistDeg 제거 후 검증.
    //   curl만 남음 (mesh deformation), 9 분해 필드 (gravityDroop 등)는 별도.
    const leaf = buildLeaf({});
    expect(typeof leaf.posture.curl).toBe('number');

    // PlantBase populates posture inside computePlantState (GrowthModel.ts)
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    expect(text, 'posture LeafPostureState constructed').toMatch(/posture:\s*LeafPostureState/);
    expect(text, 'gravityDroopDeg populated (Iter 32)').toMatch(/gravityDroopDeg:/);
    expect(text, 'composePosture 호출').toMatch(/composePosture\(/);
  });

  test('LEAF-SENESCENCE-TT-01: senescenceProgress = sigmoid(ageTT - senescenceStartTT)', () => {
    // Plan §12 — TT-based senescence (day-based `age > 60` 자리에 canonical 추가)
    const initiationTT = 100;
    const lifespanTT = 1200;
    const senStartTT = computeSenescenceStartTT(initiationTT, lifespanTT, 0.7);
    expect(senStartTT).toBeCloseTo(100 + 1200 * 0.7, 1);

    // Before senescence — progress 0
    const startOffsetTT = senStartTT - initiationTT;  // = lifespanTT * 0.7
    expect(computeSenescenceProgress(0, startOffsetTT, lifespanTT * 0.3)).toBe(0);
    expect(computeSenescenceProgress(startOffsetTT * 0.5, startOffsetTT, lifespanTT * 0.3)).toBe(0);

    // Past start
    const p1 = computeSenescenceProgress(startOffsetTT * 1.2, startOffsetTT, lifespanTT * 0.3);
    expect(p1).toBeGreaterThan(0);
    expect(p1).toBeLessThanOrEqual(1);

    // Monotonic ascent
    let prev = 0;
    for (let delta = 0; delta <= 500; delta += 25) {
      const p = computeSenescenceProgress(startOffsetTT + delta, startOffsetTT, lifespanTT * 0.3);
      expect(p).toBeGreaterThanOrEqual(prev - 0.01);
      prev = p;
    }
    // Late: close to 1
    expect(computeSenescenceProgress(startOffsetTT + 800, startOffsetTT, lifespanTT * 0.3))
      .toBeGreaterThan(0.95);
  });

  test('LEAF-SENESCENCE-PLANTBASE-01: PlantBase가 colorDullness/visibleAreaFactor/curl/droopDeg 모두 계산', () => {
    // 4 fields all computed via makeSenescenceState
    const s0 = makeSenescenceState(0);
    expect(s0.colorDullness).toBe(0);
    expect(s0.visibleAreaFactor).toBe(1);
    expect(s0.curl).toBe(0);
    expect(s0.droopDeg).toBe(0);

    const sMid = makeSenescenceState(0.5);
    expect(sMid.colorDullness).toBeGreaterThan(0);
    expect(sMid.visibleAreaFactor).toBeCloseTo(1, 2);
    expect(sMid.curl).toBeGreaterThan(0);
    expect(sMid.droopDeg).toBeGreaterThan(0);

    const sFull = makeSenescenceState(1.0);
    expect(sFull.colorDullness).toBeCloseTo(1, 1);
    expect(sFull.visibleAreaFactor).toBeGreaterThanOrEqual(0.15);  // floor
    expect(sFull.visibleAreaFactor).toBeLessThanOrEqual(0.4);
    expect(sFull.curl).toBeGreaterThan(0.3);
    expect(sFull.droopDeg).toBeCloseTo(35, 1);

    // Individual helpers expose canonical formula
    expect(computeColorDullness(0.1)).toBe(0);  // below threshold
    expect(computeColorDullness(0.5)).toBeGreaterThan(0);
    expect(computeVisibleAreaFactor(0.3)).toBe(1);
    expect(computeVisibleAreaFactor(0.8)).toBeLessThan(1);
    expect(computeSenescenceCurl(0.1)).toBe(0);
    expect(computeSenescenceCurl(0.5)).toBeGreaterThan(0);
    expect(computeSenescenceDroopDeg(0.5)).toBeCloseTo(17.5, 1);
  });

  test('DAY-LEGACY-LEAF-01: leafSizeFactor/leafMaturity은 legacy alias (canonical은 leaf.*)', async () => {
    // 두 path 병행 존재
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    const nodeStateMatch = text.match(/export interface NodeState\s*\{[\s\S]*?^\}/m);
    const block = nodeStateMatch![0];
    expect(block, 'legacy leafMaturity present').toMatch(/leafMaturity:\s*number/);
    expect(block, 'legacy leafSizeFactor present').toMatch(/leafSizeFactor:\s*number/);
    expect(block, 'legacy leafAreaCm2 present').toMatch(/leafAreaCm2:\s*number/);
    expect(block, 'canonical leaf field present').toMatch(/leaf:\s*LeafOrganState/);

    // population — canonical leaf.currentAreaCm2 / expansionProgress / leafletCount
    // 모두 main-axis push site에서 채워짐
    const leafOrganHits = text.split('makeLeafOrganStateFromFlat').length - 1;
    expect(leafOrganHits, 'makeLeafOrganStateFromFlat called ≥2 (main + side)')
      .toBeGreaterThanOrEqual(2);
  });

  test('PHYTOMER-ORGAN-SHELL-01: Truss/SideShoot state shell까지만 (full biology 후속 Iter)', async () => {
    // TrussOrganState / SideShootState minimal shell shape
    const trussShell: TrussOrganState = {
      initiationTT: 100, ageTT: 50, state: 'flowering',
    };
    expect(['primordium', 'flowering', 'fruiting', 'ripening', 'harvested'])
      .toContain(trussShell.state);

    const sideShell: SideShootState = {
      initiationTT: 100, ageTT: 30, potential: 0.3,
    };
    expect(sideShell.potential).toBeGreaterThanOrEqual(0);
    expect(sideShell.potential).toBeLessThanOrEqual(1);

    // PhytomerNode optional fields declared
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'),
      'utf-8',
    );
    const nodeStateMatch = text.match(/export interface NodeState\s*\{[\s\S]*?^\}/m);
    const block = nodeStateMatch![0];
    expect(block, 'NodeState.trussOrgan optional').toMatch(/trussOrgan\?:\s*TrussOrganState/);
    expect(block, 'NodeState.sideShootOrgan optional').toMatch(/sideShootOrgan\?:\s*SideShootState/);

    // Full truss biology stays in existing `truss: TrussState | null` —
    // 그 자리에 flowers + fruits 배열 있어야 함 (precision model 후속 Iter)
    expect(block, 'truss: TrussState retained for full biology')
      .toMatch(/truss:\s*TrussState\s*\|\s*null/);
  });
});
