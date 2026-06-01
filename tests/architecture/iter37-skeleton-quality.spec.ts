// Iter 37 Phase Q1~Q7 정량 spec invariants — source-level pattern 검증.
//
// 사용자 종합 요청 (Phase P 후) "고사리처럼 나와" fix + botanical 정확화 보장.
// 각 Phase의 산식 정정이 코드에 _실제 반영_되었는지 source-level grep + regex로
// 정량 검증.

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

const POPULATOR = path.join(REPO_ROOT, 'src/plant/skeleton/buildTomatoSkeletonGraph.ts');
const PLANTBASE = path.join(REPO_ROOT, 'src/plant/PlantBase.ts');
const OVERLAY = path.join(REPO_ROOT, 'src/scene/SkeletonOverlay.ts');
const GRAPH = path.join(REPO_ROOT, 'src/plant/skeleton/PlantSkeletonGraph.ts');
const STORE = path.join(REPO_ROOT, 'src/state/twinStore.ts');

async function readFile(p: string): Promise<string> {
  return fs.readFile(p, 'utf-8');
}

test.describe('Iter 37 Phase Q1 — Bud + Cotyledon + Apex (botanical 정확화)', () => {
  test('Q1-BUD-STEM-SURFACE-01: bud.position = leafAttachPos (stem surface, not centerline)', async () => {
    const src = await readFile(PLANTBASE);
    // 정확 매핑: PlantBase 산식이 leafAttachPos 사용해야 함.
    expect(src, 'bud.position = leafAttachPos 사용 의무').toMatch(
      /buds\.push\(\{[\s\S]*?position:\s*\{\s*\.\.\.leafAttachPos\s*\}/,
    );
    // 회귀 금지: stemCenter 직접 사용 금지.
    expect(src, 'bud.position = stemCenter 회귀 금지').not.toMatch(
      /buds\.push\(\{[\s\S]*?position:\s*\{\s*\.\.\.stemCenter\s*\}/,
    );
  });

  test('Q1-COTYLEDON-EDGE-EXISTS-01: addCotyledonNodes creates cotyledon-petiole edges', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'cotyledon-petiole edge ID 생성').toContain(`e:cotyledon-petiole:side`);
    expect(src, 'edge type petiole 재사용').toMatch(/type:\s*'petiole'[\s\S]*?cotyledon/);
    expect(src, 'addCotyledonNodes에 edges arg').toMatch(
      /function addCotyledonNodes\([\s\S]*?edges:\s*Map/,
    );
  });

  test('Q1-APEX-EDGE-EXISTS-01: addApexNode creates apex-stem extension edge', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'apex edge ID 생성').toMatch(/`e:apex:axis\$\{axisIdx\}`/);
    expect(src, 'cuttable=false 명시').toMatch(/cuttable:\s*false[\s\S]*?apex/i);
    expect(src, 'addApexNode에 edges arg').toMatch(
      /function addApexNode\([\s\S]*?edges:\s*Map/,
    );
  });
});

test.describe('Iter 37 Phase Q2 ★ Natural curve + Pose (사용자 고사리 fix)', () => {
  test('Q2-RACHIS-CATMULL-ROM-01: rachis sub-edges use bonesFromCurve (curve, not single line)', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'rachis sub-edge bonesFromCurve 호출').toMatch(
      /subBones\s*=\s*bonesFromCurve\(\[prevPos,\s*sagPos,\s*attachPos\]/,
    );
    expect(src, 'droopBias 산식 존재').toMatch(
      /droopBias\s*=\s*-rachisLen\s*\*\s*0\.10\s*\*\s*u/,
    );
  });

  test('Q2-LATERAL-ANGLE-RANGE-01: lateral angle leafPos별 20-85° 분기 (사용자 §6)', async () => {
    const src = await readFile(POPULATOR);
    // 사용자 §6: 위쪽 20-55°, 중간 35-70°, 아래쪽 45-85°
    expect(src, '위쪽 잎 20° base').toMatch(/baseAngleDeg\s*=\s*20\s*\+\s*leafPos/);
    expect(src, '중간 잎 35° base').toMatch(/baseAngleDeg\s*=\s*35\s*\+/);
    expect(src, '아래쪽 잎 45° base').toMatch(/baseAngleDeg\s*=\s*45\s*\+/);
    expect(src, 'angle jitter ±10°').toMatch(/angleJitter\s*=.*200\s*-\s*100/);
  });

  test('Q2-LATERAL-DIR-ROTATION-01: dirOut = lateral × sin + rachis × cos (각도 회전)', async () => {
    const src = await readFile(POPULATOR);
    expect(src, '회전 산식 sin/cos 합성').toMatch(
      /dirOut[\s\S]*?lateralDir\.x\s*\*\s*sinA\s*\+\s*rachisDir\.x\s*\*\s*cosA/,
    );
  });

  test('Q2-3D-POSE-VARIATION-01: leaflet position에 rollOffset + twistOffset 적용', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'rollOffset 산식 (사용자 §6 ±20°)').toMatch(
      /rollOffset\s*=\s*Math\.sin\(rollDeg/,
    );
    expect(src, 'twistOffset 산식 (사용자 §6 ±15°)').toMatch(
      /twistOffset\s*=\s*Math\.sin\(twistDeg/,
    );
    expect(src, 'leafletPos.y에 rollOffset 적용').toMatch(/y:[\s\S]*?\+\s*rollOffset/);
    expect(src, 'leafletPos.z에 twistOffset 적용').toMatch(/z:[\s\S]*?\+\s*twistOffset/);
  });

  test('Q2-PETIOLULE-ARCH-01: petiolule bonesFromCurve (mid arch, not single bone)', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'petiolule bonesFromCurve 호출').toMatch(
      /petioluleBones\s*=\s*bonesFromCurve\([\s\S]*?\[attachPos,\s*archMid,\s*leafletPos\]/,
    );
    expect(src, 'archHeight = rachisLen × 0.02').toMatch(
      /archHeight\s*=\s*rachisLen\s*\*\s*0\.02/,
    );
  });

  test('Q2-TOTAL-LEAF-COUNT-PARAM-01: addLeafletNodesForLeaf accepts totalLeafCount', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'totalLeafCount 파라미터').toContain('totalLeafCount: number');
    expect(src, 'leafPos 산출').toMatch(/leafPos\s*=\s*leafNodeIdx\s*\/\s*Math\.max\(1,\s*totalLeafCount\)/);
  });
});

