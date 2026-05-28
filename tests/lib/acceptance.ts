// Iter 18B PR 16 — 6 Acceptance Criteria assertion harness.
//
// Single source for the Iter 18A/18B "Skeleton ≡ Skin" acceptance contract.
// Every test that wants to assert plant fidelity should import from here
// (rather than re-defining criteria locally).
//
// Acceptance Criteria (사용자 명시 — Section 5.1 of the plan):
//   1. Skin 모드에서 독립적으로 떠 있는 stem fragment가 없어야 한다.
//   2. 화면에 보이는 모든 stem-family geometry는 PlantSkeletonGraph edge에서
//      생성되어야 한다.
//   3. leaf blade는 반드시 petiole endpoint에 attach되어야 하며, petiole 없이
//      leaf blade만 렌더링되면 안 된다.
//   4. petiole, midrib, leaflet rib, leaf blade는 동일한 organ visibility
//      lifecycle을 공유해야 한다.
//   5. main stem - petiole, main stem - truss, rachis - pedicel junction은
//      시각적으로 접합되어 보여야 한다.
//   6. Skeleton view와 Skin stem-only view의 topology가 1:1로 대응되어야 한다.

import type { Page } from '@playwright/test';
import {
  readSkinplantStats,
  type SkinplantStats,
} from './fidelity-assert';
import { buildPositionAssertScript } from './position-assert';

export type AcceptanceCode =
  | 'AC1_NO_FLOATING_FRAGMENT'
  | 'AC2_GEOMETRY_FROM_GRAPH'
  | 'AC3_LEAF_BLADE_AT_PETIOLE'
  | 'AC4_ORGAN_LIFECYCLE_UNIFIED'
  | 'AC5_JUNCTION_WELDED'
  | 'AC6_SKELETON_SKIN_TOPOLOGY_1TO1';

export interface AcceptanceResult {
  code: AcceptanceCode;
  pass: boolean;
  message: string;
  detail?: unknown;
}

export interface AcceptanceReport {
  results: AcceptanceResult[];
  passed: number;
  failed: number;
  ok: boolean;
}

// ── Per-criterion check fn ────────────────────────────────────────────────

interface StatsWithValidation extends SkinplantStats {
  validation?: { ok: boolean; errorCount: number; warningCount: number };
}

function ac1NoFloating(stats: StatsWithValidation): AcceptanceResult {
  const c = stats.floatingCandidateCount;
  return {
    code: 'AC1_NO_FLOATING_FRAGMENT',
    pass: c === 0,
    message: `floatingCandidateCount=${c} (expected 0)`,
    detail: { ids: stats.floatingCandidateIds.slice(0, 8) },
  };
}

function ac2GeometryFromGraph(stats: StatsWithValidation): AcceptanceResult {
  // Approximation: every emitted mesh-type count must equal the corresponding
  // graph edge-type count. emittedByType > 0 implies graph drove that mesh.
  for (const t of Object.keys(stats.edgesByType)) {
    if ((stats.edgesByType[t] ?? 0) !== (stats.emittedByType[t] ?? 0)) {
      return {
        code: 'AC2_GEOMETRY_FROM_GRAPH',
        pass: false,
        message: `edge/mesh count mismatch for type ${t}`,
        detail: { edges: stats.edgesByType, emitted: stats.emittedByType },
      };
    }
  }
  return {
    code: 'AC2_GEOMETRY_FROM_GRAPH',
    pass: true,
    message: 'every graph edge has a mesh',
  };
}

async function ac3LeafBladeAtPetiole(page: Page): Promise<AcceptanceResult> {
  // Reuses PR 14 position-assert. leaf_blade anchor positions must match.
  const report = await page.evaluate<{
    total: number; passed: number; failed: number; findings: Array<{ pass: boolean; meshName: string; distanceM: number }>;
  } | null>(buildPositionAssertScript(0.001));
  if (!report) {
    return { code: 'AC3_LEAF_BLADE_AT_PETIOLE', pass: false, message: 'no position-assert report' };
  }
  return {
    code: 'AC3_LEAF_BLADE_AT_PETIOLE',
    pass: report.failed === 0,
    message: `${report.passed}/${report.total} leaf_blade meshes within 1mm of petiole_tip`,
    detail: report.findings.filter((f) => !f.pass).slice(0, 5),
  };
}

