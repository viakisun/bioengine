// J0-metrics probe — 8지표 graph-native 측정.
// J0 v14 plan: J0-3A vs J0-3B 의사결정은 _metrics diff_ 로만. 시각 평가 금지.
//
// 사용법:
//   node _probe-j0-leaf-metrics.mjs > metrics-3A.json
//   (factor 변경 후) node _probe-j0-leaf-metrics.mjs > metrics-3B.json
//   diff metrics-3A.json metrics-3B.json
//
// 8지표:
//   1. primary petioluleLen / rachisLen — avg, max
//   2. intercalary petioluleLen / rachisLen — avg, max
//   3. avg attachU gap (primary-primary, primary-intercalary)
//   4. max attachU gap
//   5. terminalU − lastPrimaryU
//   6. terminal / primaryAvg / intercalaryAvg targetSizeM ratios
//   7. rachis monotonicity (backtracking count) + adjacent tangent dot min/avg
//   8. cluster compactness (max petioluleLen 절대값, leaflet centroid spread vs rachisLen)

import { chromium } from 'playwright';

const URL = 'http://localhost:8090/';
const DAY = 45;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('page error:', err.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate((d) => {
    const w = window;
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, DAY);
  await page.waitForTimeout(3500);

  const metrics = await page.evaluate(() => {
    const w = window;
    const graph = w.__lastGraph;
    const pb = w.__lastPlantBase;
    if (!graph?.nodes || !graph?.edges || !pb) {
      return { error: 'graph or plantBase not exposed' };
    }
    // 잎별로 그룹.
    const leafGroups = new Map();
    for (const node of graph.nodes.values()) {
      const ref = node.leafletRef;
      if (!ref) continue;
      const parentTag = node.id.match(/axis\d+:n\d+/)?.[0];
      if (!parentTag) continue;
      if (!leafGroups.has(parentTag)) {
        leafGroups.set(parentTag, { leaflets: [], rachisEdges: [], petioluleEdges: [] });
      }
      leafGroups.get(parentTag).leaflets.push({
        id: node.id,
        position: ref.position,
        rachisU: ref.rachisU,
        targetSizeM: ref.targetSizeM,
        attachNodeId: ref.attachNodeId,
        pos: node.pos,
      });
    }
    for (const edge of graph.edges.values()) {
      const parentTag = edge.id.match(/axis\d+:n\d+/)?.[0];
      if (!parentTag) continue;
      const grp = leafGroups.get(parentTag);
      if (!grp) continue;
      if (edge.type === 'leaf-rachis') grp.rachisEdges.push(edge);
      if (edge.type === 'petiolule' || edge.type === 'lateral-vein') grp.petioluleEdges.push(edge);
    }
    // 잎별 rachisLengthM 추출 (leafBladeRef from tip node).
    const rachisLenByLeaf = new Map();
    for (const node of graph.nodes.values()) {
      const ref = node.leafBladeRef;
      if (!ref) continue;
      const parentTag = node.id.match(/axis\d+:n\d+/)?.[0];
      if (parentTag) rachisLenByLeaf.set(parentTag, ref.rachisLengthM ?? 0);
    }

    function dist(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    }
    function pairCount(leaflets) {
      return leaflets.filter(l => l.position === 'primary' && l.id.includes(':primary:')).length / 2;
    }

    const perLeaf = [];
    for (const [parentTag, grp] of leafGroups) {
      const rachisLen = rachisLenByLeaf.get(parentTag) ?? 0;
      if (rachisLen <= 0) continue;
      const primaries = grp.leaflets.filter(l => l.position === 'primary');
      const intercalaries = grp.leaflets.filter(l => l.position === 'intercalary');
      const terminals = grp.leaflets.filter(l => l.position === 'terminal');
      // (1) primary petiolule ratio
      const primPetio = [];
      for (const p of primaries) {
        const attach = graph.nodes.get(p.attachNodeId);
        if (!attach) continue;
        primPetio.push(dist(p.pos, attach.pos) / rachisLen);
      }
      // (2) intercalary
      const interPetio = [];
      for (const it of intercalaries) {
        const attach = graph.nodes.get(it.attachNodeId);
        if (!attach) continue;
        interPetio.push(dist(it.pos, attach.pos) / rachisLen);
      }
      // (3) (4) attachU gap
      const allUs = [...new Set(grp.leaflets.map(l => l.rachisU))].sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < allUs.length; i++) gaps.push(allUs[i] - allUs[i - 1]);
      // (5) terminal clearance
      const primUs = primaries.map(p => p.rachisU);
      const lastPrimaryU = primUs.length > 0 ? Math.max(...primUs) : 0;
      const termU = terminals.length > 0 ? terminals[0].rachisU : 1.0;
      const clearance = termU - lastPrimaryU;
      // (6) hierarchy ratios
      const avg = (arr) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
      const primSize = avg(primaries.map(p => p.targetSizeM));
      const interSize = avg(intercalaries.map(it => it.targetSizeM));
      const termSize = avg(terminals.map(t => t.targetSizeM));
      // (7) rachis monotonic + smooth — macro attach point polyline
      const attachPoints = [];
      const sortedRachis = grp.rachisEdges.slice().sort((a, b) => {
        const ai = parseInt(a.id.match(/seg(\d+)/)?.[1] ?? '0', 10);
        const bi = parseInt(b.id.match(/seg(\d+)/)?.[1] ?? '0', 10);
        return ai - bi;
      });
      if (sortedRachis.length > 0) {
        attachPoints.push({ ...sortedRachis[0].bonePath[0].p0 });
        for (const e of sortedRachis) {
          const endNode = graph.nodes.get(e.endNodeId);
          if (endNode) attachPoints.push({ ...endNode.pos });
        }
      }
      // ★ J0-7E (v16) — rachis linearity ratio + midpoint sag (직선 부재 측정).
      let backtrack = 0, minAdjDot = 1, minSegDot = 1;
      let polylineLen = 0, directDist = 0, linearityRatio = 1, midpointSagM = 0;
      if (attachPoints.length >= 2) {
        const startP = attachPoints[0], endP = attachPoints[attachPoints.length - 1];
        const gx = endP.x - startP.x, gy = endP.y - startP.y, gz = endP.z - startP.z;
        const gLen = Math.hypot(gx, gy, gz);
        directDist = gLen;
        for (let i = 0; i < attachPoints.length - 1; i++) {
          polylineLen += Math.hypot(
            attachPoints[i + 1].x - attachPoints[i].x,
            attachPoints[i + 1].y - attachPoints[i].y,
            attachPoints[i + 1].z - attachPoints[i].z,
          );
        }
        linearityRatio = gLen > 1e-6 ? polylineLen / gLen : 1;
        // midpoint sag
        const midIdx = Math.floor(attachPoints.length / 2);
        const midPt = attachPoints[midIdx];
        const lerpMidX = startP.x + (endP.x - startP.x) * 0.5;
        const lerpMidY = startP.y + (endP.y - startP.y) * 0.5;
        const lerpMidZ = startP.z + (endP.z - startP.z) * 0.5;
        midpointSagM = Math.hypot(midPt.x - lerpMidX, midPt.y - lerpMidY, midPt.z - lerpMidZ);
        if (gLen > 1e-6) {
          const gDir = { x: gx / gLen, y: gy / gLen, z: gz / gLen };
          const tans = [];
          let prevProj = 0;
          for (let i = 0; i < attachPoints.length - 1; i++) {
            const dx = attachPoints[i + 1].x - attachPoints[i].x;
            const dy = attachPoints[i + 1].y - attachPoints[i].y;
            const dz = attachPoints[i + 1].z - attachPoints[i].z;
            const dLen = Math.hypot(dx, dy, dz);
            if (dLen < 1e-6) continue;
            const t = { x: dx / dLen, y: dy / dLen, z: dz / dLen };
            tans.push(t);
            const proj = (attachPoints[i + 1].x - startP.x) * gDir.x
                       + (attachPoints[i + 1].y - startP.y) * gDir.y
                       + (attachPoints[i + 1].z - startP.z) * gDir.z;
            if (i > 0 && proj < prevProj - 0.0005) backtrack++;
            prevProj = proj;
            const sd = t.x * gDir.x + t.y * gDir.y + t.z * gDir.z;
            if (sd < minSegDot) minSegDot = sd;
          }
          for (let i = 1; i < tans.length; i++) {
            const ad = tans[i - 1].x * tans[i].x + tans[i - 1].y * tans[i].y + tans[i - 1].z * tans[i].z;
            if (ad < minAdjDot) minAdjDot = ad;
          }
        }
      }
      // (8) compactness
      const maxPetioleAbs = Math.max(0, ...primPetio.map(r => r * rachisLen),
                                          ...interPetio.map(r => r * rachisLen));
      // centroid spread
      const allLeafletPos = grp.leaflets.map(l => l.pos);
      const cx = avg(allLeafletPos.map(p => p.x));
      const cy = avg(allLeafletPos.map(p => p.y));
      const cz = avg(allLeafletPos.map(p => p.z));
      const spread = Math.max(0, ...allLeafletPos.map(p => Math.hypot(p.x - cx, p.y - cy, p.z - cz)));
      perLeaf.push({
        parentTag,
        rachisLen,
        leafletCount: { total: grp.leaflets.length, primary: primaries.length, intercalary: intercalaries.length, terminal: terminals.length },
        pairCount: pairCount(grp.leaflets),
        petiolule: {
          primary: { avg: avg(primPetio), max: Math.max(0, ...primPetio) },
          intercalary: { avg: avg(interPetio), max: Math.max(0, ...interPetio) },
        },
        attachUGap: {
          avg: gaps.length === 0 ? 0 : avg(gaps),
          max: gaps.length === 0 ? 0 : Math.max(...gaps),
          n: gaps.length,
        },
        terminalClearance: { lastPrimaryU, termU, gap: clearance },
        hierarchy: {
          terminalAvg: termSize,
          primaryAvg: primSize,
          intercalaryAvg: interSize,
          termOverPrim: primSize > 0 ? termSize / primSize : 0,
          primOverInter: interSize > 0 ? primSize / interSize : 0,
        },
        rachis: { backtrack, minSegDot, minAdjDot, segCount: attachPoints.length,
                  polylineLen, directDist, linearityRatio, midpointSagM,
                  relSagPct: directDist > 0 ? (midpointSagM / directDist * 100) : 0 },
        compactness: { maxPetioleAbsM: maxPetioleAbs, centroidSpreadM: spread, spreadOverRachis: rachisLen > 0 ? spread / rachisLen : 0 },
        // ★ J0-9D-1 (v21): closure 4 metrics (reporting only)
        closure: (() => {
          // (a) Influence radius coverage: rachis [0.15, 0.95]에서 uncovered span
          const INFLUENCE = { primary: 0.11, intercalary: 0.06, terminal: 0.10 };
          const covered = grp.leaflets
            .map(l => {
              const r = INFLUENCE[l.position] ?? 0;
              return { lo: l.rachisU - r, hi: l.rachisU + r };
            })
            .sort((a, b) => a.lo - b.lo);
          // [0.15, 0.95] 구간에서 uncovered max
          let maxUncovered = 0;
          let cursor = 0.15;
          for (const c of covered) {
            if (c.hi < cursor) continue;
            if (c.lo > cursor) {
              const gap = Math.min(c.lo, 0.95) - cursor;
              if (gap > maxUncovered) maxUncovered = gap;
            }
            cursor = Math.max(cursor, c.hi);
            if (cursor >= 0.95) break;
          }
          if (cursor < 0.95) {
            const gap = 0.95 - cursor;
            if (gap > maxUncovered) maxUncovered = gap;
          }
          // (b) Intercalary fill: primary _pair 단위_ macro gap 중 intercalary 존재 비율
          //   ★ v21 fix: 좌우 stagger (±0.020) 쌍 _내부_ gap은 무시. 같은 pair의
          //   좌우 leaflet U는 평균값(= pair midpoint)으로 묶기.
          const primUsRaw = primaries.map(p => p.rachisU).sort((a, b) => a - b);
          const pairBaseUs = [];
          for (let pi = 0; pi + 1 < primUsRaw.length; pi += 2) {
            pairBaseUs.push((primUsRaw[pi] + primUsRaw[pi + 1]) * 0.5);
          }
          const intUs = intercalaries.map(it => it.rachisU);
          let pairGapCount = 0, filledCount = 0;
          for (let pi = 0; pi < pairBaseUs.length - 1; pi++) {
            const a = pairBaseUs[pi], b = pairBaseUs[pi + 1];
            pairGapCount++;
            if (intUs.some(u => u > a && u < b)) filledCount++;
          }
          const primUsSorted = primUsRaw;  // 호환용
          void primUsSorted;
          // (c) Terminal emphasis
          const termU = terminals.length > 0 ? terminals[0].rachisU : 0;
          const termSize = terminals.length > 0 ? terminals[0].targetSizeM : 0;
          const termClearance = primUsRaw.length > 0 ? termU - primUsRaw[primUsRaw.length - 1] : 0;
          // (d) Role separation — size + branch length ratios
          //   primary branch length 평균 (산식 PRIMARY_BRANCH_LENGTH × sf × rachisLen).
          //   여기는 graph에서 직접 측정: petioluleLen.
          const primBranchLens = primPetio.map(r => r * rachisLen);
          const interBranchLens = interPetio.map(r => r * rachisLen);
          const avgArr = (a) => a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length;
          return {
            maxUncoveredU: maxUncovered,
            intercalaryFillRatio: pairGapCount > 0 ? filledCount / pairGapCount : 0,
            terminal: { u: termU, sizeOverPrim: primSize > 0 ? termSize / primSize : 0, clearance: termClearance },
            roleSeparation: {
              sizeRatio: interSize > 0 ? primSize / interSize : 0,
              branchLenRatio: avgArr(interBranchLens) > 0 ? avgArr(primBranchLens) / avgArr(interBranchLens) : 0,
            },
          };
        })(),
      });
    }

    // aggregate
    function aggAvg(arr) { return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length; }
    function aggMax(arr) { return arr.length === 0 ? 0 : Math.max(...arr); }
    const aggregate = {
      leafCount: perLeaf.length,
      primPetio: {
        avg: aggAvg(perLeaf.map(l => l.petiolule.primary.avg)),
        max: aggMax(perLeaf.map(l => l.petiolule.primary.max)),
      },
      interPetio: {
        avg: aggAvg(perLeaf.map(l => l.petiolule.intercalary.avg)),
        max: aggMax(perLeaf.map(l => l.petiolule.intercalary.max)),
      },
      attachUGap: {
        avgOfAvg: aggAvg(perLeaf.map(l => l.attachUGap.avg)),
        maxOfMax: aggMax(perLeaf.map(l => l.attachUGap.max)),
      },
      terminalClearance: { avg: aggAvg(perLeaf.map(l => l.terminalClearance.gap)) },
      hierarchy: {
        termOverPrimAvg: aggAvg(perLeaf.map(l => l.hierarchy.termOverPrim)),
        primOverInterAvg: aggAvg(perLeaf.map(l => l.hierarchy.primOverInter)),
      },
      rachis: {
        backtrackTotal: perLeaf.reduce((a, l) => a + l.rachis.backtrack, 0),
        minSegDotOverall: aggMax(perLeaf.map(l => -l.rachis.minSegDot)) * -1 || 1,
        minAdjDotOverall: aggMax(perLeaf.map(l => -l.rachis.minAdjDot)) * -1 || 1,
      },
      compactness: {
        maxPetioleAbsM: aggMax(perLeaf.map(l => l.compactness.maxPetioleAbsM)),
        spreadOverRachisAvg: aggAvg(perLeaf.map(l => l.compactness.spreadOverRachis)),
      },
      // ★ J0-9D-1 (v21): closure aggregate (reporting only)
      closure: {
        maxUncoveredUOverall: aggMax(perLeaf.map(l => l.closure?.maxUncoveredU ?? 0)),
        maxUncoveredUAvg: aggAvg(perLeaf.map(l => l.closure?.maxUncoveredU ?? 0)),
        intercalaryFillAvg: aggAvg(perLeaf.map(l => l.closure?.intercalaryFillRatio ?? 0)),
        terminalUAvg: aggAvg(perLeaf.map(l => l.closure?.terminal?.u ?? 0)),
        terminalSizeOverPrimAvg: aggAvg(perLeaf.map(l => l.closure?.terminal?.sizeOverPrim ?? 0)),
        terminalClearanceAvg: aggAvg(perLeaf.map(l => l.closure?.terminal?.clearance ?? 0)),
        roleSizeRatioAvg: aggAvg(perLeaf.map(l => l.closure?.roleSeparation?.sizeRatio ?? 0)),
        roleBranchLenRatioAvg: aggAvg(perLeaf.map(l => l.closure?.roleSeparation?.branchLenRatio ?? 0)),
      },
    };

    return { aggregate, perLeaf };
  });

  console.log(JSON.stringify(metrics, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
