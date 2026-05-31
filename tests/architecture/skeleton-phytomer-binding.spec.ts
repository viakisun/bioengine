// Iter 29 Phase 3 — Skeleton phytomer binding + OrganAnchor purity invariants.
//
// Plan §3, §13.2 (sleepy-growing-pretzel.md).
//
// Phase 3 핵심: SkeletonNode가 PhytomerNode를 _직접 참조_. OrganAnchor는
// _공간 변환 정보만_ — position + rotation + identifier + chain + debugHint.
// morphology/state/growth field는 _금지_.
//
// Acceptance:
//   SKELETON-PHYTOMER-01: SkeletonNode.phytomer 직접 참조 (PhytomerNode 타입)
//   SKELETON-ANCHOR-PURE-01: morphology/state/growth field 0건
//   SKELETON-ANCHOR-TRANSFORM-01: anchor.rotation은 Quat4 (단위 길이 ~ 1)
//   SKELETON-ANCHOR-POSTURE-01: posture는 PlantBase 계산값을 Skeleton _복사_
//   SKELETON-NO-GROWTH-CALC-01: Skeleton에서 leaf area/leafletCount/senescence/
//                               expansionProgress/posture 새로 계산 0건
//                               (호출 금지 함수: leafletCountFromMaturity,
//                                computeLeafExpansion, computeSenescence)
//   SKIN-NO-LEAFBASE-01: Skin path canonical에서 LeafBase.azimuthRad/droopRad
//                        직접 참조 0건 (fallback path 허용 — Phase 4 제거)

import { test, expect, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  // ★ Iter 34 C4 — composeLeafRotation + quatY/X/Z/Mul/quatMagnitude 제거.
  //   SKELETON-ANCHOR-TRANSFORM-01 → R26 contract spec 4 신규로 _대체_.
  IDENTITY_QUAT,
  makeLeafQuaternion,
} from '../../src/plant/skeleton/AnchorTransform';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function enterSkin(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } } };
    w.__twinStore?.getState().setMode('single-plant');
    w.__twinStore?.getState().setUseImplicitMesh(false);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } } };
    w.__twinStore?.getState().setUseImplicitMesh(true);
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } } };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

