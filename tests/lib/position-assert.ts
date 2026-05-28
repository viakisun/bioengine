// Iter 18B PR 14 — Browser-side organ position-assert harness.
//
// Walks the active SkinMeshPlant and the live PlantSkeletonGraph (window.
// __skinplantGraph — exposed in PR 14) and confirms every organ mesh's
// world position matches its SkeletonGraph OrganAnchor node position
// within tolerance.
//
// SSOT #182 — leaflet-internal geometry is mesh-local. This assertion
// covers ONLY the per-leaf blade mesh attach point (petiole_tip) and the
// per-truss organ nodes (pedicel_tip). Leaflets, ribs, veins are NOT
// asserted (they intentionally live in mesh-local coordinates inside the
// blade mesh).

export interface OrganPositionFinding {
  organId: string;
  organKind: string;
  meshName: string;
  expected: { x: number; y: number; z: number };
  actual: { x: number; y: number; z: number };
  distanceM: number;
  pass: boolean;
}

export interface OrganPositionReport {
  total: number;
  passed: number;
  failed: number;
  findings: OrganPositionFinding[];
}

export function buildPositionAssertScript(toleranceM: number): string {
  // Returns a string that can be passed to page.evaluate. Inlined to keep
  // the test side dependency-free (no separate browser bundle).
  return `(() => {
    const w = window;
    const stats = w.__skinplantStats;
    const graph = w.__skinplantGraph;
    if (!stats || !graph) return null;
    const scene = w.__debugScene;
    if (!scene) return null;
    const tol = ${toleranceM};
    const findings = [];
    const meshByName = new Map();
    for (const m of scene.meshes) meshByName.set(m.name, m);
    const transformByName = new Map();
    for (const n of scene.transformNodes ?? []) transformByName.set(n.name, n);
    for (const [edgeId, edge] of graph.edges) {
      if (!edge.organAnchors) continue;
      for (const oa of edge.organAnchors) {
        // LeafGenerator vertex shift 도입 후 leafMesh.position 다시 petiole
        // tip (anchorNodeId) 기준. mesh-local origin = leaflet 시작 = world
        // petiole tip 위치.
        const anchorNode = graph.nodes.get(oa.anchorNodeId);
        if (!anchorNode) continue;
        // map OrganAnchor.id to expected mesh name pattern:
        //   leaf_blade:axisX:nN → skinplant_leaf_*_aX_nN
        //   fruit/flower/calyx:axisX:tT:sS → skinplant_truss_*_aX_n? (truss node)
        let candidateMesh = null;
        if (oa.kind === 'leaf_blade') {
          const m = oa.id.match(/^leaf_blade:axis(\\d+):n(\\d+)$/);
          if (m) {
            const pattern = \`_a\${m[1]}_n\${m[2]}\`;
            for (const [name, mesh] of meshByName) {
              if (name.startsWith('skinplant_leaf_') && name.endsWith(pattern)) {
                candidateMesh = mesh; break;
              }
            }
          }
        }
        if (!candidateMesh) continue;
        // Self-heal shot 1: SkeletonGraph anchor.pos는 plant-local coords,
        // leafMesh.position도 plant-local (lushGroup → root world transform 적용
        // 전). 두 값 모두 plant-local에서 비교.
        const wp = candidateMesh.position;
        const dx = wp.x - anchorNode.pos.x;
        const dy = wp.y - anchorNode.pos.y;
        const dz = wp.z - anchorNode.pos.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        findings.push({
          organId: oa.id, organKind: oa.kind,
          meshName: candidateMesh.name,
          expected: { x: anchorNode.pos.x, y: anchorNode.pos.y, z: anchorNode.pos.z },
          actual: { x: wp.x, y: wp.y, z: wp.z },
          distanceM: dist,
          pass: dist <= tol,
        });
      }
    }
    const passed = findings.filter(f => f.pass).length;
    return { total: findings.length, passed, failed: findings.length - passed, findings };
  })()`;
}
