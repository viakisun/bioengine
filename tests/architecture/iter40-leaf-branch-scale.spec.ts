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
const PLANTBASE = path.join(REPO_ROOT, 'src/plant/PlantBase.ts');

async function readFile(p: string): Promise<string> {
  return fs.readFile(p, 'utf-8');
}

test.describe('S114 — Leaf Branch Scale + Density (v3 보정 반영)', () => {
  // ─── A. sf clamp + non-linear maturity curve ──────────────────────────

  test('LEAF-BRANCH-DISTANCE-FROM-APEX-01: skeleton computeLeafBladeRef에 distanceFromApexM 인자 (S114-F)', async () => {
    const src = await readFile(SKELETON);
    expect(src, 'computeLeafBladeRef signature에 distanceFromApexM').toMatch(
      /function computeLeafBladeRef\([\s\S]{0,300}distanceFromApexM:\s*number/,
    );
    expect(src, 'caller에서 apex 거리 계산 후 전달').toMatch(
      /computeLeafBladeRef\(leaf,\s*cultivar,\s*nodePositionScale,\s*distanceFromApexM\)/,
    );
  });

  test('LEAF-BRANCH-VISUAL-MATURITY-01: visualMaturity = min(sfMaturity, distanceMaturity) (S114-F)', async () => {
    const src = await readFile(SKELETON);
    // S114-F: sf 빠른 포화 해소 — min() blend.
    expect(src, 'sfMaturity smoothstep(0.25, 1.80, sf)').toMatch(
      /const\s+sfMaturity\s*=\s*smoothstep\(0\.25,\s*1\.80,\s*sf\)/,
    );
    expect(src, 'distanceMaturity smoothstep(0.04, 0.24, distanceFromApexM)').toMatch(
      /const\s+distanceMaturity\s*=\s*smoothstep\(0\.04,\s*0\.24,\s*distanceFromApexM\)/,
    );
    expect(src, 'visualMaturity = Math.min(sfMaturity, distanceMaturity)').toMatch(
      /const\s+visualMaturity\s*=\s*Math\.min\(sfMaturity,\s*distanceMaturity\)/,
    );
  });

  test('LEAF-BRANCH-NONLINEAR-SCALE-01: STRONG_FIX scale 곡선 (S114-F)', async () => {
    const src = await readFile(SKELETON);
    expect(src, 'petioleScale = lerp(0.22, 1.0, visualMaturity)').toMatch(
      /const\s+petioleScale\s*=\s*lerp\(0\.22,\s*1\.0,\s*visualMaturity\)/,
    );
    expect(src, 'rachisScale = lerp(0.20, 1.0, visualMaturity) — petiole보다 작음').toMatch(
      /const\s+rachisScale\s*=\s*lerp\(0\.20,\s*1\.0,\s*visualMaturity\)/,
    );
    expect(src, 'leafletScale = lerp(0.30, 1.0, visualMaturity)').toMatch(
      /const\s+leafletScale\s*=\s*lerp\(0\.30,\s*1\.0,\s*visualMaturity\)/,
    );
  });

  test('LEAF-BRANCH-MATURE-CAPS-01: STRONG_FIX base 값 (S114-F)', async () => {
    const src = await readFile(SKELETON);
    // refRachis default 0.30 → 0.22 (22cm), refPetiole 0.10 → 0.065 (6.5cm)
    expect(src, 'refRachis default 0.22').toMatch(
      /referenceRachisLengthM\s*\?\?\s*0\.22/,
    );
    expect(src, 'refPetiole default 0.065').toMatch(
      /referencePetioleLengthM\s*\?\?\s*0\.065/,
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

  // ─── E. PlantBase petioleLengthM도 동일 fix (S114-D) ─────────────────
  //   _진짜_ 시각 fix — PlantBase petioleLengthM이 실제 렌더링 source.
  //   probe 결과: sf=2.0 → petiole 21cm → 12cm (40% 감소).

  test('LEAF-BRANCH-PLANTBASE-STRONG-FIX-01: PlantBase petiole STRONG_FIX (S114-E)', async () => {
    const src = await readFile(PLANTBASE);
    // 회귀 금지: 이전 0.12 × max(0.05, sf) (상한 없음) + S114-D 0.12 base
    expect(src, '회귀 금지: 0.12 × max(0.05, sf)').not.toMatch(
      /const\s+petioleLengthM\s*=\s*0\.12\s*\*\s*Math\.max\(0\.05,\s*node\.leafSizeFactor\)/,
    );
    // S114-E: min(sfMaturity, distanceMaturity) + 5.5cm base
    expect(src, 'sfMaturity smoothstep(0.25, 1.80)').toMatch(
      /sfMaturity\s*=\s*_ssSf\s*\*\s*_ssSf\s*\*\s*\(3\s*-\s*2\s*\*\s*_ssSf\)/,
    );
    expect(src, 'distanceMaturity from apex').toMatch(
      /distanceMaturity\s*=\s*_ssDist\s*\*\s*_ssDist\s*\*\s*\(3\s*-\s*2\s*\*\s*_ssDist\)/,
    );
    expect(src, 'visualMaturity = min(sfMaturity, distanceMaturity)').toMatch(
      /const\s+visualMaturity\s*=\s*Math\.min\(sfMaturity,\s*distanceMaturity\)/,
    );
    expect(src, 'maturePetioleLengthM = 0.055 (5.5cm)').toMatch(
      /const\s+maturePetioleLengthM\s*=\s*0\.055/,
    );
    expect(src, 'petioleScale = 0.22 + 0.78 × visualMaturity').toMatch(
      /const\s+petioleScale\s*=\s*0\.22\s*\+\s*0\.78\s*\*\s*visualMaturity/,
    );
  });
});
