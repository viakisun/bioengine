// ★ L9-A v3 S79 — Leaf mesh _모양 산식_ SSOT 검증.
//
// Active 원칙 #54 — leaf mesh _모양 산식_ = LeafMeshBuilder.ts 한 파일,
// _값_ = tomato.json 한 파일. 외부 호출 0인 sub-module은 inline 의무.
//
// L9-A S79에서 LeafletPlaneChunk.ts (162줄) 삭제 + LeafMeshBuilder.ts 안 inline.
// 본 spec은 _drift 방지_: 미래에 LeafletPlaneChunk.ts 같은 sub-module이
// 외부 호출 0인 채로 _부활_하면 즉시 catch.

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

test.describe('L9-A S79 — Leaf mesh 산식 SSOT (단일 파일)', () => {
  test('LEAF-SSOT-SINGLE-FILE-01: LeafletPlaneChunk.ts 부재 + LeafMeshBuilder 자체 정의', async () => {
    // 1. LeafletPlaneChunk.ts 파일 자체 부재
    const chunkPath = path.join(
      REPO_ROOT,
      'src/scene/leaf/LeafletPlaneChunk.ts',
    );
    expect(
      await fileExists(chunkPath),
      'LeafletPlaneChunk.ts 삭제됨 (L9-A S79 inline)',
    ).toBe(false);

    // 2. LeafMeshBuilder.ts가 buildLeafletPlaneChunk 자체 정의
    const builderSrc = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafMeshBuilder.ts'),
      'utf-8',
    );

    expect(
      builderSrc,
      'LeafMeshBuilder가 buildLeafletPlaneChunk 자체 정의 (function 선언)',
    ).toMatch(/function\s+buildLeafletPlaneChunk\s*\(/);

    expect(
      builderSrc,
      'LeafletPlaneOptions interface도 inline',
    ).toMatch(/interface\s+LeafletPlaneOptions/);

    // 3. LeafletPlaneChunk import 제거 확인
    expect(
      builderSrc,
      'LeafletPlaneChunk import 제거',
    ).not.toMatch(/from\s+['"]\.\/LeafletPlaneChunk['"]/);

    // 4. newChunk import 추가 확인 (inline 후 직접 사용)
    expect(
      builderSrc,
      'newChunk import (inline buildLeafletPlaneChunk가 직접 호출)',
    ).toMatch(/import\s*\{[^}]*\bnewChunk\b[^}]*\}\s*from\s+['"]@farmsim\/tomato-geometry['"]/);
  });

  test('LEAF-SSOT-NO-EXTERNAL-LEAFLETPLANECHUNK-IMPORT-01: 다른 파일에서 LeafletPlaneChunk import 0', async () => {
    // 미래 sub-module 부활 + 외부 호출 0 패턴 방지.
    // src/ + tests/ 전체에서 LeafletPlaneChunk 문자열 검색.
    // _현재 코드_에서 사용 시 (LeafMeshBuilder 안 inline 함수 호출은 본 spec 외).

    const srcDir = path.join(REPO_ROOT, 'src');
    const testsDir = path.join(REPO_ROOT, 'tests');

    async function* walk(dir: string): AsyncGenerator<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && e.name !== 'node_modules') {
            yield* walk(full);
          }
        } else if (
          e.isFile() &&
          (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))
        ) {
          yield full;
        }
      }
    }

    const hits: string[] = [];
    for (const dir of [srcDir, testsDir]) {
      for await (const file of walk(dir)) {
        // 본 spec 자체는 검증 대상 X (skip)
        if (file.endsWith('leaf-ssot-single-file.spec.ts')) continue;
        const text = await fs.readFile(file, 'utf-8');
        if (
          /from\s+['"][^'"]*LeafletPlaneChunk['"]/.test(text) ||
          /import\s+['"][^'"]*LeafletPlaneChunk['"]/.test(text)
        ) {
          hits.push(path.relative(REPO_ROOT, file));
        }
      }
    }

    expect(
      hits,
      `LeafletPlaneChunk를 import하는 파일이 있으면 안 됨 (S79 inline 후). 발견: ${hits.join(', ')}`,
    ).toEqual([]);
  });
});
