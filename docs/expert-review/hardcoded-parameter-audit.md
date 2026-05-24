# Hardcoded Parameter Audit for Expert Review Export

Generated: 2026-05-24
v3.0 hybrid FSPM migration applied: 2026-05-24 — see
`.claude/plans/plan-tomato-truss-anatomy-magical-pancake.md`.

## Status after v3.0 migration

Most rows in the table below have been resolved.

- **Resolved (moved to JSONC or single source of truth):**
  - First truss node, truss interval → `cultivars/*.jsonc.morphology`
  - Flowers per truss + per-order overrides →
    `cultivars/*.jsonc.reproductive.trussOrderProfile` and scenarios
  - Side-shoot activation, pruning rate, leaf scale, internode length →
    `models/training/*.jsonc`
  - Side-shoot fruiting toggle → `training.*.sideShoot.fruitingEnabled`
  - Peduncle radius, length, stiffness → `tomgro-v1.jsonc.trussAnatomy.peduncle`
  - Fruit density mismatch → `PhysicsModel` now reads
    `ACTIVE_MODEL.fruitGrowth.density_g_per_cm3`
  - Calendar-day node emergence → `tomgro-v1.jsonc.organogenesis.phyllochronGDD`
  - Plant max height (wire compression) → `training.*.maxPlantHeightCm`
  - Fruit visual sigmoid → hybrid path now uses CoreModel FruitCohort
    as the single source for diameter/ripenStage/color
- **Deferred (intentionally kept in TS):**
  - Mature leaf area 880 cm² (algorithmic default)
  - Stem radius clamps, cambial growth, stem density (heavy
    biomechanics — separate calibration pass)
  - Truss rachis/pedicel/calyx anatomy in renderer-side
    `src/plant/TrussGenerator.ts` (renderer geometry, not biology;
    layoutTruss invariant must stay stable)
  - LAI cap + fruit-fraction cap coefficients in `SinkAllocation.ts`
    (literature constants — should still get version tags)

The legacy sigmoid path inside `GrowthModel.computePlantState` is
retained as a fallback for the multi-plant Greenhouse mode where
CoreModel isn't co-stepped; it will go away when every render path
supplies a `SimulationContext.physiologyState`.

This audit separates tomato growth and anatomy parameters that should become model data from constants that are acceptable as algorithmic or render-only implementation details. It covers the current engine and visual paths inspected in:

- `packages/tomato-engine/src`
- `packages/tomato-engine/models`
- `src/plant`
- `src/twin`

The paired strict JSON export is `docs/expert-review/tomato-growth-model.review.json`.

## Summary

The runtime already has a strong JSONC model layer for TOMGRO/TOMSIM and cultivar-level fruit physiology. The biggest remaining issue is that several biological and anatomical values still live in TypeScript, especially in the sigmoid `GrowthModel`, side-shoot activation, stem physics, and truss layout. Those values should move into the model schema before expert calibration becomes comfortable.

Single-Plant mode is more scientifically meaningful than the older visual fallback because it overlays `CoreModel` physiology onto the rendered plant. However, visual truss anatomy and side-shoot fruiting are still partly separate from the scientific source-sink model.

## Scientific Should Move To JSON

These parameters encode biological behavior, cultivar behavior, or greenhouse training practice. They should be promoted into `tomgro-v1.jsonc`, cultivar JSONC, or a new architecture/training JSON section.

