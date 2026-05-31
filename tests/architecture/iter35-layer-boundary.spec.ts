// Iter 35 Phase H — Layer Boundary Enforcement.
//
// `docs/architecture/LAYER_STRUCTURE.md` 5 layer 정의 자동 검증:
//   A. Algorithms     (packages/tomato-geometry)    Babylon import 0
//   B. Growth Engine  (packages/tomato-engine)       Babylon import 0
//   C. Plant Base     (src/plant — core subdirs)     Babylon import 0
//                     단, _migration in progress_ files는 KNOWN_C_VIOLATORS로 분리.
//   D. Rendering      (src/rendering)                Babylon import 존재 의무
//   Archive           (src/_archive)                 호출처 0
//
// 사용자 비판 "이미 있다 ≠ 잘 동작한다" → precise regex (comment/string false positive 회피)
//   + 실제 import line만 매칭 (regex anchor `^\s*import` + boundary `['"]@babylonjs/`).

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

// precise — import statement 시작 + @babylonjs 모듈 경로.
const BABYLON_IMPORT_RE = /^\s*import\b[^;]*\bfrom\s+['"]@babylonjs\//m;

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '_archive' || ent.name === 'dist') continue;
      await walk(full, acc);
    } else if (ent.isFile() && /\.ts$/.test(ent.name)) {
      acc.push(full);
    }
  }
  return acc;
}

async function babylonImportFiles(absDir: string): Promise<string[]> {
  const files = await walk(absDir);
  const offenders: string[] = [];
  for (const abs of files) {
    const text = await fs.readFile(abs, 'utf-8');
    if (BABYLON_IMPORT_RE.test(text)) {
      offenders.push(path.relative(REPO_ROOT, abs));
    }
  }
  return offenders;
}

// ★ Iter 35 시점 _기존_ C-layer Babylon 잔존 files (Iter 36+ migration 후보).
//   본 list 외 _새 파일_ 추가 시 spec fail — 즉 _regression 금지_.
const KNOWN_C_VIOLATORS = new Set([
  // root level
  'src/plant/LeafGenerator.ts',
  'src/plant/LeafTexture.ts',
  'src/plant/TrussGenerator.ts',
  // subdirs
  'src/plant/anchors/leafAnchor.ts',
  'src/plant/coordinates/transforms.ts',
  'src/plant/coordinates/types.ts',
  'src/plant/leaf/buildLeafBladeMesh.ts',
  'src/plant/leaf/devHook.ts',
  'src/plant/leaf/material/getLeafBladeMaterial.ts',
  'src/plant/skeleton/buildTomatoSkeletonGraph.ts',
  'src/plant/skin/SkinEngine.ts',
  'src/plant/skin/StemFamilyTubeNetworkBuilder.ts',
  'src/plant/skin/buildPlantSkinMesh.ts',
]);

test.describe('Iter 35 Phase H — Layer Boundary Enforcement', () => {
  test('LAYER-A-ALGORITHMS-NO-BABYLON-01: packages/tomato-geometry Babylon import 0', async () => {
    const offenders = await babylonImportFiles(path.join(REPO_ROOT, 'packages/tomato-geometry/src'));
    expect(offenders, `A layer (geometry) — Babylon import 0 의무`).toEqual([]);
  });

  test('LAYER-B-GROWTH-NO-BABYLON-01: packages/tomato-engine/src Babylon import 0', async () => {
    const offenders = await babylonImportFiles(path.join(REPO_ROOT, 'packages/tomato-engine/src'));
    expect(offenders, `B layer (growth) — Babylon import 0 의무`).toEqual([]);
  });

  test('LAYER-C-PLANT-NO-NEW-BABYLON-01: src/plant Babylon import 0 (기존 violators 제외)', async () => {
    const all = await babylonImportFiles(path.join(REPO_ROOT, 'src/plant'));
    const newViolators = all.filter((f) => !KNOWN_C_VIOLATORS.has(f));
    expect(
      newViolators,
      `C layer (plant base) — 신규 Babylon import 금지.\n` +
        `Iter 35 시점 기존 violators ${KNOWN_C_VIOLATORS.size}건은 Iter 36+ migration 후보 (LAYER_STRUCTURE.md).\n` +
        `해결: (1) Babylon import 제거 OR (2) src/rendering/으로 이동 OR (3) KNOWN_C_VIOLATORS에 추가 (이유 docs 필요).`,
    ).toEqual([]);
  });

  test('LAYER-C-PLANT-KNOWN-VIOLATORS-EXIST-01: KNOWN_C_VIOLATORS list 정확 검증', async () => {
    // Iter 36 migration 시 file 이동/삭제되면 spec도 갱신해야 함을 강제.
    const all = await babylonImportFiles(path.join(REPO_ROOT, 'src/plant'));
    const allSet = new Set(all);
    const staleEntries: string[] = [];
    for (const entry of KNOWN_C_VIOLATORS) {
      if (!allSet.has(entry)) staleEntries.push(entry);
    }
    expect(
      staleEntries,
      `KNOWN_C_VIOLATORS에 등록된 file이 실제로 Babylon import _안 함_ — list 정리 필요`,
    ).toEqual([]);
  });

  test('LAYER-D-RENDERING-HAS-BABYLON-01: src/rendering/BabylonEngine.ts Babylon import 존재', async () => {
    const text = await fs.readFile(path.join(REPO_ROOT, 'src/rendering/BabylonEngine.ts'), 'utf-8');
    expect(BABYLON_IMPORT_RE.test(text), 'D layer entry point — Babylon import 의무').toBe(true);
  });

  test('LAYER-ARCHIVE-NOT-IMPORTED-01: src/_archive 호출처 0 (활성 코드 import 금지)', async () => {
    const srcDir = path.join(REPO_ROOT, 'src');
    const files = await walk(srcDir);  // walk excludes _archive
    const offenders: { file: string; line: number; text: string }[] = [];
    const archiveImportRe = /from\s+['"][^'"]*_archive\//;
    for (const abs of files) {
      const text = await fs.readFile(abs, 'utf-8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (archiveImportRe.test(lines[i])) {
          offenders.push({
            file: path.relative(REPO_ROOT, abs),
            line: i + 1,
            text: lines[i].trim().slice(0, 100),
          });
        }
      }
    }
    expect(offenders, `활성 src/ 에서 _archive import 금지`).toEqual([]);
  });
});
