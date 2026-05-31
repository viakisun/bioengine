// Iter 36 v5 Phase H — Skeleton 3-tier architecture invariants.
//
// 사용자 architectural model "skeleton → node 정보 → rendering 알고리즘" 보호:
//   - leaflet-node 존재 + 4 position types (terminal/primary/secondary/intercalary)
//   - bud-node 존재 + activatedAxisId link 정합
//   - LeafBladeRef + LeafletNodeRef + BudNodeRef interface 정합
//   - getLeafletNodesByParentLeaf helper 정확 동작

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 36 v5 — Skeleton 3-tier architecture', () => {
  test('SKEL-3TIER-NODE-TYPES-01: SkeletonNodeType union에 leaflet-node + bud-node 존재', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts'),
      'utf-8',
    );
    expect(src, 'leaflet-node type 정의 의무').toContain("'leaflet-node'");
    expect(src, 'bud-node type 정의 의무').toContain("'bud-node'");
    // 4 leaflet position types union
    expect(src, "LeafletPosition 'terminal'").toContain("'terminal'");
    expect(src, "LeafletPosition 'primary'").toContain("'primary'");
    expect(src, "LeafletPosition 'secondary'").toContain("'secondary'");
    expect(src, "LeafletPosition 'intercalary'").toContain("'intercalary'");
  });

  test('SKEL-3TIER-INTERFACES-01: LeafletNodeRef + LeafBladeRef + BudNodeRef interface 정합', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts'),
      'utf-8',
    );
    expect(src, 'LeafletNodeRef interface 의무').toContain('interface LeafletNodeRef');
    expect(src, 'LeafBladeRef interface 의무').toContain('interface LeafBladeRef');
    expect(src, 'BudNodeRef interface 의무').toContain('interface BudNodeRef');

    // SkeletonNode에 3 optional refs
    expect(src, 'SkeletonNode.leafletRef 의무').toContain('leafletRef?: LeafletNodeRef');
    expect(src, 'SkeletonNode.leafBladeRef 의무').toContain('leafBladeRef?: LeafBladeRef');
    expect(src, 'SkeletonNode.budRef 의무').toContain('budRef?: BudNodeRef');

    // LeafBladeRef 필수 fields
    const bladeFields = [
      'leafLengthM', 'petioleRatioM', 'rachisLengthM',
      'primaryPairs', 'intercalaryCount', 'secondaryCount',
      'agePreset', 'complexity', 'droopDeg', 'twistDeg',
    ];
    for (const f of bladeFields) {
      expect(src, `LeafBladeRef.${f} 의무`).toMatch(new RegExp(`\\b${f}\\b`));
    }
  });

  test('SKEL-3TIER-POPULATOR-CREATES-LEAFLET-01: buildTomatoSkeletonGraph가 leaflet-node 생성', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/buildTomatoSkeletonGraph.ts'),
      'utf-8',
    );
    expect(src, 'addLeafletNodesForLeaf 함수 의무').toContain('addLeafletNodesForLeaf');
    expect(src, 'computeLeafBladeRef 함수 의무').toContain('computeLeafBladeRef');
    expect(src, 'addBudsForAxis 함수 의무').toContain('addBudsForAxis');
    // node ID format (template literal — backtick + n:leaflet:)
    expect(src, "leaflet-node ID 'n:leaflet:' template literal").toMatch(/[`]n:leaflet:/);
    expect(src, "bud-node ID 'n:bud:' template literal").toMatch(/[`]n:bud:/);
  });

  test('SKEL-3TIER-HELPER-01: getLeafletNodesByParentLeaf helper export', async () => {
    const src = await fs.readFile(
      path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts'),
      'utf-8',
    );
    expect(src, 'getLeafletNodesByParentLeaf export 의무')
      .toContain('export function getLeafletNodesByParentLeaf');
  });
});
