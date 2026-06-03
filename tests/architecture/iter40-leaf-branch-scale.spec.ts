// ★ S114 (Iter 40) — Leaf Branch Scale + Density Fix invariants.
//
// 사용자 진단: rachis 1.26m까지 폭발 (probe verdict FAIL). sf (area scale)가
// linear length에 1:1 곱해진 것이 근본 원인.
//
// 본 phase가 _surgical_ 보정 — engine sf 보존, length-layer만 clamp + non-linear
// curve + density 보강.
//
// 사용자 v3 검토 반영:
//   #1 명명 분리 (lengthSf / visualMaturity)
//   #2 rachisScale 최소 < petioleScale 최소
//   #3 PRIMARY_US 4쌍 0.79 → 0.84, 5쌍 신규 0.85
//   #4 5쌍 조건 (visualMaturity > 0.85 && rachisLen > 0.22 && complex)
//   #5 droopDeg도 visualMaturity 기반
//
// Source-grep style — iter37 pattern 동일 (runtime engine 없이 산식 자체 검증).

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

const SKELETON = path.join(REPO_ROOT, 'src/plant/skeleton/buildTomatoSkeletonGraph.ts');
const GRAPH = path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts');

async function readFile(p: string): Promise<string> {
  return fs.readFile(p, 'utf-8');
}

