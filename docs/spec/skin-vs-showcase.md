# Skin Mode vs Showcase Mode — Iter 18B dev doc

## Two renderers, one PlantBase

FarmSim renders the showcase plant through two parallel rendering paths.
Both consume the same upstream `PlantBase` geometry snapshot from the engine
but produce different Babylon mesh hierarchies. They are toggled by the
`useImplicitMesh` store flag.

| Aspect | Showcase (default) | Skin (useImplicitMesh = true) |
|---|---|---|
| Stem family mesh | per-axis tubes via `createStemMeshFromSegments` + per-leaf `createCurvedTube` petiole | Single unified mesh via `buildPlantSkinMesh` → `StemFamilyTubeNetworkBuilder` (SDF-style tube network) |
| Leaf blade | `createLeafMeshFromNode` → `buildLeafChunk` (embeds petiole + rachis + petiolule cylinders) | `createLeafBladeOnlyMesh` → `buildLeafChunkSkin` (leaflets only — no internal cylinders) |
| Truss organs (peduncle/rachis/pedicel) | Explicit per-tier tubes via `createTrussNodeFromBase` | Part of the unified stem family mesh (SkeletonGraph edges) |
| Truss bodies (fruit / calyx / flower) | `createTrussNode` per site | `createTrussFruitOrgansOnly` per site (body / calyx / flower only — no stem stub) |
| Cotyledon | `applyCotyledonChunk` | Same |
| SkeletonGraph dependency | None (renders directly from PlantBase fields) | Required (`buildPlantSkeleton` is the SSOT) |
| Iter 18B fidelity refactor | Untouched (legacy contract) | Active scope |

## Why Showcase stays legacy

Iter 18B (Skeleton ≡ Skin) is a refactor of the **Skin** renderer only.
Showcase remains the historical baseline and is exempt from the new SSOT
constraints because:

- ShowcasePlant has a separate `createCurvedTube` petiole path that's
  visually equivalent to (but not identical to) the SkinMeshPlant's SDF
  petiole, and existing visual regressions are calibrated against it.
- Migrating Showcase to SkinEngine would change every recorded baseline
  PNG in the repo with no botanical benefit.
- Both renderers should continue to look approximately the same at
  ordinary camera distances; minor differences at junction welds /
  petiole thickness are accepted.

## Backward-compatibility guarantees (Iter 18B)

The following must hold across the 20-PR sprint and beyond:

1. `buildLeafChunk` signature and output are byte-perfect identical to
   pre-Iter-18B. ShowcasePlant's `createLeafMeshFromNode` continues to
   route through it.
2. `createCurvedTube` is unchanged.
3. `createTrussNode` / `createTrussNodeFromBase` are unchanged.
4. ShowcasePlant's `buildFromState` is unchanged.
5. Baseline images captured against ShowcasePlant (e.g. legacy
   `single-plant-closeups.spec.ts`) continue to pass byte-perfect.

If a future iteration wants to converge Showcase onto SkinEngine,
it must be a separately scoped Iter with its own baseline capture
and visual regression budget — not piggybacked onto a Skin-mode PR.

## Where to add Skin-only behavior

- New visual feature in Skin? Add it to `defaultSkinEngine` or a wrapping
  SkinEngine variant.
- New SkeletonGraph anchor needed? Add it in `buildTomatoSkeletonGraph` +
  expose via `OrganAnchor` (Iter 18B SSOT #180).
- New PlantBase field referenced from rendering? Add a SkeletonEngine
  helper instead — keep the SSOT.

## See also

- `docs/calibration-checkpoint-reports/v0.13-iter18b-skeleton-skin-fidelity.md`
  — full Iter 18B audit (PR 19).
- SkeletonGraph spec: `src/plant/skeleton/PlantSkeletonGraph.ts` (inline).
- SkinEngine interface: `src/plant/skin/SkinEngine.ts` (inline).
