// Iter 18B PR 10 — Skeleton structural validation harness.
//
// Walks PlantSkeletonGraph and reports invariant violations. Used by:
//   - autonomous PR chain post-gate (numeric assertion)
//   - dev console diagnostics (window.__skinplantStats.validation)
//   - fidelity-assert acceptance harness
//
// Pure topology check — no rendering, no mesh, no Babylon dependency.

import type {
  PlantSkeletonGraph,
  SkeletonEdge,
  SkeletonEdgeType,
} from './PlantSkeletonGraph';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationFinding {
  severity: ValidationSeverity;
  code: string;
  message: string;
  edgeId?: string;
  nodeId?: string;
}

export interface ValidationReport {
  ok: boolean;
  findings: ValidationFinding[];
  summary: {
    edgeCount: number;
    nodeCount: number;
    edgesByType: Partial<Record<SkeletonEdgeType, number>>;
    organAnchorCount: number;
    rootEdgeId: string;
  };
}

export function validateSkeleton(graph: PlantSkeletonGraph): ValidationReport {
  const findings: ValidationFinding[] = [];

  // 1. Root edge exists.
  const root = graph.edges.get(graph.rootEdgeId);
  if (!root) {
    findings.push({
      severity: 'error',
      code: 'ROOT_EDGE_MISSING',
      message: `rootEdgeId="${graph.rootEdgeId}" not found in edges map`,
    });
  } else if (root.type !== 'mainStem') {
    findings.push({
      severity: 'error',
      code: 'ROOT_NOT_MAINSTEM',
      message: `root edge type="${root.type}", expected "mainStem"`,
      edgeId: graph.rootEdgeId,
    });
  }

  // 2. Every edge has bonePath with ≥ 1 bone.
  for (const [eid, edge] of graph.edges) {
    if (edge.bonePath.length === 0) {
      findings.push({
        severity: 'error',
        code: 'EMPTY_BONE_PATH',
        message: `edge ${eid} (type=${edge.type}) has empty bonePath`,
        edgeId: eid,
      });
    }
  }

  // 3. Every edge's start/end nodes exist.
  for (const [eid, edge] of graph.edges) {
    if (!graph.nodes.has(edge.startNodeId)) {
      findings.push({
        severity: 'error',
        code: 'MISSING_START_NODE',
        message: `edge ${eid} startNodeId="${edge.startNodeId}" not in nodes map`,
        edgeId: eid,
      });
    }
    if (!graph.nodes.has(edge.endNodeId)) {
      findings.push({
        severity: 'error',
        code: 'MISSING_END_NODE',
        message: `edge ${eid} endNodeId="${edge.endNodeId}" not in nodes map`,
        edgeId: eid,
      });
    }
  }

  // 4. parentEdgeId references existing edge (or null for root).
  for (const [eid, edge] of graph.edges) {
    if (edge.parentEdgeId !== null && !graph.edges.has(edge.parentEdgeId)) {
      findings.push({
        severity: 'error',
        code: 'BAD_PARENT_REF',
        message: `edge ${eid} parentEdgeId="${edge.parentEdgeId}" not in edges map`,
        edgeId: eid,
      });
    }
  }

  // 5. Every organAnchor.anchorNodeId references existing node.
  let organAnchorCount = 0;
  for (const [eid, edge] of graph.edges) {
    if (!edge.organAnchors) continue;
    for (const oa of edge.organAnchors) {
      organAnchorCount++;
      if (!graph.nodes.has(oa.anchorNodeId)) {
        findings.push({
          severity: 'error',
          code: 'BAD_ANCHOR_NODE_REF',
          message: `edge ${eid} organAnchor ${oa.id} anchorNodeId="${oa.anchorNodeId}" not in nodes map`,
          edgeId: eid,
          nodeId: oa.anchorNodeId,
        });
      }
    }
  }

  // 6. petiole edges should have leaf_blade organAnchor.
  for (const [eid, edge] of graph.edges) {
    if (edge.type !== 'petiole') continue;
    const hasLeafBlade = (edge.organAnchors ?? []).some((a) => a.kind === 'leaf_blade');
    if (!hasLeafBlade) {
      findings.push({
        severity: 'warning',
        code: 'PETIOLE_MISSING_LEAF_BLADE_ANCHOR',
        message: `petiole edge ${eid} has no leaf_blade OrganAnchor (SSOT #180 expected)`,
        edgeId: eid,
      });
    }
  }

  // 7. pedicel edges should have fruit + flower + calyx organAnchors.
  for (const [eid, edge] of graph.edges) {
    if (edge.type !== 'pedicel') continue;
    const kinds = new Set((edge.organAnchors ?? []).map((a) => a.kind));
    for (const required of ['fruit', 'flower', 'calyx'] as const) {
      if (!kinds.has(required)) {
        findings.push({
          severity: 'warning',
          code: 'PEDICEL_MISSING_ORGAN_ANCHOR',
          message: `pedicel edge ${eid} missing ${required} OrganAnchor`,
          edgeId: eid,
        });
      }
    }
  }

  // Summary stats.
  const edgesByType: Partial<Record<SkeletonEdgeType, number>> = {};
  for (const edge of graph.edges.values()) {
    edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
  }

  const ok = findings.every((f) => f.severity !== 'error');

  return {
    ok,
    findings,
    summary: {
      edgeCount: graph.edges.size,
      nodeCount: graph.nodes.size,
      edgesByType,
      organAnchorCount,
      rootEdgeId: graph.rootEdgeId,
    },
  };
}
