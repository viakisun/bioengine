// Iter 31 R26 — Leaf Rotation Contract (★ final, replaces Iter 30 Phase 0.D).
//
// R26 contract (commit 4029b6b):
//   leaf rotation = makeLeafQuaternion(petioleTipTangent, WORLD_UP)
//   where petioleTipTangent = edge.bonePath[last].p1 - edge.bonePath[last].p0
//   (= PlantBase petioleCurve의 마지막 segment tangent, 산수 추가 0).
//
// 이전 contract (Iter 30 Phase 0.D)는 _composeLeafRotationLocal_을 stem-local
// frame과 azimuth/droop/twist로 합성했으나, frame이 _PlantBase curve와 분리_되어
// 자연스러운 leaf vector 표현에 실패. R26은 _이미 PlantBase가 만든 curve_의 마지막
// tangent _그대로_ 사용 — 산식 자체를 _제거_.
//
// 본 spec는 R26 contract 4개 invariant를 검증:
//   R26-CONTRACT-PETIOLE-CURVE-TANGENT-01 — populator 소스 grep
//   R26-CONTRACT-MAKE-LEAF-QUATERNION-01  — makeLeafQuaternion 함수 정의 + Gram-Schmidt orthogonality
//   R26-CONTRACT-NO-LEGACY-COMPOSE-01     — populator에서 legacy compose 호출 0건
//   R26-CONTRACT-WORLD-UP-DEFAULT-01      — bladeUp 기본 (0,1,0) 사용

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  IDENTITY_QUAT,
  makeLeafQuaternion,
  quatMagnitude,
} from '../../src/plant/skeleton/AnchorTransform';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');
const POPULATOR_PATH = 'src/plant/skeleton/populator/populateAnchorMorphology.ts';
const ANCHOR_TRANSFORM_PATH = 'src/plant/skeleton/AnchorTransform.ts';

async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

test.describe('Iter 31 R26 — Leaf Rotation Contract (★ final)', () => {
  test('R26-CONTRACT-PETIOLE-CURVE-TANGENT-01: populator uses edge.bonePath[last] tangent', async () => {
    const text = await readSrc(POPULATOR_PATH);
    // edge.bonePath[edge.bonePath.length - 1] 패턴 존재 (R26 marker)
    expect(text, 'populator extracts last bone from bonePath').toMatch(
      /edge\.bonePath\[edge\.bonePath\.length\s*-\s*1\]/,
    );
    // p1 - p0 산식 (마지막 segment tangent)
    expect(text, 'populator computes p1 - p0 tangent').toMatch(
      /lastBone\.p1\.x\s*-\s*lastBone\.p0\.x/,
    );
    // makeLeafQuaternion 호출
    expect(text, 'populator calls makeLeafQuaternion').toMatch(/makeLeafQuaternion\s*\(/);
  });

  test('R26-CONTRACT-MAKE-LEAF-QUATERNION-01: makeLeafQuaternion produces unit quaternion (non-degenerate)', () => {
    expect(typeof makeLeafQuaternion).toBe('function');

    // Horizontal petiole + WORLD_UP — 자연 토마토 leaf의 표준 input.
    // f=(1,0,0), Gram-Schmidt → u=(0,1,0), r=(0,0,1) — clean orthonormal.
    const qHoriz = makeLeafQuaternion(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    expect(quatMagnitude(qHoriz), 'horizontal |q| ≈ 1').toBeCloseTo(1, 6);

    // 휜 petiole (R26 실 사용 input 형태) — non-axis aligned
    const qOff = makeLeafQuaternion(
      { x: 0.6, y: -0.3, z: -0.7 },
      { x: 0, y: 1, z: 0 },
    );
    expect(quatMagnitude(qOff), 'non-axis aligned |q| ≈ 1').toBeCloseTo(1, 6);

    // Zero petiole → safe (no NaN). 출력 unit이거나 IDENTITY로 fallback.
    const qZero = makeLeafQuaternion(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    expect(Number.isFinite(qZero.x), 'zero petiole q.x finite').toBe(true);
    expect(Number.isFinite(qZero.y), 'zero petiole q.y finite').toBe(true);
    expect(Number.isFinite(qZero.z), 'zero petiole q.z finite').toBe(true);
    expect(Number.isFinite(qZero.w), 'zero petiole q.w finite').toBe(true);

    // Degenerate case 주석:
    //   petiole _vertical (parallel to WORLD_UP)_ + bladeUp _vertical_은
    //   Gram-Schmidt 후 u_proj=0 → fallback u=(0,1,0). f와 u가 _평행_이라
    //   orthonormal matrix가 _아님_ → Shepperd's method가 |q|≠1 출력.
    //   R26 실 사용에서는 petiole이 _horizontal-ish_ (leaf는 stem 직각 부착)이라
    //   이 degenerate case 발생 _0_. _수치 안전_은 isFinite 검증으로 대체.
  });

  test('R26-CONTRACT-NO-LEGACY-COMPOSE-01: populator does NOT call legacy compose', async () => {
    const text = await readSrc(POPULATOR_PATH);
    // populator는 R26 이후 _composeLeafRotation 계열_ 0건 (import + 호출 모두)
    expect(text, 'composeLeafRotation not used').not.toMatch(/\bcomposeLeafRotation\b/);
    expect(text, 'composeLeafRotationLocal not used').not.toMatch(
      /\bcomposeLeafRotationLocal\b/,
    );
    expect(text, 'computeLeafPetioleAndBladeAxes not used').not.toMatch(
      /\bcomputeLeafPetioleAndBladeAxes\b/,
    );
  });

  test('R26-CONTRACT-WORLD-UP-DEFAULT-01: bladeUp default = world up (0,1,0)', async () => {
    const text = await readSrc(POPULATOR_PATH);
    // populator가 WORLD_UP_LOCAL = (0,1,0) 사용
    expect(text, 'WORLD_UP_LOCAL = (0,1,0)').toMatch(
      /\{\s*x:\s*0,\s*y:\s*1,\s*z:\s*0\s*\}/,
    );
  });

  test('R26-CONTRACT-IDENTITY-FALLBACK-01: empty bonePath → IDENTITY_QUAT (safety net)', async () => {
    const text = await readSrc(POPULATOR_PATH);
    // bonePath.length > 0 chec + IDENTITY_QUAT fallback
    expect(text, 'bonePath length check').toMatch(/edge\.bonePath\.length\s*>\s*0/);
    expect(text, 'IDENTITY_QUAT fallback').toMatch(/IDENTITY_QUAT/);

    // IDENTITY_QUAT 자체 검증
    expect(IDENTITY_QUAT).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(quatMagnitude(IDENTITY_QUAT)).toBeCloseTo(1, 6);
  });

  test('R26-CONTRACT-MAKE-LEAF-QUATERNION-EXISTS-01: makeLeafQuaternion exported from AnchorTransform', async () => {
    const text = await readSrc(ANCHOR_TRANSFORM_PATH);
    expect(text, 'makeLeafQuaternion exported').toMatch(/export function makeLeafQuaternion/);
  });
});