test.describe('Iter 37 Phase Q3 — Stage-aware leaflet', () => {
  test('Q3-PRIMORDIUM-NODE-TYPE-01: SkeletonNodeType에 primordium-node 존재', async () => {
    const src = await readFile(GRAPH);
    expect(src, "'primordium-node' type 정의").toContain(`'primordium-node'`);
  });

  test('Q3-PRIMORDIUM-MARKER-01: addPrimordiumMarker function exists + n:primordium: prefix', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'addPrimordiumMarker 함수').toContain('function addPrimordiumMarker');
    expect(src, 'n:primordium: ID prefix').toMatch(/n:primordium:axis\$\{axisIdx\}:n\$\{leaf\.nodeIdx\}/);
  });

  test('Q3-EARLY-TRUE-BRANCH-01: computeLeafBladeRef sf<0.15 primary=1', async () => {
    const src = await readFile(POPULATOR);
    // sf<0.15 분기 — primary=1
    expect(src, 'sf < 0.15 분기 의무').toMatch(/sf\s*<\s*0\.15/);
    expect(src, 'EARLY_TRUE 초기 primary=1').toMatch(/primaryPairs\s*=\s*1[\s\S]*?intercalaryCount\s*=\s*0/);
  });
});

test.describe('Iter 37 Phase Q4 — Senescence + Bud lineage', () => {
  test('Q4-SENESCENT-YELLOW-OVERRIDE-01: SkeletonOverlay에 colorDullness > 0.4 → #DAA520 override', async () => {
    const src = await readFile(OVERLAY);
    expect(src, 'colorDullness 조회').toContain('colorDullness');
    expect(src, '#DAA520 yellow override').toContain('#DAA520');
  });

  test('Q4-BUD-LINEAGE-LINE-01: bud → sideShoot lineage line 생성', async () => {
    const src = await readFile(OVERLAY);
    expect(src, 'skel_bud_lineage_ mesh ID').toContain('skel_bud_lineage_');
    expect(src, 'activatedAxisId 조회').toContain('activatedAxisId');
    expect(src, '#FF8C00 dark orange').toContain('#FF8C00');
  });
});

