# SkeletonEngine spec (Iter 18B, SSOT #180)

## Purpose

Skeleton Engine is the **single source of truth** for plant topology +
organ anchor positions. Every visible geometry in skin rendering flows from
this graph; nothing in the SkinEngine reads PlantBase or engine state
directly for positional decisions.

## Entry point

```ts
import { buildPlantSkeleton, type PlantSkeletonGraph } from './SkeletonEngine';

const graph: PlantSkeletonGraph = buildPlantSkeleton(plantBase, {
  crop: 'tomato',      // (default)
  curveDivisions: 2,
});
```

## Graph shape

```ts
PlantSkeletonGraph {
  nodes: Map<string, SkeletonNode>;
  edges: Map<string, SkeletonEdge>;
  rootEdgeId: string;  // = main stem edge id
}

SkeletonNode {
  id, pos: V3, radius: number, edgeIds: string[]
}

SkeletonEdge {
  id, type, startNodeId, endNodeId,
  bonePath: SkeletonBone[],      // densified centerline
  parentEdgeId, cuttable, semanticLabel,
  attachedOrganIds: string[],    // legacy (Phase 5 cut hierarchy)
  organAnchors?: OrganAnchor[],  // Iter 18B PR 8 — structured anchors
}

OrganAnchor {
  id, kind: 'leaf_blade' | 'fruit' | 'flower' | 'calyx',
  anchorNodeId: string,
}
```

## Edge types (SkeletonEdgeType)

```
mainStem | sideShoot | petiole | peduncle | rachis | pedicel
```

Each plant has exactly one `mainStem` (the root edge). Petiole edges hang
off the main stem (and side shoots). Peduncle/rachis/pedicel form the truss
sub-hierarchy.

## Organ anchor coverage

| Edge type | OrganAnchor kinds | Notes |
|---|---|---|
| petiole | `leaf_blade` | anchorNodeId = petiole_tip |
| pedicel | `flower`, `fruit`, `calyx` | anchorNodeId = pedicel_tip |
| mainStem / sideShoot / peduncle / rachis | (none) | structure-only |

Leaflet positions inside the leaf blade are **intentionally mesh-local**
(SSOT #182). They have no SkeletonGraph anchor. Position-assert (PR 14)
therefore checks the petiole_tip → leaf blade attach point only.

## Validation

```ts
import { validateSkeleton } from './SkeletonEngine';

const report = validateSkeleton(graph);
if (!report.ok) console.error(report.findings);
```

Checks (7 invariants):

1. `rootEdgeId` resolves to an edge with `type === 'mainStem'`.
2. Every edge has `bonePath.length >= 1`.
3. Every edge's start/end nodes exist in the nodes map.
4. `parentEdgeId` references exist (or null for the root).
5. Every `organAnchors[i].anchorNodeId` references an existing node.
6. Every `petiole` edge has a `leaf_blade` OrganAnchor.
7. Every `pedicel` edge has `flower` + `fruit` + `calyx` OrganAnchors.

## Forbidden: bypassing the SSOT

Direct imports of `buildTomatoSkeletonGraph` are confined to `SkeletonEngine.ts`.
All consumers (SkinMeshPlant, SkeletonOverlay, tests, audit harnesses) MUST
go through `buildPlantSkeleton`. This single seam:

- centralises crop-specific dispatch (`tomato` today, `cherry` / `pepper`
  tomorrow);
- enforces `OrganAnchor` enrichment uniformly;
- gates future SkeletonGraph changes (e.g. junction-stitching tweaks) so
  every caller picks them up.

## See also

- `src/plant/skeleton/SkeletonEngine.ts` — entry implementation
- `src/plant/skeleton/PlantSkeletonGraph.ts` — type definitions
- `src/plant/skeleton/validateSkeleton.ts` — invariant checker
- `docs/spec/SkinEngine.md` — consumer-side façade
- `docs/spec/skin-vs-showcase.md` — why Showcase doesn't go through here