| Area | Current location | Current value or rule | Why it should move |
|---|---|---:|---|
| First truss node | `PlantGenome.ts` | Gaussian 9 ± 1, clamp 7-11 | Cultivar and propagation dependent; experts should tune it. |
| Truss interval | `PlantGenome.ts` | 3 nodes | Correct for current Tomimaru target, but should be cultivar/training data. |
| Flowers per truss fallback | `PlantGenome.ts` | Gaussian 5 ± 1, clamp 3-8 | Conflicts with cultivar JSON and does not support truss-order profile. |
| Anthesis to fruit-set visual lag | `GrowthModel.ts` | `fruitAge = flowerAge - 12` | Current plan wants 5-7 days; must be data. |
| Flower fade after set | `GrowthModel.ts` | 14 days | Good as current default, but should be cultivar/model data. |
| Within-truss flower delay | `GrowthModel.ts` | 2 days per flower index | Important for visible differentiation and anthesis spread. |
| Mature leaf area | `GrowthModel.ts` | 880 cm2 | Biological parameter; likely cultivar/environment dependent. |
| Leaf mass coefficient | `GrowthModel.ts` | 25 g times size and maturity terms | Biological/biomechanical parameter. |
| Internode elongation K | `GrowthModel.ts` | 0.4 | Growth curve parameter. |
| Side-shoot activation | `GrowthModel.ts` | base 0.04, dominance 0.5, delay 5, light factor 0.4 | Directly controls branching architecture. |
| Side-shoot pruning | `GrowthModel.ts` | defoliationAggressiveness × 0.03 daily | Training practice, not generic algorithm. |
| Side-shoot fruiting | `GrowthModel.ts` | `truss: null` | User explicitly wants side shoots capable of fruiting. |
| Fruit density | `PhysicsModel.ts` | 1050 kg/m3 | Scientific constant; should align with `tomgro-v1.jsonc fruitGrowth.density_g_per_cm3`. |
| Stem density | `PhysicsModel.ts` | 800 kg/m3 | Biomechanical parameter. |
| Stem radius clamps | `PhysicsModel.ts` | min 2 mm, max 11.5 mm radius | Crop measurement and training dependent. |
| Cambial growth | `PhysicsModel.ts` | 0.7 mm2/day | Biological/biomechanical assumption needing source. |
| Truss bending arm | `PhysicsModel.ts` | 0.08 m | Anatomy/training dependent. |
| Peduncle length | `TrussGenerator.ts` | 0.10 + min(0.10, totalItems × 0.012) m | Visual anatomy should follow cultivar/truss type. |
| Pedicel length | `TrussGenerator.ts` | 25 mm + 15 mm for fruit | Likely too long for Tomimaru reference; should be cultivar anatomy. |
| Pedicel radius | `TrussGenerator.ts` | 1.4 mm base, 1.0 mm tip | Anatomy value. |
| Calyx reflex angle | `TrussGenerator.ts`, `SkeletonOverlay.ts` | 25 degrees outward | Photo/anatomy dependent. |
| Rachis zigzag | `TrussGenerator.ts` | Mostly smooth parabolic line today | Needs explicit zigzag/knuckle model for real truss anatomy. |
| LAI max in allocation | `SinkAllocation.ts` | 3.5 | Model-level constant; related value already exists in JSON as 3.6. |
| Fruit dry matter conversion in sink allocation | `SinkAllocation.ts` | 0.06 | Duplicate of `ACTIVE_MODEL.fruitGrowth.DM_percent`; should read JSON. |
| Fruit fraction cap coefficients | `SinkAllocation.ts` | 0.660 and 0.341 | Literature-backed, but should be versioned in model JSON. |

## Algorithmic Constant OK

These constants are math or implementation machinery. They do not need to become crop model parameters unless a future renderer or numerical method requires it.

| Area | Current location | Constant or rule | Why OK |
|---|---|---|---|
| Catmull-Rom basis | `StemGenerator.ts` | 0.5 basis coefficients | Mathematical interpolation definition. |
| Clamp helper | multiple files | min/max helper | Generic safety logic. |
| Box-Muller Gaussian | `Cultivar.ts`, `SeededRandom.ts` | normal sampling transform | RNG algorithm, not crop biology. |
| Vector normalization | `GrowthModel.ts`, visual code | length normalization | Geometry math. |
| Mesh sweep radial seam | `StemGenerator.ts` | radialSegments + 1 | Mesh construction detail. |
| Warm-up RNG draws | `ModelRegistry`/runtime | discard first 3 | Implementation quality control; can remain if documented. |
| Coordinate transform signs | `SkeletonOverlay.ts` | Babylon left-handed transform | Rendering coordinate system. |

## Render-Only OK

These values affect visual style, UI, or performance, not the biological model. They can stay in TypeScript or UI config unless the product needs theme/preset authoring.