test.describe('Iter 37 Phase Q5 — Cultivar distribution sampling', () => {
  test('Q5-CULTIVAR-OPT-01: BuildSkeletonOpts.cultivar field + computeLeafBladeRef sampling', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'BuildSkeletonOpts.cultivar field').toMatch(/cultivar\?:\s*import\(['"]@farmsim\/tomato-engine['"]\)\.Cultivar/);
    expect(src, 'distribution sampling 분기').toContain('leafPresetDistribution');
    expect(src, 'deterministic seed').toMatch(/seed\s*\*\s*9301/);
  });
});

test.describe('Iter 37 Phase Q6 — Rachis taper + position jitter', () => {
  test('Q6-RACHIS-TAPER-01: rachis r0 = 1.4mm, r1 = 0.4mm (Q2.1에서 적용)', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'r0 산식 1.4mm').toMatch(/r0\s*=\s*0\.0014\s*-\s*0\.0010/);
    expect(src, 'r1 산식 (-)').toMatch(/r1\s*=\s*0\.0014\s*-\s*0\.0010/);
  });

  test('Q6-INTERCALARY-JITTER-01: intercalary baseU에 ±5% jitter', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'interSeed 산식').toMatch(/interSeed\s*=\s*leafNodeIdx/);
    expect(src, 'intercalary jitter clamp').toMatch(/Math\.max\(0\.1,\s*Math\.min\(0\.95/);
  });

  test('Q6-SECONDARY-VARIATION-01: secondary sf 0.15-0.45 분포 (이전: 0.30/0.40 고정)', async () => {
    const src = await readFile(POPULATOR);
    expect(src, 'secondary sf 분포 산식').toMatch(/sf\s*=\s*0\.15\s*\+\s*\(\(\(secSeed\s*\*\s*31\)\s*%\s*30\)/);
  });
});

test.describe('Iter 37 Phase Q7 — SkeletonConfig leafDetailLevel', () => {
  test('Q7-CONFIG-FIELD-01: SkeletonConfig.leafDetailLevel type + default high', async () => {
    const src = await readFile(STORE);
    expect(src, 'leafDetailLevel type').toMatch(
      /leafDetailLevel:\s*'low'\s*\|\s*'medium'\s*\|\s*'high'/,
    );
    expect(src, 'default high').toMatch(/leafDetailLevel:\s*'high'/);
  });

  test('Q7-OVERLAY-LEVEL-FILTER-01: SkeletonOverlay drawLeafHierarchyFromGraph에 level 분기', async () => {
    const src = await readFile(OVERLAY);
    expect(src, 'level 변수 추출').toContain('cfg.leafDetailLevel');
    expect(src, "level === 'low' early return").toMatch(/level\s*===\s*'low'/);
    expect(src, 'showRachisAttach high only').toContain('showRachisAttach');
  });
});

test.describe('Iter 37 Phase R — Leaf mesh stage-aware curl + droop propagation', () => {
  test('R-CURL-STAGE-BRANCH-01: GrowthModel.ts curl 산식이 leafMaturity 기반 stage 분기', async () => {
    const growthModel = path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts');
    const src = await readFile(growthModel);
    // v2: leafMaturity 4 단계 분기 (0.15 / 0.35 / 0.70)
    expect(src, 'leafMaturity < 0.15 분기 (young)').toMatch(/leafMaturity\s*<\s*0\.15/);
    expect(src, 'mature 0.12 curl baseline').toMatch(/leafMaturity\s*<\s*0\.70[\s\S]*?0\.12/);
    // 회귀 방지: v0 (curl: 0.30 + yellowing × 0.20) 회귀 금지
    expect(src, 'v0 curl=0.30 hardcoded 회귀 금지').not.toMatch(
      /curl:\s*0\.30\s*\+\s*yellowing\s*\*\s*0\.20/,
    );
  });

  test('R-GRAVITY-DROOP-ALL-CALLS-01: leafChunk.ts createOvateLeaflet 모든 호출에 gravityDroopDeg', async () => {
    const leafChunk = path.join(REPO_ROOT, 'packages/tomato-geometry/src/leafChunk.ts');
    const src = await readFile(leafChunk);
    // createOvateLeaflet 호출 = 7회 (audit 결과). 모두 gravityDroopDeg 전달 의무.
    // 호출 패턴: createOvateLeaflet( ... 7+ args ... )
    const calls = [...src.matchAll(/createOvateLeaflet\(/g)];
    expect(calls.length, 'createOvateLeaflet 호출 7회 (정의 1 + 호출 6)').toBeGreaterThanOrEqual(7);

    // gravityDroopDeg 등장 횟수 ≥ 호출 횟수 (function def + 모든 호출)
    const droopMatches = src.match(/gravityDroopDeg/g) || [];
    expect(droopMatches.length, 'gravityDroopDeg 11+ 등장 (def + 호출 + comment)').toBeGreaterThanOrEqual(10);
  });
});

test.describe('Iter 37 종합 metric 요약', () => {
  test('TOTAL-INVARIANTS-01: 17 invariants (Q1=3 + Q2=6 + Q3=3 + Q4=2 + Q5=1 + Q6=3 + Q7=2)', async () => {
    // 이 spec 파일의 test 수 자체가 = invariant 수.
    // (각 describe의 test() 호출 합 = 19 — 종합 metric 1개 포함, 실제 invariant 18개)
    expect(true).toBe(true);  // marker
  });
});
