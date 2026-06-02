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

test.describe('Iter 34 C6 + Iter 39 L3-A — Leaf mesh build 진입점 단일 보장', () => {
  test('LEAF-MESH-SINGLE-ENTRY-01 (L3-A revised): canonical entry = buildLeafMeshFromSkeleton (LeafMeshBuilder)', async () => {
    // ★ L3-A (S19) — fallback path (buildLeafMeshFromPhytomer) 제거.
    //   canonical entry = LeafMeshBuilder.buildLeafMeshFromSkeleton.
    //   호출 site = SkinMeshPlant.ts 1건만.
    const srcDir = path.join(REPO_ROOT, 'src');
    const files = await walk(srcDir);
    const callRe = /buildLeafMeshFromSkeleton\s*\(/;
    const defRe = /export function buildLeafMeshFromSkeleton/;
    const callSites: string[] = [];
    for (const abs of files) {
      const rel = path.relative(REPO_ROOT, abs);
      const text = await fs.readFile(abs, 'utf-8');
      if (callRe.test(text)) {
        if (defRe.test(text)) continue;
        callSites.push(rel);
      }
    }
    expect(callSites).toEqual(['src/scene/SkinMeshPlant.ts']);
  });

  test('LEAF-MESH-FALLBACK-REMOVED-01 (L3-A): buildLeafMeshFromPhytomer 정의 0', async () => {
    const text = await readSrc('src/plant/LeafGenerator.ts');
    expect(text, 'buildLeafMeshFromPhytomer function 정의 0 — L3-A에서 제거').not.toMatch(
      /export function buildLeafMeshFromPhytomer/,
    );
    // createLeafBladeOnlyMesh (Iter 34 C1)도 여전히 0
    expect(text, 'createLeafBladeOnlyMesh function 정의 0').not.toMatch(
      /export function createLeafBladeOnlyMesh/,
    );
  });

  test('LEAF-MESH-LEAFCHUNK-REMOVED-01 (L3-A): packages/tomato-geometry/leafChunk.ts 파일 0', async () => {
    // ★ L3-A — leafChunk.ts 전체 삭제 (buildLeafChunkSkin/Legacy/createOvateLeaflet/
    //   buildLeafBladeOnly 모두 fallback 의존, dead code).
    const filePath = path.join(REPO_ROOT, 'packages/tomato-geometry/src/leafChunk.ts');
    let exists = false;
    try { await fs.access(filePath); exists = true; } catch { /* not exist */ }
    expect(exists, 'leafChunk.ts 파일은 L3-A에서 삭제됨').toBe(false);
    // packages/index.ts에서 leafChunk export 0
    const idxText = await readSrc('packages/tomato-geometry/src/index.ts');
    expect(idxText, 'leafChunk export 0').not.toMatch(/from ['"]\.\/leafChunk['"]/);
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
