# Botanical Migration — Phase 1 (Stem + Fruit)

**Date shipped**: 2026-05-25
**Plan ref**: `.claude/plans/sleepy-growing-pretzel.md`
**Companion docs**:
- [Resolved-botanical diff per cultivar](./botanical-migration-phase1-resolved-diff.md)
- ModelUpdateLog: `growth-calibration/experiments/tomato_calibration_baseline/model-updates/growth_update_003.json`

---

## What changed

A new **`botanical.v1`** schema family was introduced to externalise
crop-specific morphology + organ-development parameters from engine
code (`*.ts`) into editable JSONC (`models/botanical/{crop}.jsonc`).
Phase 1 migrates **43 hardcoded stem + fruit values** across
`PlantGenome.ts`, `GrowthModel.ts`, and `FruitGrowth.ts` into the new
file `models/botanical/tomato.jsonc`. **Functional behaviour is
unchanged** (numerically equivalent within Phase G tolerance).

### Why this matters

Before Phase 1, calibrating any of these 43 values required editing
TypeScript source and recompiling. That made the loop
"observe → diagnose → JSON-edit → re-simulate" impossible for them —
every iteration was a code change classified as `engine_logic` in the
ModelUpdateLog. After Phase 1, the same iterations are
`jsonc_parameter` changes: edit one JSONC value, Vite HMR reloads,
next simulation step uses the new value. This unlocks the
parameter-optimisation loop that the Calibration Platform v1 was
designed for.

---

## Architecture

```
ACTIVE_BOTANICAL.tomato                                  ─┐
  ├ stemGrowth                                            │
  │   ├ hypocotyl       { emergenceDay, maxCm, …}         │
  │   ├ seedlingInternode { count, firstLenCm, …}         │
  │   ├ matureInternode  { vigorFloor, …, lengthDist }    │
  │   ├ elongation       { steepness, delayDays, … }      │
  │   ├ heightCurve      { sigmoidK, sigmoidMid, maxCm }  │  base
  │   ├ initialStateOffsetDays                            │
  │   └ initialStateSpread                                │
  └ fruitDevelopment                                      │
      ├ visualSigmoid    { steepness, midpointDays }      │
      ├ ripening         { startAgeDays, durationDays }   │
      ├ flowering        { delay…, bloom…, setDelay† }    │
      └ gompertz         { rateB, inflectionC, exp… }    ─┘
                                          deep-merge
                                                ▼
cultivar.botanicalOverride (BotanicalPartial)  ─┐
  e.g. tomimaru:                                │  override
    fruitDevelopment.gompertz.rateB.mu = 0.05   │
    fruitDevelopment.gompertz.inflectionC.mu=0.55┘
                                                ▼
                       cultivar.resolvedBotanical (full BotanicalSpec)
```

†`setDelayDays` is declared but inactive — legacy engine sets fruit at
anthesis. enforcementStatus: `pending_engine_change`.

### 5-step strict validation (resolveBotanical)

1. **`validateFull(base)`** — base spec must satisfy every required
   field.
2. **`validatePartial(override)`** — override structure must match the
   partial schema (additionalProperties:false at every level).
3. **`rejectUnknownKeys(override, base)`** + **`validatePathWhitelist`**
   for `parameterNotes` / `enforcementStatus` keys — a typo like
   `lenghtDistribution` is rejected before merge.
4. **`deepMergeBotanical(base, override)`** — clones, then overlays.
5. **`validateFull(merged)`** — final shape must still satisfy the full
   schema.

The base is never mutated. Each cultivar gets its own fresh
`resolvedBotanical` at load time, cached on the `Cultivar` object.

---

## What's actually wired

| Layer | Reads from | Note |
|---|---|---|
| `PlantGenome.generateGenome(seed)` | `ACTIVE_BOTANICAL.tomato` via default-wrapper | byte-identical to pre-migration |
| `PlantGenome.generateGenomeWithBotanical(seed, b)` | injected botanical | for future cultivar-aware genome sampling |
| `GrowthModel.computePlantState` stem path | `ACTIVE_BOTANICAL.tomato.stemGrowth` | 11 magic numbers replaced |
| `GrowthModel.computePlantState` fruit path | `ACTIVE_BOTANICAL.tomato.fruitDevelopment` | 7 visual-sigmoid + flowering values replaced |
| `FruitGrowth.potentialFreshWeight` | `ACTIVE_BOTANICAL.tomato.fruitDevelopment.gompertz.exponentScaling` | exponent scaling only |
| `Cultivar.adaptCultivar` | `resolveBotanical(ACTIVE_BOTANICAL.tomato, j.botanicalOverride)` | populates `cultivar.resolvedBotanical` |

### What is *not* yet wired (intentional Phase 1 boundary)