| Area | Examples | Notes |
|---|---|---|
| PBR material values | metallic, roughness, clear coat | Visual calibration only. |
| Skeleton colors and widths | line colors, marker sizes | User-facing display preferences. |
| Render quality | bloom, SSAO, MSAA, shadow map size, hardware scale | Performance/graphics layer. |
| Greenhouse geometry | bed pitch, roof height, frame material | Scene environment, not plant growth. |
| Robot model | chassis, wheels, camera geometry | Unrelated to tomato biology. |
| Texture noise | cocopeat texture noise and speckles | Visual material generation. |
| UI layout | panel sizes, chart styles, timeline controls | Application UI only. |

## Needs Source Or Expert Confirmation

These are the most important expert-review questions. They are also represented in the JSON export under `uncertainties`.

1. **Tomimaru peak truss fruit count**
   - Current runtime: Tomimaru `trussTargetFruitCount = 4`.
   - User target: skeleton mode at day 95-105 should visually show 6-8 live fruit on peak trusses.
   - Needs expert confirmation because this depends on cultivar, fruit size, pruning, and harvest target.

2. **Tomimaru fruit mass**
   - Current runtime: 200 ± 25 g.
   - Vendor reference found: 160-180 g, Brix 5-7.
   - Need decision: adjust runtime to vendor range or keep 200 g for the target greenhouse scenario.

3. **Korean ripe tomato / Momotaro-line draft profile**
   - Added only as a review draft in the JSON export.
   - Needs cultivar-specific confirmation for fruit mass, truss target, fruit set rate, shape, and color.

4. **Side-shoot fruiting**
   - Current runtime grows side-shoot stems/leaves but sets `truss: null`.
   - User wants side shoots capable of fruiting.
   - Need expert/training scenario decision: fruiting side shoots as normal biology with pruning suppression, or separate grower-selected training mode.

5. **Leaf and stem biomechanics**
   - Current mature leaf area 880 cm2, leaf mass coefficient 25 g, cambial growth 0.7 mm2/day, stem radius cap 11.5 mm.
   - These are plausible calibration values but need measurement references.

6. **Truss anatomy**
   - Current pedicel length can read too long relative to reference photos.
   - Need source/photo calibration for pedicel length, pedicel thickness, calyx reflex, and rachis knuckle zigzag.

## Runtime JSON Already In Good Shape

These are already model-data driven:

- Photosynthesis coefficients in `tomgro-v1.jsonc`.
- Thermal time base and upper threshold in `tomgro-v1.jsonc`.
- Abortion threshold and lag in `tomgro-v1.jsonc`.
- Fruit density and dry matter percent in `tomgro-v1.jsonc`, though some code still duplicates dry matter percent.
- Cultivar phenology, flowers per truss, fruit set rate, potential fruit mass, morphology, color, pruning, and sink strength in `cultivars/*.jsonc`.

## Recommended Next Implementation Sequence

1. Extend `ModelRegistry.CultivarJson` and `Cultivar` with anatomy and truss-order fields.
2. Move `GrowthModel` reproductive fallback to use cultivar truss-order data.
3. Align `CoreModel.emergeTruss` with the same truss-order data.
4. Add side-shoot truss generation using cultivar/training policy.
5. Move truss layout anatomy values into cultivar or architecture JSON.
6. Re-run day 95/100/105 Tomimaru diagnostics and compare against the JSON target.

## Source Links Used In The Export

- Heuvelink 1996 TOMSIM dry-matter partitioning: https://academic.oup.com/aob/article-pdf/77/1/71/7982404/770071.pdf
- Tomimaru Muchoo vendor page: https://paramountseeds.com/products/tomimaru-muchoo-beefsteak-tomato
- Jeju agricultural extension tomato cultivation PDF: https://agri.jeju.go.kr/files/board/%EA%B3%BC%EC%B1%84%EB%A5%98%28%ED%86%A0%EB%A7%88%ED%86%A0%29.pdf
- Tomato truss architecture paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC5920302/
- Gillaspy 1993 fruit growth: https://doi.org/10.1105/tpc.5.10.1439
- Marcelis 1996 sink strength and abortion: https://doi.org/10.1111/j.1399-3054.1996.tb00597.x
