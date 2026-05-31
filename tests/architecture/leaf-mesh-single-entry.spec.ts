// Iter 34 C6 — Leaf mesh build _진입점 단일_ 보장.
//
// 사용자 요청: "휴먼/AI 코드 진입점 헷갈리는 모든 요소 정리"
//
// 본 spec은 leaf mesh rendering의 _canonical entry_가 단일임을 grep으로 강제:
//   1. buildLeafMeshFromPhytomer가 leaf mesh build _유일_ 호출 entry (SkinMeshPlant.ts)
//   2. createLeafBladeOnlyMesh (dead fallback) 정의 0 (Iter 34 C1 제거)
//   3. buildLeafBladeOnly export 0 (Iter 34 C1 internal로)
//   4. composeLeafRotation + quat helpers 정의 0 (Iter 34 C4 제거)
//   5. legacy buildLeafChunk (boundary) 0 — buildLeafChunkLegacy/Skin만 (Iter 34 C2)
//   6. LeafPostureState 4 deprecated 필드 정의 0 (Iter 34 C3 제거)

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '_archive') continue;
      await walk(full, acc);
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) {
      acc.push(full);
    }
  }
  return acc;
}

test.describe('Iter 34 C6 — Leaf mesh build 진입점 단일 보장', () => {
  test('LEAF-MESH-SINGLE-ENTRY-01: buildLeafMeshFromPhytomer가 leaf mesh build _유일_ entry', async () => {
    // src/ 전체에서 buildLeafMeshFromPhytomer _호출_ site (정의 제외)
    const srcDir = path.join(REPO_ROOT, 'src');
    const files = await walk(srcDir);
    const callRe = /buildLeafMeshFromPhytomer\s*\(/;
    const defRe = /export function buildLeafMeshFromPhytomer/;
    const callSites: string[] = [];
    for (const abs of files) {
      const rel = path.relative(REPO_ROOT, abs);
      const text = await fs.readFile(abs, 'utf-8');
      // 정의 파일이면 _호출만_ 추가 — 함수 정의 line 제외
      if (callRe.test(text)) {
        // LeafGenerator.ts는 _정의 파일_ → callsite로 안 침
        if (defRe.test(text)) continue;
        callSites.push(rel);
      }
    }
    // ★ 호출 site는 SkinMeshPlant.ts _1건_만 (canonical)
    expect(callSites).toEqual(['src/scene/SkinMeshPlant.ts']);
  });

  test('LEAF-MESH-DEAD-FALLBACK-REMOVED-01: createLeafBladeOnlyMesh 정의 0 (Iter 34 C1)', async () => {
    const text = await readSrc('src/plant/LeafGenerator.ts');
    expect(text, 'createLeafBladeOnlyMesh function 정의 0').not.toMatch(
      /export function createLeafBladeOnlyMesh/,
    );
  });

  test('LEAF-MESH-BLADE-ONLY-INTERNAL-01: buildLeafBladeOnly export 0 (Iter 34 C1)', async () => {
    const idxText = await readSrc('packages/tomato-geometry/src/index.ts');
    expect(idxText, 'buildLeafBladeOnly export 0').not.toMatch(/buildLeafBladeOnly/);
    // 함수 자체는 internal로 보존 (buildLeafChunkSkin이 wrap)
    const chunkText = await readSrc('packages/tomato-geometry/src/leafChunk.ts');
    expect(chunkText, 'buildLeafBladeOnly internal 정의 존재').toMatch(
      /^function buildLeafBladeOnly/m,
    );
  });

  test('LEAF-MESH-LEGACY-RENAMED-01: buildLeafChunk (boundary) 0 — Legacy/Skin만 (Iter 34 C2)', async () => {
    // src/ + packages/ 전체에서 `buildLeafChunk` (boundary, suffix 없음) 호출 0
    const dirs = [path.join(REPO_ROOT, 'src'), path.join(REPO_ROOT, 'packages')];
    const files: string[] = [];
    for (const d of dirs) {
      try { await fs.access(d); await walk(d, files); } catch { /* skip */ }
    }
    // word boundary: \bbuildLeafChunk\b (suffix 없음)
    const re = /\bbuildLeafChunk\b(?!Legacy|Skin)/;
    const violations: string[] = [];
    for (const abs of files) {
      const rel = path.relative(REPO_ROOT, abs);
      // 주석/문자열 어떤 raw text든 호출 의도면 violation
      const text = await fs.readFile(abs, 'utf-8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (re.test(line)) violations.push(`${rel}:${i + 1}  ${line.trim().slice(0, 80)}`);
      }
    }
    expect(violations, `buildLeafChunk (boundary) 0건 — Legacy/Skin suffix 사용`).toEqual([]);
  });

  test('LEAF-MESH-COMPOSE-ROTATION-REMOVED-01: composeLeafRotation + 5 quat helpers 0 (Iter 34 C4)', async () => {
    const text = await readSrc('src/plant/skeleton/AnchorTransform.ts');
    for (const fn of ['composeLeafRotation', 'quatY', 'quatX', 'quatZ', 'quatMul', 'quatMagnitude']) {
      expect(text, `${fn} 정의 0`).not.toMatch(new RegExp(`^export function ${fn}\\b`, 'm'));
    }
    // 유지: IDENTITY_QUAT, makeLeafQuaternion, cross3
    expect(text, 'IDENTITY_QUAT 유지').toMatch(/export const IDENTITY_QUAT/);
    expect(text, 'makeLeafQuaternion 유지').toMatch(/export function makeLeafQuaternion/);
  });

  test('LEAF-MESH-POSTURE-DEPRECATED-REMOVED-01: LeafPostureState 4 deprecated 필드 0 (Iter 34 C3)', async () => {
    const text = await readSrc('packages/tomato-engine/src/growth/LeafGrowthModel.ts');
    // interface LeafPostureState 본문에서 4 필드 정의 0
    const ifaceMatch = text.match(/export interface LeafPostureState\s*\{([\s\S]*?)\n\}/);
    expect(ifaceMatch, 'LeafPostureState interface 존재').not.toBeNull();
    const body = ifaceMatch![1];
    expect(body, 'azimuthDeg 정의 0').not.toMatch(/^\s+azimuthDeg:/m);
    expect(body, 'petioleElevationDeg 정의 0').not.toMatch(/^\s+petioleElevationDeg:/m);
    expect(body, 'droopDeg 정의 0').not.toMatch(/^\s+droopDeg:/m);
    expect(body, 'twistDeg 정의 0').not.toMatch(/^\s+twistDeg:/m);
    expect(body, 'curl 보존').toMatch(/^\s+curl:/m);
  });
});
