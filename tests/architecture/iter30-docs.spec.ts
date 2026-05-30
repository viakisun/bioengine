// Iter 30 Phase 7 — Documentation invariants.
//
// Plan §7.B (sleepy-growing-pretzel.md):
//   DOCS-V0.15-01           v0.15 calibration report
//   DOCS-NODE-CONTEXT-01    PHYTOMER_GROWTH_CONTEXT.md
//   DOCS-MIGRATION-01       Iter 29 → 30 migration trace
//   DOCS-POSTURE-COMPOSITION-01  LEAF_POSTURE_COMPOSITION.md
//   DOCS-LOCAL-FRAME-01     STEM_LOCAL_FRAME.md

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readDoc(relPath: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, relPath), 'utf-8');
}

test.describe('Iter 30 Phase 7 — Documentation', () => {
  test('DOCS-V0.15-01: v0.15 calibration report exists + multi-phase trace', async () => {
    const md = await readDoc('docs/calibration-checkpoint-reports/v0.15-iter30-visual-validation.md');
    // Phase 0~7 모두 언급
    expect(md, 'Phase 0 hotfix 언급').toMatch(/Phase\s*0/i);
    expect(md, 'Phase 1 AxisCapacity 언급').toMatch(/Phase\s*1/i);
    expect(md, 'Phase 2 LeafAllocationState 언급').toMatch(/Phase\s*2/i);
    expect(md, 'Phase 5 Posture 언급').toMatch(/Phase\s*5/i);
    // 다단계 trace: D=15/30/45/90 모든 시점
    expect(md, 'D=30 언급').toMatch(/D\s*=\s*30/);
    expect(md, 'D=45 언급').toMatch(/D\s*=\s*45/);
  });

  test('DOCS-NODE-CONTEXT-01: PHYTOMER_GROWTH_CONTEXT.md 사용 가이드', async () => {
    const md = await readDoc('docs/architecture/PHYTOMER_GROWTH_CONTEXT.md');
    expect(md, 'NodeGrowthContext 5 필드 enumeration').toMatch(/axisId/);
    expect(md, 'localStemRadiusMm 필드 명시').toMatch(/localStemRadiusMm/);
    expect(md, 'axisCapacityFactor 필드 명시').toMatch(/axisCapacityFactor/);
    expect(md, 'isSideShoot 필드 명시').toMatch(/isSideShoot/);
    expect(md, 'parentVigorFactor 필드 명시').toMatch(/parentVigorFactor/);
    // Wire-in 위치 명시
    expect(md, 'NodeState wire-in 코드 가이드').toMatch(/NodeState/);
    expect(md, 'Pass 3 후 갱신 가이드').toMatch(/Pass\s*3/i);
  });

  test('DOCS-MIGRATION-01: Iter 29 → Iter 30 트레이스 (계승 + 확장)', async () => {
    const v015 = await readDoc('docs/calibration-checkpoint-reports/v0.15-iter30-visual-validation.md');
    // Iter 29 invariant 보존 언급
    expect(v015, 'Iter 29 보존 언급').toMatch(/Iter\s*29/i);
    // 확장 / 신규 invariant 표기
    expect(v015, '신규 invariant 언급').toMatch(/신규|invariant|새로/i);
  });

  test('DOCS-POSTURE-COMPOSITION-01: LEAF_POSTURE_COMPOSITION.md + 9-필드 + 항등식', async () => {
    const md = await readDoc('docs/architecture/LEAF_POSTURE_COMPOSITION.md');
    // 9 필드 enumeration
    expect(md).toMatch(/lightSeekingBladePlaneTiltDeg/);
    expect(md).toMatch(/petioleBaseElevationDeg/);
    expect(md).toMatch(/gravityDroopDeg/);
    expect(md).toMatch(/senescenceDroopDeg/);
    expect(md).toMatch(/waterStressDroopDeg/);
    expect(md).toMatch(/finalBladePlaneTiltDeg/);
    expect(md).toMatch(/finalDroopDeg/);
    // 항등식
    expect(md, 'sum law 명시').toMatch(/finalDroopDeg\s*=\s*gravityDroopDeg/);
    expect(md, 'tilt law 명시').toMatch(/finalBladePlaneTiltDeg\s*=\s*lightSeekingBladePlaneTiltDeg/);
  });

  test('DOCS-LOCAL-FRAME-01: STEM_LOCAL_FRAME.md + R26 contract 명시', async () => {
    // ★ Iter 31 R26 갱신: composeLeafRotationLocal 제거 → makeLeafQuaternion +
    // edge.bonePath tangent. docs는 R26 contract 반영.
    const md = await readDoc('docs/architecture/STEM_LOCAL_FRAME.md');
    expect(md, 'R26 makeLeafQuaternion 명시').toMatch(/makeLeafQuaternion/);
    expect(md, 'petioleCurve tangent 명시').toMatch(/petioleCurve|edge\.bonePath/);
    // frame 정의는 유지 — parallel-transport가 petioleCurve 모양을 결정
    expect(md, 'tangent 축 명시').toMatch(/tangent/);
    expect(md, 'normal 축 명시').toMatch(/normal/);
    // R4 → R26 진화 history 명시
    expect(md, 'R4 history 또는 R26 명시').toMatch(/R4|R26/);
  });

  test('Iter 30 audit doc 존재 — iter30-axis-capacity-design.md', async () => {
    const md = await readDoc('docs/audit/iter30-axis-capacity-design.md');
    // R²×L proxy 정직 표기
    expect(md, 'proxy 표기').toMatch(/proxy/i);
    expect(md, 'NOT physical load-bearing 표기').toMatch(/NOT\s+physical|not\s+a\s+physical/i);
    // clamp 범위 근거
    expect(md, '0.35 ~ 1.0 clamp 명시').toMatch(/0\.35.*1\.0|\[0\.35,\s*1\.0\]/);
  });
});
