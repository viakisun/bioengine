# SkinEngine spec (Iter 18B, SSOT #181)

## Purpose

Skin Engine is the **rendering façade** that converts a
`PlantSkeletonGraph` into Babylon meshes. It's the only path through which
SkinMeshPlant produces visible geometry.

> **Full Skin is NOT a Skeleton tube overlay.** SkeletonGraph stores
> topology and anchors; SkinEngine interprets each edge/anchor through a
> per-organ geometry policy (tube, leaf-blade surface, fruit body, etc.).
> — User review #2

## Interface

```ts
import { defaultSkinEngine } from './defaultSkinEngine';

const result = defaultSkinEngine.render(graph, {
  seed, engine, cultivarKey, state, plantBase,
  scene, parent,
  stemOpts: { radialSegments: 8, rootRadiusScale: 1.15, parentSwellingScale: 1.25 },
});

// SkinEngineRenderResult
result.stemMesh           // Mesh | null — unified stem family mesh
result.stemFaceGroups     // Phase 5 cut metadata
result.stemEdgeIdByIdx
result.stemVertexEdgeTag
result.leafMeshes[]       // (PR 13 partial migration — currently empty)
result.organNodes[]       // (PR 13 partial migration — currently empty)
result.cotyledonMeshes[]  // (PR 13 partial migration — currently empty)
result.stats              // PlantStemFamilyMesh.stats + organ counters
```

## Per-organ geometry policy

| Skeleton component | Skin geometry | Why |
|---|---|---|
| mainStem / sideShoot edge | Tapered tube ring sweep (SDF-style) | Botanical stem, visible texture |
| petiole edge | Tapered tube ring sweep | Visible petiole — replaces the leafChunk-internal cylinder (Iter 18B PR 4-6) |
| peduncle edge | Tapered tube ring sweep | Part of unified stem mesh |
| rachis edge (sub-edges per knuckle) | Tapered tube ring sweep | Truss zig-zag spine |
| pedicel edge | Tapered tube ring sweep | Each floral site stalk |
| leaf_blade anchor | `createLeafChunkSkin` mesh (leaflets only) | Mesh-local leaflet layout — no internal cylinder. Anchored at petiole_tip. SSOT #182 |
| fruit / flower / calyx anchor | TrussFruitOrgansOnly per site | Body geometry at anchor; no extra stem stub |

## Iter 18B junction stitching (SSOT #178)

To prevent "꽂혀 있는 듯" appearance at thin parents, the stem tube builder
applies:

- `embedDepth = max(parentRadius * embedDepthFrac[type], DEFAULT_EMBED_DEPTH_FLOOR_M[type])`
  - floor (m): mainStem 0 / sideShoot 0.004 / petiole 0.0015 / peduncle 0.0020 /
    rachis 0.0010 / pedicel 0.0010
- `parentSwellingScale = 1.25` at junction nodes — parent radius +25%

## Iter 18B render radius floor (SSOT #177)

biological radius (engine value, edge.bonePath) is preserved as-is. A pixel-
visibility floor is applied only at render time:

```ts
RENDER_RADIUS_FLOOR_M = 0.0008  // 0.8 mm
```

`__skinplantStats.biologicalRadiusByType` vs `renderRadiusByType` lets dev
tools compare the two values side by side.

## Organ visibility lifecycle (SSOT #176)

A single predicate gate decides whether an organ renders:

```ts
import { isLeafOrganVisible, isTrussOrganVisible } from '../skeleton/SkeletonEngine';

if (!isLeafOrganVisible(leaf)) continue;     // skip petiole edge AND blade mesh
if (!isTrussOrganVisible(truss)) continue;   // skip peduncle/rachis/pedicel AND organ
```

Both buildTomatoSkeletonGraph (edge creation) and SkinMeshPlant (mesh
loop) consult the same predicate, so "petiole edge exists but no blade
mesh" (or vice versa) is impossible.

## Iter 18B partial migration

The 20-PR sprint moved the stem family through SkinEngine.render() but
deferred leaf / truss / cotyledon loops (they remain in SkinMeshPlant for
now). The interface returns empty arrays in those fields. Future iterations
may complete the migration without changing the interface shape.

## Test harness

- `tests/lib/pixel-diff.ts` — bbox-aware pixel diff (boilerplate visual regression)
- `tests/lib/fidelity-assert.ts` — numeric invariants + 2-shot self-heal scaffold
- `tests/lib/position-assert.ts` — leaf_blade anchor position assertion
- `tests/lib/acceptance.ts` — 6 Acceptance Criteria gate
- `tests/plant-calibration/iter18b-*.spec.ts` — autonomous PR chain verification

## See also

- `src/plant/skin/SkinEngine.ts` — interface
- `src/plant/skin/defaultSkinEngine.ts` — default implementation
- `src/plant/skin/StemFamilyTubeNetworkBuilder.ts` — tube + junction code
- `src/plant/skin/buildPlantSkinMesh.ts` — wrapper
- `docs/spec/SkeletonEngine.md` — upstream SSOT
- `docs/spec/skin-vs-showcase.md` — Showcase legacy contract