test.describe('S114 — Leaf Branch Scale + Density (v3 보정 반영)', () => {
  // ─── A. sf clamp + non-linear maturity curve ──────────────────────────

  test('LEAF-BRANCH-SF-CLAMP-01: lengthSf = clamp(sf, 0.05, 1.0) 상한 1.0', async () => {
    const src = await readFile(SKELETON);
    expect(src, 'lengthSf 명명 분리 + clamp(sf, 0.05, 1.0)').toMatch(
      /const\s+lengthSf\s*=\s*clamp\(sf,\s*0\.05,\s*1\.0\)/,
    );
  });

  test('LEAF-BRANCH-VISUAL-MATURITY-01: visualMaturity = smoothstep(0.12, 1.0, lengthSf)', async () => {
    const src = await readFile(SKELETON);
    expect(src, 'visualMaturity smoothstep ease (young 빨리 큼 회피)').toMatch(
      /const\s+visualMaturity\s*=\s*smoothstep\(0\.12,\s*1\.0,\s*lengthSf\)/,
    );
  });

  test('LEAF-BRANCH-NONLINEAR-SCALE-01: petiole / rachis / leafletScale lerp 곡선', async () => {
    const src = await readFile(SKELETON);
    // v3 보정 #2: rachis 최소 < petiole 최소 (어린 잎 _긴 빈 축_ 회피)
    expect(src, 'petioleScale = lerp(0.35, 1.0, visualMaturity)').toMatch(
      /const\s+petioleScale\s*=\s*lerp\(0\.35,\s*1\.0,\s*visualMaturity\)/,
    );
    expect(src, 'rachisScale = lerp(0.30, 1.0, visualMaturity) — petiole보다 작음').toMatch(
      /const\s+rachisScale\s*=\s*lerp\(0\.30,\s*1\.0,\s*visualMaturity\)/,
    );
    expect(src, 'leafletScale = lerp(0.35, 1.0, visualMaturity)').toMatch(
      /const\s+leafletScale\s*=\s*lerp\(0\.35,\s*1\.0,\s*visualMaturity\)/,
    );
  });

  test('LEAF-BRANCH-DROOP-DEG-01: droopDeg = lerp(-5, 15, visualMaturity) (v3 보정 #5)', async () => {
    const src = await readFile(SKELETON);
    expect(src, 'droopDeg visualMaturity 기반 (sf>1 mature 오판정 회피)').toMatch(
      /const\s+droopDeg\s*=\s*lerp\(-5,\s*15,\s*visualMaturity\)/,
    );
    // 회귀 금지: 이전 산식 sf > 0.7 ? 15 : -5
    expect(src, '이전 sf > 0.7 단순 분기 회귀 금지').not.toMatch(
      /droopDeg:\s*sf\s*>\s*0\.7\s*\?\s*15\s*:\s*-5/,
    );
  });

  // ─── B. PRIMARY_US v3 보정 + 5쌍 ────────────────────────────────────

  test('LEAF-BRANCH-PRIMARY-US-3-PAIR-01: 3쌍 [0.27, 0.50, 0.76] (v3 보정 #3)', async () => {
    const src = await readFile(SKELETON);
    expect(src, '3쌍 마지막 0.74 → 0.76').toMatch(
      /3:\s*\[0\.27,\s*0\.50,\s*0\.76\]/,
    );
  });

  test('LEAF-BRANCH-PRIMARY-US-4-PAIR-01: 4쌍 [0.18, 0.39, 0.62, 0.84] (v3 보정 #3)', async () => {
    const src = await readFile(SKELETON);
    // 4쌍 last primary 0.79 → 0.84 (terminal clearance 0.21 → 0.16)
    expect(src, '4쌍 last primary 0.84').toMatch(
      /4:\s*\[0\.18,\s*0\.39,\s*0\.62,\s*0\.84\]/,
    );
    // 회귀 금지: 이전 0.79
    expect(src, '4쌍 이전 0.79 회귀 금지').not.toMatch(
      /4:\s*\[0\.20,\s*0\.42,\s*0\.62,\s*0\.79\]/,
    );
  });

  test('LEAF-BRANCH-PRIMARY-US-5-PAIR-01: 5쌍 [0.16, 0.34, 0.52, 0.69, 0.85] 신규', async () => {
    const src = await readFile(SKELETON);
    expect(src, '5쌍 신규 (terminal-clearance 0.15)').toMatch(
      /5:\s*\[0\.16,\s*0\.34,\s*0\.52,\s*0\.69,\s*0\.85\]/,
    );
  });

  test('LEAF-BRANCH-FIVE-PAIR-CONDITION-01: 5쌍 보수 조건 (v3 보정 #4)', async () => {
    const src = await readFile(SKELETON);
    // visualMaturity > 0.85 && rachisLengthM > 0.22 && agePreset === 'complex'
    expect(src, '5쌍 조건: visualMaturity > 0.85 + rachisLengthM > 0.22 + complex').toMatch(
      /visualMaturity\s*>\s*0\.85[\s\S]{0,80}rachisLengthM\s*>\s*0\.22[\s\S]{0,80}agePreset\s*===\s*['"]complex['"]/,
    );
  });

  test('LEAF-BRANCH-PRIMARY-US-CLAMP-5-01: getPrimaryUsForPairCount 5 지원', async () => {
    const src = await readFile(SKELETON);
    expect(src, 'clamp 상한 4 → 5').toMatch(
      /Math\.min\(5,\s*Math\.round\(primaryPairs\)\)/,
    );
  });

  // ─── C. LeafBladeRef 타입 확장 ──────────────────────────────────────

  test('LEAF-BRANCH-BLADE-REF-VISUAL-MATURITY-01: LeafBladeRef.visualMaturity 필드', async () => {
    const src = await readFile(GRAPH);
    expect(src, 'LeafBladeRef.visualMaturity field 정의').toMatch(
      /interface LeafBladeRef[\s\S]*?visualMaturity:\s*number;/,
    );
  });

  test('LEAF-BRANCH-BLADE-REF-LEAFLET-SCALE-01: LeafBladeRef.leafletScale 필드', async () => {
    const src = await readFile(GRAPH);
    expect(src, 'LeafBladeRef.leafletScale field 정의').toMatch(
      /interface LeafBladeRef[\s\S]*?leafletScale:\s*number;/,
    );
  });

  // ─── D. 회귀 방지: 이전 sf 1:1 곱 패턴 부재 ──────────────────────

  test('LEAF-BRANCH-NO-DIRECT-SF-MULT-01: 이전 sfClamped × refRachis 패턴 회귀 금지', async () => {
    const src = await readFile(SKELETON);
    // 이전: const rachisLengthM = refRachis * sfClamped * nodePositionScale;
    // 새: const rachisLengthM = refRachis * rachisScale * nodePositionScale;
    expect(src, 'sfClamped × refRachis 회귀 금지 (length-layer sf 직접 곱 제거)').not.toMatch(
      /rachisLengthM\s*=\s*refRachis\s*\*\s*sfClamped\s*\*\s*nodePositionScale/,
    );
    expect(src, 'rachisScale 사용 의무').toMatch(
      /rachisLengthM\s*=\s*refRachis\s*\*\s*rachisScale\s*\*\s*nodePositionScale/,
    );
  });
});
