// ★ Iter 39 Phase L9-D V2 (S85) — V1+V2 builder _공존 phase 추적_ invariant.
//
// Active 원칙 #56 (smooth-prancing-starfish.md v5):
//   단일 organ SSOT _phase 명시 공존_ 예외 — V1+V2 공존은 _임시_, 영구 dual 상태
//   금지. V2 승격 6 조건 충족 후 L10-A archive plan으로 V1 → `_archive/`.
//
// 본 spec은 phase 동안 _공존 의도_를 추적하고, archive 시점에 _필수 변경_을
// catch (V1 _archive/ 이동 시 본 spec도 갱신).

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

test.describe('L9-D V2 — Builder coexistence phase (Active 원칙 #56)', () => {
  test('LEAF-BUILDER-V2-COEXISTENCE-01: V1 + V2 두 파일 동시 존재', async () => {
    // V1 (production default)
    const v1Path = path.join(REPO_ROOT, 'src/scene/leaf/LeafMeshBuilder.ts');
    expect(
      await fileExists(v1Path),
      'LeafMeshBuilder.ts (V1) 존재 — production default',
    ).toBe(true);

    // V2 (side-by-side, opt-in)
    const v2Path = path.join(REPO_ROOT, 'src/scene/leaf/LeafMeshBuilder2.ts');
    expect(
      await fileExists(v2Path),
      'LeafMeshBuilder2.ts (V2) 존재 — opt-in via ?leafBuilder=v2',
    ).toBe(true);
  });

  test('LEAF-BUILDER-V2-ENTRY-01: V2가 buildLeafMeshFromSkeletonV2 export', async () => {
    const v2Src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafMeshBuilder2.ts'),
      'utf-8',
    );
    expect(
      v2Src,
      'V2 entry function 명시 export (V1 entry name 충돌 회피)',
    ).toMatch(/export\s+function\s+buildLeafMeshFromSkeletonV2\s*\(/);

    // V1 entry name과 _다른_ 이름 (leaf-mesh-single-entry.spec.ts 충돌 회피)
    expect(
      v2Src,
      'V2는 buildLeafMeshFromSkeleton(V1 이름) 자체 정의 X — 위임만',
    ).not.toMatch(/^\s*export\s+function\s+buildLeafMeshFromSkeleton\s*\(/m);
  });

  test('LEAF-BUILDER-V2-V1-PRESERVED-01: V1 entry function 보존 (V2 도입 후에도)', async () => {
    // V2 도입이 V1을 깨면 안 됨. V1 canonical entry 그대로.
    const v1Src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafMeshBuilder.ts'),
      'utf-8',
    );
    expect(
      v1Src,
      'V1 buildLeafMeshFromSkeleton export 보존',
    ).toMatch(/export\s+function\s+buildLeafMeshFromSkeleton\s*\(/);
  });

  test('LEAF-BUILDER-V2-PHASE-DOC-01: V2 파일에 phase 정책 명시 (영구 dual 금지)', async () => {
    // Active 원칙 #56 — 공존 시한 명시.
    const v2Src = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafMeshBuilder2.ts'),
      'utf-8',
    );
    expect(
      v2Src,
      'V2 파일에 archive plan 의무 명시 (영구 dual 방지)',
    ).toMatch(/archive|L10-A/i);

    expect(
      v2Src,
      'V2 파일에 V1 단순 위임 phase 명시 (S85)',
    ).toMatch(/S85|위임|delegat/i);
  });

  test('LEAF-BUILDER-V2-DISPATCH-01: LeafEngine.createLeaf builderVersion field + dispatch', async () => {
    // S86 — CreateLeafOptions에 builderVersion 추가 + dispatch.
    const engineSrc = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafEngine.ts'),
      'utf-8',
    );

    // CreateLeafOptions에 builderVersion field
    expect(
      engineSrc,
      "CreateLeafOptions.builderVersion?: 'v1' | 'v2' field",
    ).toMatch(/builderVersion\?\:\s*['"]v1['"]\s*\|\s*['"]v2['"]/);

    // V2 import (multiline 허용)
    expect(
      engineSrc,
      'LeafMeshBuilder2 import (buildLeafMeshFromSkeletonV2)',
    ).toMatch(/import[^;]*buildLeafMeshFromSkeletonV2[^;]*from\s+['"]\.\/LeafMeshBuilder2['"]/s);

    // createLeaf 안 dispatch 산식
    expect(
      engineSrc,
      'dispatch: options.builderVersion === \'v2\' 분기',
    ).toMatch(/options\.builderVersion\s*===\s*['"]v2['"]/);
  });

  test('LEAF-BUILDER-V2-DEFAULT-V1-01: builderVersion 미지정 시 V1 default (production 안정성)', async () => {
    // S86 보완 #11 — default 'v2' 강제 방지. CreateLeafOptions field가
    // _optional_이고 dispatch가 ===  'v2' 명시 비교일 때만 V2.
    const engineSrc = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafEngine.ts'),
      'utf-8',
    );

    // optional ? (default undefined → V1)
    expect(
      engineSrc,
      'builderVersion은 optional (default undefined → V1)',
    ).toMatch(/builderVersion\?\:/);

    // 명시 'v2' 비교 (default 분기 X)
    expect(
      engineSrc,
      'dispatch 산식이 명시 ===  \'v2\' (default v2 강제 X)',
    ).toMatch(/options\.builderVersion\s*===\s*['"]v2['"][^:]*\?[^:]*V2/);
  });
});
