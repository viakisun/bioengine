// Iter 31 Phase 0.0 — Multi-timepoint leaf node data dump.
//
// 동기: 사용자가 D=10/20/30/40/50/60/70/80/90 9시점 각 시점의 leaf-bearing
// node 모든 수치를 markdown 표로 받고, 그 데이터를 기반으로 plan을 정교화.
//
// 단일 page 한 번 로드 + setSinglePlantMinute로 day 변경 (속도 최적화).
// markdown 표 자동 생성 → docs/iter31-multi-timepoint-leaf-node-data.md

import { test, type Page } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');
const OUT_PATH = path.join(REPO_ROOT, 'docs/iter31-multi-timepoint-leaf-node-data.md');

const DAYS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

async function initOnce(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setMode('single-plant');
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(3000);
}

async function setDay(page: Page, day: number) {
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

async function dumpAtDay(page: Page) {
  return await page.evaluate(() => {
    // Type shims — engine + skeleton 타입 직접 import 못 하므로 inline.
    type V3 = { x: number; y: number; z: number };
    type Quat4 = { x: number; y: number; z: number; w: number };
    type LeafAllocation = {
      plantSourceFactor: number;
      axisSourceFactor?: number;
      axisCapacityFactor: number;
      sideShootAllocationFactor: number;
      stressFactor: number;
      finalAllocationFactor: number;
      limitationReason: string;
    };
    type Posture = {
      // ★ Iter 34 C3 — azimuthDeg/twistDeg/droopDeg/petioleElevationDeg 제거. 9 분해 필드만.
      lightSeekingBladePlaneTiltDeg?: number;
      petioleBaseElevationDeg?: number;
      gravityDroopDeg?: number;
      senescenceDroopDeg?: number;
      waterStressDroopDeg?: number;
      finalBladePlaneTiltDeg?: number;
      finalDroopDeg?: number;
      curl: number;
    };
    type GrowthContext = {
      axisId: string;
      localStemRadiusMm: number;
      axisCapacityFactor: number;
      isSideShoot: boolean;
      parentVigorFactor: number;
    };
    type Phytomer = {
      index: number;
      status: string;
      initiationTT: number;
      ageTT: number;
      internode: { targetLengthCm: number; currentLengthCm: number; expansionProgress: number };
      growthContext?: GrowthContext;
      leaf: {
        initiationTT: number;
        ageTT: number;
        potentialAreaCm2?: number;
        targetAreaCm2: number;
        currentAreaCm2: number;
        expansionProgress: number;
        leafletCount: number;
        stage: string;
        posture: Posture;
        senescence: { progress: number; colorDullness: number; visibleAreaFactor: number; curl: number };
        allocation?: LeafAllocation;
      };
    };
    type Anchor = {
      id: string;
      kind: string;
      meshAnchorNodeId?: string;
      anchorNodeId: string;
      rotation?: Quat4;
      position?: V3;
    };
    type Frame = { tangent: V3; normal: V3 };
    type Node = {
      id: string;
      type?: string;
      pos: V3;
      phytomer?: Phytomer;
      frame?: Frame;
      edgeIds?: number[];
    };
    type Edge = { id: number; organAnchors?: Anchor[] };
    type Mesh = {
      name: string;
      isEnabled(): boolean;
      getBoundingInfo(): {
        boundingBox: {
          minimumWorld: V3;
          maximumWorld: V3;
        };
      };
    };

    const w = window as unknown as {
      __skinplantGraph?: { nodes: Map<string, Node>; edges: Map<number, Edge> };
      __debugScene?: { meshes?: Mesh[] };
      __twinStore?: { getState(): unknown };
    };
    const g = w.__skinplantGraph;
    if (!g) return { error: 'no __skinplantGraph' };

    // Phytomer-bound nodes (main + side-shoot if frame walks all axes)
    const boundNodes: { node: Node; phyto: Phytomer }[] = [];
    for (const node of g.nodes.values()) {
      if (node.phytomer) boundNodes.push({ node, phyto: node.phytomer });
    }
    boundNodes.sort((a, b) => a.phyto.index - b.phyto.index);

    // Per-node anchor lookup (leaf_blade) — for rotation Quat4 + position
    const anchorByNode = new Map<string, Anchor>();
    for (const edge of g.edges.values()) {
      if (!edge.organAnchors) continue;
      for (const a of edge.organAnchors) {
        if (a.kind === 'leaf_blade') {
          const meshKey = a.meshAnchorNodeId ?? a.anchorNodeId;
          anchorByNode.set(meshKey, a);
        }
      }
    }

    // Skin meshes — per-anchor bbox lookup
    const meshes = (w.__debugScene?.meshes ?? []) as Mesh[];
    const leafBboxByAnchor = new Map<string, { bboxCm: number; xCm: number; yCm: number; zCm: number }>();
    for (const m of meshes) {
      if (!m.name.startsWith('skinplant_leaf_') || !m.isEnabled()) continue;
      const bb = m.getBoundingInfo().boundingBox;
      const dx = (bb.maximumWorld.x - bb.minimumWorld.x) * 100;
      const dy = (bb.maximumWorld.y - bb.minimumWorld.y) * 100;
      const dz = (bb.maximumWorld.z - bb.minimumWorld.z) * 100;
      const bboxCm = Math.hypot(dx, dy, dz);
      // mesh name 예: skinplant_leaf_main_n5 또는 skinplant_leaf_a1_n3
      leafBboxByAnchor.set(m.name, { bboxCm, xCm: dx, yCm: dy, zCm: dz });
    }

    // Stem geometry — main-axis nodes
    const stemNodes = [...g.nodes.values()].filter((n) => n.type === 'main-stem-node');
    stemNodes.sort((a, b) => a.pos.y - b.pos.y);
    const stemGeometry: {
      idx: number;
      x: number; y: number; z: number;
      dy: number;
      internodeLenCm: number | null;
    }[] = stemNodes.map((n, i) => {
      const prev = i > 0 ? stemNodes[i - 1] : null;
      const dy = prev ? (n.pos.y - prev.pos.y) * 100 : 0;
      const internodeLenCm = prev
        ? Math.hypot(
            (n.pos.x - prev.pos.x) * 100,
            (n.pos.y - prev.pos.y) * 100,
            (n.pos.z - prev.pos.z) * 100,
          )
        : 0;
      return {
        idx: i,
        x: n.pos.x * 100, y: n.pos.y * 100, z: n.pos.z * 100,
        dy,
        internodeLenCm,
      };
    });

    // Plant aggregate
    const stemHeightCm =
      stemNodes.length > 0
        ? (stemNodes[stemNodes.length - 1].pos.y - stemNodes[0].pos.y) * 100
        : 0;
    const visibleLeaves = boundNodes.filter(
      ({ phyto }) =>
        phyto.leaf.currentAreaCm2 > 0.5 && phyto.leaf.senescence.visibleAreaFactor > 0.05,
    ).length;

    // Per-node packed payload
    const perNode = boundNodes.map(({ node, phyto }) => {
      // Try to find mesh bbox by matching skinplant_leaf_*_n{index} pattern
      let matchedBbox: { bboxCm: number; xCm: number; yCm: number; zCm: number } | null = null;
      for (const [name, bbox] of leafBboxByAnchor) {
        // simple: contains _n{index}
        if (name.endsWith(`_n${phyto.index}`) || name.includes(`_n${phyto.index}_`)) {
          matchedBbox = bbox;
          break;
        }
      }
      const anchor = anchorByNode.get(node.id);
      const tangent = node.frame?.tangent;
      const normal = node.frame?.normal;
      const tDotN = tangent && normal ? tangent.x * normal.x + tangent.y * normal.y + tangent.z * normal.z : null;

      return {
        idx: phyto.index,
        nodeType: node.type ?? 'unknown',
        nodeId: node.id,
        // Lifecycle
        ageTT: Number(phyto.ageTT.toFixed(0)),
        initTT: Number(phyto.initiationTT.toFixed(0)),
        status: phyto.status,
        stage: phyto.leaf.stage,
        // Leaf core sizes
        leafAgeTT: Number(phyto.leaf.ageTT.toFixed(0)),
        leafExp: Number(phyto.leaf.expansionProgress.toFixed(3)),
        potentialAreaCm2: phyto.leaf.potentialAreaCm2 !== undefined
          ? Number(phyto.leaf.potentialAreaCm2.toFixed(0))
          : null,
        targetAreaCm2: Number(phyto.leaf.targetAreaCm2.toFixed(0)),
        currentAreaCm2: Number(phyto.leaf.currentAreaCm2.toFixed(0)),
        leafletCount: phyto.leaf.leafletCount,
        // Allocation 5-factor
        alloc_plantSrc: phyto.leaf.allocation?.plantSourceFactor !== undefined
          ? Number(phyto.leaf.allocation.plantSourceFactor.toFixed(2)) : null,
        alloc_axisSrc: phyto.leaf.allocation?.axisSourceFactor !== undefined
          ? Number(phyto.leaf.allocation.axisSourceFactor.toFixed(2)) : null,
        alloc_axisCap: phyto.leaf.allocation?.axisCapacityFactor !== undefined
          ? Number(phyto.leaf.allocation.axisCapacityFactor.toFixed(2)) : null,
        alloc_sideShoot: phyto.leaf.allocation?.sideShootAllocationFactor !== undefined
          ? Number(phyto.leaf.allocation.sideShootAllocationFactor.toFixed(2)) : null,
        alloc_stress: phyto.leaf.allocation?.stressFactor !== undefined
          ? Number(phyto.leaf.allocation.stressFactor.toFixed(2)) : null,
        alloc_final: phyto.leaf.allocation?.finalAllocationFactor !== undefined
          ? Number(phyto.leaf.allocation.finalAllocationFactor.toFixed(2)) : null,
        alloc_reason: phyto.leaf.allocation?.limitationReason ?? null,
        // Posture 7 분해 필드 (★ Iter 34 C3 — azimuth/twist/droop/petioleElev 제거)
        lightSeekTilt: phyto.leaf.posture.lightSeekingBladePlaneTiltDeg !== undefined
          ? Number(phyto.leaf.posture.lightSeekingBladePlaneTiltDeg.toFixed(1)) : null,
        petioleBaseElev: phyto.leaf.posture.petioleBaseElevationDeg !== undefined
          ? Number(phyto.leaf.posture.petioleBaseElevationDeg.toFixed(1)) : null,
        gravityDroop: phyto.leaf.posture.gravityDroopDeg !== undefined
          ? Number(phyto.leaf.posture.gravityDroopDeg.toFixed(1)) : null,
        senDroop: phyto.leaf.posture.senescenceDroopDeg !== undefined
          ? Number(phyto.leaf.posture.senescenceDroopDeg.toFixed(1)) : null,
        waterDroop: phyto.leaf.posture.waterStressDroopDeg !== undefined
          ? Number(phyto.leaf.posture.waterStressDroopDeg.toFixed(1)) : null,
        finalDroop: Number((phyto.leaf.posture.finalDroopDeg ?? 0).toFixed(1)),
        finalTilt: phyto.leaf.posture.finalBladePlaneTiltDeg !== undefined
          ? Number(phyto.leaf.posture.finalBladePlaneTiltDeg.toFixed(1)) : null,
        // Senescence
        senP: Number(phyto.leaf.senescence.progress.toFixed(2)),
        visArea: Number(phyto.leaf.senescence.visibleAreaFactor.toFixed(2)),
        // Mesh bbox (sizeFactor evidence)
        bboxCm: matchedBbox ? Number(matchedBbox.bboxCm.toFixed(1)) : null,
        bboxX: matchedBbox ? Number(matchedBbox.xCm.toFixed(1)) : null,
        bboxY: matchedBbox ? Number(matchedBbox.yCm.toFixed(1)) : null,
        bboxZ: matchedBbox ? Number(matchedBbox.zCm.toFixed(1)) : null,
        sizeFactor: matchedBbox && phyto.leaf.targetAreaCm2 > 0
          ? Number((phyto.leaf.currentAreaCm2 / phyto.leaf.targetAreaCm2).toFixed(2))
          : null,
        // Anchor rotation (Quat4) — vector check
        rotQuat: anchor?.rotation
          ? `(${anchor.rotation.x.toFixed(2)},${anchor.rotation.y.toFixed(2)},${anchor.rotation.z.toFixed(2)},${anchor.rotation.w.toFixed(2)})`
          : null,
        // Frame
        tangent: tangent ? `(${tangent.x.toFixed(2)},${tangent.y.toFixed(2)},${tangent.z.toFixed(2)})` : null,
        normal: normal ? `(${normal.x.toFixed(2)},${normal.y.toFixed(2)},${normal.z.toFixed(2)})` : null,
        tDotN: tDotN !== null ? Number(tDotN.toFixed(4)) : null,
        // GrowthContext
        axisId: phyto.growthContext?.axisId ?? 'unknown',
        isSideShoot: phyto.growthContext?.isSideShoot ?? false,
        parentVigor: phyto.growthContext?.parentVigorFactor !== undefined
          ? Number(phyto.growthContext.parentVigorFactor.toFixed(2)) : null,
      };
    });

    return {
      stemHeightCm: Number(stemHeightCm.toFixed(1)),
      nodeCount: stemNodes.length,
      visibleLeafCount: visibleLeaves,
      phytomerBoundCount: boundNodes.length,
      stemGeometry,
      perNode,
    };
  });
}

function renderMd(day: number, data: ReturnType<typeof dumpAtDay> extends Promise<infer T> ? T : never): string {
  if ('error' in (data as object)) {
    return `\n## D=${day}\n\n_${(data as { error: string }).error}_\n`;
  }
  const d = data as {
    stemHeightCm: number;
    nodeCount: number;
    visibleLeafCount: number;
    phytomerBoundCount: number;
    stemGeometry: { idx: number; x: number; y: number; z: number; dy: number; internodeLenCm: number }[];
    perNode: Record<string, unknown>[];
  };
  let s = `\n---\n\n## D=${day}\n\n`;
  s += `**Plant**: stemHeight=${d.stemHeightCm}cm, nodeCount=${d.nodeCount}, visibleLeaves=${d.visibleLeafCount}, phytomerBound=${d.phytomerBoundCount}\n\n`;

  if (d.perNode.length === 0) {
    s += `_No phytomer-bound nodes_\n`;
    return s;
  }

  // Split main vs side-shoot
  const main = d.perNode.filter((n) => !n.isSideShoot);
  const side = d.perNode.filter((n) => n.isSideShoot);

  function renderSection(title: string, rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return `\n### ${title}\n\n_(none)_\n`;
    let out = `\n### ${title} (${rows.length} nodes)\n\n`;
    // Table 1 — Lifecycle + sizes
    out += `#### Lifecycle + Sizes\n\n`;
    out += `| idx | axisId | status | stage | ageTT | initTT | leafExp | potential | target | current | leaflets |\n`;
    out += `|----|--------|--------|-------|-------|--------|---------|-----------|--------|---------|----------|\n`;
    for (const r of rows) {
      out += `| ${r.idx} | ${r.axisId} | ${r.status} | ${r.stage} | ${r.ageTT} | ${r.initTT} | ${r.leafExp} | ${r.potentialAreaCm2 ?? '-'} | ${r.targetAreaCm2} | ${r.currentAreaCm2} | ${r.leafletCount} |\n`;
    }

    out += `\n#### Allocation 5-factor (Iter 30)\n\n`;
    out += `| idx | plantSrc | axisSrc | axisCap | sideShoot | stress | final | reason |\n`;
    out += `|----|----------|---------|---------|-----------|--------|-------|--------|\n`;
    for (const r of rows) {
      out += `| ${r.idx} | ${r.alloc_plantSrc ?? '-'} | ${r.alloc_axisSrc ?? '-'} | ${r.alloc_axisCap ?? '-'} | ${r.alloc_sideShoot ?? '-'} | ${r.alloc_stress ?? '-'} | ${r.alloc_final ?? '-'} | ${r.alloc_reason ?? '-'} |\n`;
    }

    out += `\n#### Posture 9-필드 (Iter 30 Phase 5)\n\n`;
    out += `| idx | azimuth° | lightSeek° | petioleBase° | gravity° | sen° | water° | finalDroop° | finalTilt° | twist° |\n`;
    out += `|----|----------|------------|--------------|----------|------|--------|-------------|------------|--------|\n`;
    for (const r of rows) {
      out += `| ${r.idx} | ${r.lightSeekTilt ?? '-'} | ${r.petioleBaseElev ?? '-'} | ${r.gravityDroop ?? '-'} | ${r.senDroop ?? '-'} | ${r.waterDroop ?? '-'} | ${r.finalDroop} | ${r.finalTilt ?? '-'} |\n`;
    }

    out += `\n#### Mesh bbox + sizeFactor + Quat\n\n`;
    out += `| idx | bbox(cm) | bboxX | bboxY | bboxZ | sizeFactor | rotQuat(x,y,z,w) |\n`;
    out += `|----|----------|-------|-------|-------|------------|------------------|\n`;
    for (const r of rows) {
      out += `| ${r.idx} | ${r.bboxCm ?? '-'} | ${r.bboxX ?? '-'} | ${r.bboxY ?? '-'} | ${r.bboxZ ?? '-'} | ${r.sizeFactor ?? '-'} | ${r.rotQuat ?? '-'} |\n`;
    }

    out += `\n#### Frame + GrowthContext\n\n`;
    out += `| idx | tangent | normal | t·n | parentVigor | senP | visArea |\n`;
    out += `|----|---------|--------|-----|-------------|------|---------|\n`;
    for (const r of rows) {
      out += `| ${r.idx} | ${r.tangent ?? '-'} | ${r.normal ?? '-'} | ${r.tDotN ?? '-'} | ${r.parentVigor ?? '-'} | ${r.senP} | ${r.visArea} |\n`;
    }
    return out;
  }

  s += renderSection('Main-axis leaf nodes', main);
  s += renderSection('Side-shoot leaf nodes', side);

  // Stem geometry
  s += `\n### Stem geometry (main-axis ${d.stemGeometry.length} nodes)\n\n`;
  s += `| idx | x(cm) | y(cm) | z(cm) | Δy(cm) | internodeLen(cm) |\n`;
  s += `|----|-------|-------|-------|--------|------------------|\n`;
  for (const sg of d.stemGeometry) {
    s += `| ${sg.idx} | ${sg.x.toFixed(1)} | ${sg.y.toFixed(1)} | ${sg.z.toFixed(1)} | ${sg.dy.toFixed(2)} | ${sg.internodeLenCm.toFixed(2)} |\n`;
  }

  return s;
}

test.describe('Iter 31 Phase 0.0 — Multi-timepoint leaf node data dump', () => {
  test('MULTI-TIMEPOINT-D10-D90: Generate markdown table for all 9 days', async ({ page }) => {
    test.setTimeout(600_000);  // 10 minutes max for 9 days

    await initOnce(page);

    let md = `# Iter 31 Phase 0.0 — Multi-timepoint Leaf Node Data\n\n`;
    md += `> 9 시점 (D=10/20/30/40/50/60/70/80/90) 각 leaf-bearing node 전체 데이터.\n`;
    md += `> Source: \`tests/architecture/zz-iter31-multi-timepoint-dump.spec.ts\`\n`;
    md += `> Iter 31 Plan §0.99 (Phase 0.0).\n`;
    md += `> Generated: ${new Date().toISOString()}\n`;
    md += `> Branch + commit: iter30-hotfix-and-allocation @ 92aeff6 (Iter 30 종료 + Iter 31 미진행)\n\n`;
    md += `각 시점 데이터는 다음 5 분류 표로 분해:\n`;
    md += `1. Lifecycle + Sizes (ageTT/leafExp/potential/target/current)\n`;
    md += `2. Allocation 5-factor (Iter 30 Phase 2)\n`;
    md += `3. Posture 9-필드 (Iter 30 Phase 5)\n`;
    md += `4. Mesh bbox + sizeFactor + rotation Quat\n`;
    md += `5. Frame (tangent/normal) + GrowthContext\n\n`;
    md += `**해석 가이드**:\n`;
    md += `- \`leafExp\` < 0.05 = 어린 leaf (산식 막 시작)\n`;
    md += `- \`alloc_reason\` ≠ none → finalAllocationFactor < 0.95 (limitation 작동)\n`;
    md += `- \`bbox\` ≫ \`sqrt(target)\` → petiole/rachis 길이 dominance (R5 결함 evidence)\n`;
    md += `- \`tangent\` ≠ (0,1,0) → curved stem (R4 frame normal 결함 가능)\n`;
    md += `- \`Δy\` < 1cm → R6 horizontal stem 결함\n`;

    for (const day of DAYS) {
      await setDay(page, day);
      const data = await dumpAtDay(page);
      // eslint-disable-next-line no-console
      console.log(`========== D=${day} dumped ==========`);
      md += renderMd(day, data);
    }

    await fs.writeFile(OUT_PATH, md, 'utf-8');
    // eslint-disable-next-line no-console
    console.log(`Multi-timepoint markdown written to: ${OUT_PATH}`);
  });
});