test.describe('Skeleton Phytomer Binding + Anchor Purity (Iter 29 Phase 3)', () => {
  test('SKELETON-PHYTOMER-01: SkeletonNode.phytomer 직접 참조 (interface + runtime)', async ({ page }) => {
    test.setTimeout(120_000);
    // Interface declared
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts'),
      'utf-8',
    );
    expect(text, 'SkeletonNode.phytomer field declared')
      .toMatch(/phytomer\?:\s*PhytomerNodeRef/);
    expect(text, 'PhytomerNodeRef type defined').toMatch(/export type PhytomerNodeRef/);

    // Runtime: at least some SkeletonNode instances carry phytomer
    await enterSkin(page, 45);
    const report = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          nodes: Map<string, { id: string; phytomer?: { leaf?: { nodeIndex: number } } }>;
        };
      };
      const g = w.__skinplantGraph;
      if (!g) return null;
      let withPhytomer = 0;
      let total = 0;
      for (const node of g.nodes.values()) {
        total++;
        if (node.phytomer?.leaf) withPhytomer++;
      }
      return { withPhytomer, total };
    });
    expect(report).not.toBeNull();
    expect(report!.withPhytomer, 'phytomer-bound nodes > 0').toBeGreaterThan(0);
  });

  test('SKELETON-ANCHOR-PURE-01: OrganAnchor에 morphology/state/growth field 0건', async ({ page }) => {
    test.setTimeout(120_000);
    // Interface check — schema source must NOT declare morphology/state on OrganAnchor.
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts'),
      'utf-8',
    );
    // Find OrganAnchor block (only)
    const anchorMatch = text.match(/export interface OrganAnchor\s*\{[\s\S]*?\n\}/);
    expect(anchorMatch, 'OrganAnchor interface block').toBeTruthy();
    const anchorBlock = anchorMatch![0];
    // Plan §3 strict: no `morphology?:` or `state?:` fields on OrganAnchor.
    expect(anchorBlock, 'no anchor.morphology field').not.toMatch(/\n\s+morphology\?:/);
    expect(anchorBlock, 'no anchor.state field').not.toMatch(/\n\s+state\?:/);
    // Allowed fields only
    expect(anchorBlock, 'position present').toMatch(/position\?:\s*V3/);
    expect(anchorBlock, 'rotation present').toMatch(/rotation\?:\s*Quat4/);
    expect(anchorBlock, 'debugHint present').toMatch(/debugHint\?:\s*AnchorDebugHint/);

    // Runtime: live anchors do not have morphology/state populated
    await enterSkin(page, 45);
    const issues = await page.evaluate(() => {
      const w = window as unknown as {
        __skinplantGraph?: {
          edges: Map<string, {
            organAnchors?: Array<{
              id: string; kind: string;
              morphology?: unknown; state?: unknown;
              position?: { x: number; y: number; z: number };
              rotation?: { x: number; y: number; z: number; w: number };
            }>;
          }>;
        };
      };
      const out: { id: string; field: string }[] = [];
      const g = w.__skinplantGraph;
      if (!g) return out;
      for (const edge of g.edges.values()) {
        if (!edge.organAnchors) continue;
        for (const a of edge.organAnchors) {
          if (a.morphology !== undefined) out.push({ id: a.id, field: 'morphology' });
          if (a.state !== undefined) out.push({ id: a.id, field: 'state' });
        }
      }
      return out;
    });
    expect(issues, 'no anchor has morphology or state populated').toEqual([]);
  });

  test('SKELETON-ANCHOR-TRANSFORM-01: rotation은 Quat4 + makeLeafQuaternion (R26 contract)', () => {
    // ★ Iter 34 C4 — composeLeafRotation + quatY/X/Z/Mul 제거.
    //   기존 _3-axis composition 검증_ → R26 _petioleCurve tangent 검증_으로 대체.
    function quatMag(q: { x: number; y: number; z: number; w: number }): number {
      return Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    }

    // IDENTITY_QUAT 검증 (populator fallback 사용)
    expect(IDENTITY_QUAT).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(quatMag(IDENTITY_QUAT)).toBeCloseTo(1, 6);

    // makeLeafQuaternion (R26 contract entry) unit quaternion 검증
    const qHoriz = makeLeafQuaternion({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(quatMag(qHoriz)).toBeCloseTo(1, 6);
    const qOff = makeLeafQuaternion({ x: 0.6, y: -0.3, z: -0.7 }, { x: 0, y: 1, z: 0 });
    expect(quatMag(qOff)).toBeCloseTo(1, 6);

    // 다른 petiole tangent → 다른 quaternion (R26 contract: rotation은 tangent로부터)
    expect(qHoriz).not.toEqual(qOff);
  });

  test('SKELETON-ANCHOR-POSTURE-01: leaf rotation = PlantBase 계산값 (populator는 재계산 안 함)', async () => {
    // ★ Iter 31 R26 갱신 (commit 4029b6b):
    //   posture (azimuth/droop/twist) → _PlantBase petioleCurve_의 마지막 tangent.
    //   populator는 edge.bonePath[last] tangent를 makeLeafQuaternion에 전달 — 산수 추가 0.
    //
    //   PlantBase _계산값_을 _복사_하는 contract는 _보존_ (재계산 금지).
    //   다만 _계산값의 형태_가 posture 4-tuple → curve tangent vector로 변경.
    const text = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/populator/populateAnchorMorphology.ts'),
      'utf-8',
    );
    // R26 contract: populator가 edge.bonePath의 마지막 segment tangent + makeLeafQuaternion 사용
    expect(text, 'populator uses edge.bonePath[last] tangent (R26)').toMatch(
      /edge\.bonePath\[edge\.bonePath\.length\s*-\s*1\]/,
    );
    expect(text, 'populator uses makeLeafQuaternion (R26)').toMatch(/makeLeafQuaternion/);
    // populator는 _no_ composeLeafRotation/composeLeafRotationLocal 호출 (R26 갱신)
    expect(text, 'populator does NOT import composeLeafRotation (R26)').not.toMatch(
      /\bcomposeLeafRotation\b/,
    );
    expect(text, 'populator does NOT import composeLeafRotationLocal (R26)').not.toMatch(
      /\bcomposeLeafRotationLocal\b/,
    );
  });

  test('SKELETON-NO-GROWTH-CALC-01: 호출 금지 함수 (leafletCountFromMaturity / computeLeafExpansion / computeSenescence)', async () => {
    // Skeleton layer files must NOT import or call growth model functions.
    const populatorSrc = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/populator/populateAnchorMorphology.ts'),
      'utf-8',
    );
    const FORBIDDEN = [
      'leafletCountFromMaturity',
      'computeLeafExpansion',
      'computeLeafExpansionProgress',
      'computeSenescence',
      'computeSenescenceProgress',
      'makeSenescenceState',
    ];
    for (const fn of FORBIDDEN) {
      expect(populatorSrc, `populator must NOT call ${fn}`)
        .not.toMatch(new RegExp(`\\b${fn}\\b`));
    }
    // PlantSkeletonGraph must not import from growth/ either
    const graphSrc = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts'),
      'utf-8',
    );
    for (const fn of FORBIDDEN) {
      expect(graphSrc, `PlantSkeletonGraph must NOT reference ${fn}`)
        .not.toMatch(new RegExp(`\\b${fn}\\b`));
    }
  });

  test('SKIN-NO-LEAFBASE-01: Skin canonical path에서 LeafBase.azimuth/droop 직접 참조 0건 (fallback 허용)', async () => {
    // Phase 3: Skin SHOULD use anchor.rotation when available.
    // Fallback path (legacy callers) may still read LeafBase — Phase 4
    // tightens to strict 0.
    const skinSrc = await fs.readFile(
      path.join(REPO_ROOT, 'src/twin/SkinMeshPlant.ts'),
      'utf-8',
    );
    // Verify anchor.rotation usage exists (canonical Phase 3 path)
    expect(skinSrc, 'SkinMeshPlant uses anchor.rotation when available')
      .toMatch(/anchor\.rotation/);
    // Verify fallback gated behind `if (anchor.rotation)` check (NOT direct read)
    const azimuthHits = (skinSrc.match(/leafBase\.azimuthRad/g) ?? []).length;
    const droopHits = (skinSrc.match(/leafBase\.droopRad/g) ?? []).length;
    // Phase 3 still has 1 fallback path each (inside else branch).
    // Phase 4 SKIN-DATA-DRIVEN-03 will reduce these to 0.
    expect(azimuthHits, `leafBase.azimuthRad fallback occurrences (Phase 3 ≤ 1)`)
      .toBeLessThanOrEqual(1);
    expect(droopHits, `leafBase.droopRad fallback occurrences (Phase 3 ≤ 1)`)
      .toBeLessThanOrEqual(1);
  });
});
