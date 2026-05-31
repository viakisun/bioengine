// SSOT #187 — SkeletonPopulator isolation invariant.
// See: docs/architecture/SEMANTIC_GRAPH.md sections 1, 3, 4.
//
// 원칙 3 + 4: simulation truth (PlantBase / PlantState / cultivar) 직접 참조는
// SkeletonPopulator (buildTomatoSkeletonGraph + populator/ helpers)에서만
// 일어나야 한다. Skin / Overlay / AcceptanceProbe 경로는 graph만 본다.
//
// 진행 정책 (점진):
//   - Iter 26 PR 2-0 baseline 기록 (현재 위반 위치 인벤토리).
//   - PR 3-1/3-2 후 SkinMeshPlant leaf/truss 루프 = 0 위반.
//   - PR 5-1 후 src/scene/SkinMeshPlant.ts SkinEngine 호출에 plantBase 인자 0건
//     + src/plant/skin/** PlantState 참조 0건.
//
// 본 spec은 node-context (fs)에서 grep 실행 — playwright config는 architecture
// dir를 포함하지만 page 컨텍스트는 사용하지 않는다.

import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = process.cwd();

// 허용된 populator 경로 (simulation 읽기 가능).
const POPULATOR_PATHS = [
  'src/plant/skeleton/buildTomatoSkeletonGraph.ts',
  'src/plant/skeleton/SkeletonEngine.ts',
  'src/plant/skeleton/populator', // PR 2-1~2-3 helper들
];

// 시각 경로 (graph만 봐야 함, simulation 직접 참조 0 목표).
const VISUAL_PATHS = [
  'src/scene/SkinMeshPlant.ts',
  'src/scene/SkeletonOverlay.ts',
  'src/plant/skin',
];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const full = join(REPO_ROOT, dir);
  try {
    const stat = statSync(full);
    if (stat.isFile()) return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
    for (const entry of readdirSync(full)) {
      const p = join(full, entry);
      const s = statSync(p);
      if (s.isDirectory()) {
        out.push(...listTsFiles(join(dir, entry)));
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(p);
      }
    }
  } catch {
    // path may not exist (e.g. populator/ before PR 2-1) — that is OK.
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

function findSimulationImports(files: string[]): Violation[] {
  const re = /from\s+['"]([^'"]*(?:PlantBase|PlantState)[^'"]*)['"]/;
  const out: Violation[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re);
      if (m) {
        out.push({
          file: file.replace(REPO_ROOT + '/', ''),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }
  return out;
}

test.describe('SkeletonPopulator Isolation (SSOT #187)', () => {
  test('POP-01: visual paths의 PlantBase/PlantState import baseline 인벤토리', async () => {
    const files: string[] = [];
    for (const p of VISUAL_PATHS) files.push(...listTsFiles(p));
    const violations = findSimulationImports(files);
    // PR 2-0 시점: baseline 기록 (정보만). PR 5-1 후 < N으로 감소 검증.
    // eslint-disable-next-line no-console
    console.log(`[POP-01 baseline] visual paths simulation imports: ${violations.length}`);
    for (const v of violations) {
      // eslint-disable-next-line no-console
      console.log(`  - ${v.file}:${v.line}  ${v.text}`);
    }
    // PR 2-0 baseline assertion — 단지 합리적 상한 (현재 ~6 파일).
    // PR 5-1 끝 후 strict 0으로 변경 예정.
    expect(violations.length, 'visual path simulation imports (PR 2-0 baseline)').toBeLessThan(20);
  });

  test('POP-02: populator paths만 simulation 직접 import (이외 0건 목표)', async () => {
    // Phase 2/3/5 거치며 점진 감소. 본 spec은 baseline 측정.
    const populatorFiles: string[] = [];
    for (const p of POPULATOR_PATHS) populatorFiles.push(...listTsFiles(p));
    const populatorImports = findSimulationImports(populatorFiles);
    expect(populatorImports.length, 'populator must read simulation').toBeGreaterThan(0);
  });
});