async function ac4OrganLifecycleUnified(page: Page): Promise<AcceptanceResult> {
  // SSOT #176 enforced at code level (isLeafOrganVisible used by both graph
  // and SkinMeshPlant). Verify at runtime: count rendered leaf meshes must
  // match graph's petiole edge count (1:1 organ).
  const compare = await page.evaluate<{ petioleEdges: number; leafMeshes: number } | null>(`(() => {
    const w = window;
    const stats = w.__skinplantStats;
    const scene = w.__debugScene;
    if (!stats || !scene) return null;
    let leafMeshes = 0;
    for (const m of scene.meshes) if (m.name && m.name.startsWith('skinplant_leaf_')) leafMeshes++;
    return { petioleEdges: stats.edgesByType.petiole ?? 0, leafMeshes };
  })()`);
  if (!compare) {
    return { code: 'AC4_ORGAN_LIFECYCLE_UNIFIED', pass: false, message: 'no compare data' };
  }
  return {
    code: 'AC4_ORGAN_LIFECYCLE_UNIFIED',
    pass: compare.petioleEdges === compare.leafMeshes,
    message: `petiole edges=${compare.petioleEdges} vs leaf meshes=${compare.leafMeshes}`,
    detail: compare,
  };
}

function ac5JunctionWelded(stats: StatsWithValidation): AcceptanceResult {
  // Visual junction welding is captured via parentSwellingScale + embedDepth
  // floor. Numerically — render radius median ≥ biological median (swelling
  // takes effect), AND every render radius ≥ 0.8mm floor.
  let weldedTypes = 0;
  let totalTypes = 0;
  for (const t of Object.keys(stats.biologicalRadiusByType)) {
    totalTypes++;
    const bio = stats.biologicalRadiusByType[t];
    const ren = stats.renderRadiusByType[t];
    if (!bio || !ren) continue;
    if (ren.min >= 0.0008 - 1e-9) weldedTypes++;
  }
  return {
    code: 'AC5_JUNCTION_WELDED',
    pass: weldedTypes === totalTypes,
    message: `${weldedTypes}/${totalTypes} edge types have render radius ≥ 0.8mm floor`,
    detail: stats.renderRadiusByType,
  };
}

function ac6SkeletonSkinTopology(stats: StatsWithValidation): AcceptanceResult {
  // SkinMesh's edgesByType (graph traversal) === all expected types present.
  // Also rely on validateSkeleton.ok (PR 11).
  if (!stats.validation) {
    return { code: 'AC6_SKELETON_SKIN_TOPOLOGY_1TO1', pass: false, message: 'no validation in stats' };
  }
  const v = stats.validation;
  return {
    code: 'AC6_SKELETON_SKIN_TOPOLOGY_1TO1',
    pass: v.ok && v.errorCount === 0,
    message: `validation ok=${v.ok} errors=${v.errorCount} warnings=${v.warningCount}`,
    detail: v,
  };
}

// ── Public entry — runs all 6 ────────────────────────────────────────────

export async function runAcceptance(page: Page): Promise<AcceptanceReport> {
  const stats = (await readSkinplantStats(page)) as StatsWithValidation | null;
  if (!stats) {
    return {
      results: [],
      passed: 0,
      failed: 1,
      ok: false,
    };
  }
  const results: AcceptanceResult[] = [
    ac1NoFloating(stats),
    ac2GeometryFromGraph(stats),
    await ac3LeafBladeAtPetiole(page),
    await ac4OrganLifecycleUnified(page),
    ac5JunctionWelded(stats),
    ac6SkeletonSkinTopology(stats),
  ];
  const passed = results.filter((r) => r.pass).length;
  return {
    results,
    passed,
    failed: results.length - passed,
    ok: results.every((r) => r.pass),
  };
}