- `FruitGrowth.potentialFreshWeight` still reads
  `cultivar.gompertzRateB / gompertzInflectionC` (populated from
  `cultivar.physiology.gompertz*` in JSONC). Tomimaru's `botanicalOverride`
  declares the values but they are dormant. **Follow-up Iter 1B** will
  switch to `cultivar.resolvedBotanical.fruitDevelopment.gompertz` and
  delete the duplicate physiology keys. Functional no-op (override
  values pre-aligned to legacy values).
- 13 remaining hardcoded botanical values (leaf module, side-shoot
  biology, physics) — future phases.

---

## Verification (Phase G)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run build` | ✅ Vite build clean |
| `npx vite-node packages/tomato-engine/test-coremodel.ts` | ✅ identical output to pre-migration (Total fruit FW **5125.6 g**, HI **0.139**, stage histogram **17/1/1/2/1/10**, all literature-range assertions pass) |
| Phase C probe — `generateGenome(seed)` byte-identity | ✅ 5 seeds × 25 fields = 125/125 |
| Phase B probe — `ACTIVE_BOTANICAL.tomato` spot-check (23 fields) | ✅ all values match |
| Phase F probe — 5 cultivars resolve correctly | ✅ generic 4 use base, tomimaru override applied, base immutable after resolve |
| `resolveBotanical` typo rejection (`lenghtDistribution`) | ✅ throws `BotanicalValidationError` |
| `parameterNotes` invalid-path rejection | ✅ throws with suggested-path hint |

---

## What's deferred

### Iter 1B — Gompertz consumer switchover (engine_logic plan)
Switch `FruitGrowth.potentialFreshWeight` to read from
`cultivar.resolvedBotanical.fruitDevelopment.gompertz` instead of
`cultivar.gompertzRateB / gompertzInflectionC`. Delete tomimaru's
duplicate `physiology.gompertz*` keys. Numerical no-op because the
override mu values were chosen equal to the legacy physiology values.

### Phase G+ — Playwright verification harness (deferred to dedicated session)
The plan calls for **V1** (botanical-equivalence), **V2a** (day33-anomaly
baseline), **V5** (stem-growth baseline), and **V7a** (visual regression
matrix) Playwright specs plus a `calibrationDebugHook.ts` exposing
`window.__PLANT_DEBUG__.getCalibrationSnapshot()`. The contract shape
is defined in the plan (organ-level metrics: leaves, trusses, fruits
with status enums, orientations, diameters, etc.).

**Why deferred**: Playwright is not installed (`tests/` directory does
not exist; no `@playwright/test` in `package.json`). Setting up a
deterministic single-plant URL-driven view + scene-side debug hook +
4 spec files + chromium install + baseline screenshot capture is a
multi-step deliverable on its own. Shipping it half-wired (specs
without baselines, hook without scene integration) would give a false
sense of safety net.

**Handoff for the follow-up session**:
1. `npm install -D @playwright/test`
2. `npx playwright install chromium`
3. Create `src/twin/calibrationDebugHook.ts` exposing
   `window.__PLANT_DEBUG__.getCalibrationSnapshot()` with the shape
   defined in plan §"`window.__PLANT_DEBUG__` 계약". Hook into
   BabylonEngine.ts:232 (same pattern as the existing
   `window.__leafModule` setup).
4. Add a `?calibration={seed}&day={n}&view={name}` URL query handler
   that pins camera + seed + sim day for screenshot determinism.
5. Create `tests/plant-calibration/` with
   `botanical-equivalence.spec.ts` (V1+V7a) + `day33-anomaly-baseline.spec.ts`
   (V2a) + `stem-growth.spec.ts` (V5).
6. Capture day 30/60/90 × 5 views = 15 baseline screenshots per
   modelVersion. Archive under `test-results/plant-visual-regression/`.

### Phase 2+ — broader migration
- Phase 2 (Leaf Module): 14 hardcoded leaf-development values → `botanical/tomato.jsonc#leafDevelopment`
- Phase 3 (side-shoot biology): 6 values
- Phase 4 (physics layer): separate file `physics/tomato.jsonc`
- Phase 5 (cross-crop): paprika / cucumber / strawberry / lettuce / eggplant
  reuse the same resolver as-is

---

## SSOT additions (this plan)

- **#26** Botanical layer separation — all crop botanical/physiological
  hardcoded params live in `models/botanical/{crop}.jsonc`.
- **#27** Cultivar override pattern — partial override only; deep-merge
  with strict validation.
- **#28** Phased migration — functional equivalence first, calibration
  loop second.
- **#29** Layer boundary — botanical = morphology/organ curves only.
  Phenology (cultivar.phenology) and canopy physiology (tomgro-v1) live
  in their own layers.
- **#30** Per-field enforcement status — `active` / `pending_engine_change`
  / `deprecated` declarable per field.
- **#33** ChangeType `'refactor'` — value/meaning unchanged, location
  only. Functional no-op. Added to `growth-calibration/schema/types.ts`.
