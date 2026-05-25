# Botanical Migration Phase 1 — Resolved Botanical Diff (per cultivar)

**Status**: Phase F deliverable. Generated 2026-05-25.

This document captures, for each of the 5 baseline cultivars, the
**effective botanical values consumed by the engine** in two states:

- **Before** (pre-migration): values were hardcoded in `PlantGenome.ts`,
  `GrowthModel.ts`, `FruitGrowth.ts`. Cultivar JSONC contributed only
  `physiology.gompertzRateB` and `physiology.gompertzInflectionC`.
- **After** (post-migration, this branch): values live in
  `models/botanical/tomato.jsonc` and are accessed via
  `ACTIVE_BOTANICAL.tomato`, optionally overlaid by
  `cultivar.botanicalOverride` and exposed as
  `cultivar.resolvedBotanical`.

**Phase 1 is a functional no-op**: every cell of the "After" column
matches the "Before" column exactly. Any drift here is a migration bug
and must be fixed before Phase G verification proceeds.

---

## Resolution rule recap

```ts
cultivar.resolvedBotanical =
  resolveBotanical(
    ACTIVE_BOTANICAL.tomato,           // base, from models/botanical/tomato.jsonc
    cultivar.botanicalOverride ?? {},  // override, from cultivars/<name>.jsonc
  );
```

5-step strict validation guards the merge (additionalProperties:false,
unknown-key reject, parameterNotes/enforcementStatus path whitelist).

---

## Stem growth (Table 1) — identical across all 5 cultivars

No cultivar overrides any stem-growth field in Phase 1, so all 5 share
the base `ACTIVE_BOTANICAL.tomato.stemGrowth`:

| Path | Before (hardcoded location) | After (botanical) | Match |
|---|---|---|---|
| `hypocotyl.emergenceDay` | `GrowthModel.ts:640` literal `5` | `5` | ✓ |
| `hypocotyl.maxCm` | `GrowthModel.ts:640` literal `4` | `4` | ✓ |
| `hypocotyl.growthRateCmPerDay` | `GrowthModel.ts:640` literal `0.8` | `0.8` | ✓ |
| `seedlingInternode.count` | `GrowthModel.ts:653` literal `4` | `4` | ✓ |
| `seedlingInternode.firstLenCm` | `GrowthModel.ts:652` literal `1.5` | `1.5` | ✓ |
| `seedlingInternode.slopePerNode` | `GrowthModel.ts:654` literal `0.8` | `0.8` | ✓ |
| `matureInternode.vigorFloor` | `GrowthModel.ts:663` literal `0.75` | `0.75` | ✓ |
| `matureInternode.vigorRange` | `GrowthModel.ts:663` literal `0.5` | `0.5` | ✓ |
| `matureInternode.taperStartFrac` | `GrowthModel.ts:664` literal `0.8` | `0.8` | ✓ |
| `matureInternode.taperSlope` | `GrowthModel.ts:665` literal `0.5` | `0.5` | ✓ |
| `matureInternode.lengthDistribution.mu` | `PlantGenome.ts:101` literal `8.0` | `8.0` | ✓ |
| `matureInternode.lengthDistribution.sigma` | `PlantGenome.ts:101` literal `0.8` | `0.8` | ✓ |
| `matureInternode.lengthDistribution.min` | `PlantGenome.ts:101` literal `6.0` | `6.0` | ✓ |
| `matureInternode.lengthDistribution.max` | `PlantGenome.ts:101` literal `10.5` | `10.5` | ✓ |
| `elongation.steepness` | `GrowthModel.ts:636` literal `0.4` | `0.4` | ✓ |
| `elongation.delayDays.mu` | `PlantGenome.ts:108` literal `4.0` | `4.0` | ✓ |
| `elongation.delayDays.sigma` | `PlantGenome.ts:108` literal `0.5` | `0.5` | ✓ |
| `elongation.delayDays.min` | `PlantGenome.ts:108` literal `3` | `3` | ✓ |
| `elongation.delayDays.max` | `PlantGenome.ts:108` literal `6` | `6` | ✓ |
| `elongation.midpointDays.mu` | `PlantGenome.ts:110` literal `8` | `8` | ✓ |
| `elongation.midpointDays.sigma` | `PlantGenome.ts:110` literal `1.0` | `1.0` | ✓ |
| `elongation.midpointDays.min` | `PlantGenome.ts:110` literal `6` | `6` | ✓ |
| `elongation.midpointDays.max` | `PlantGenome.ts:110` literal `10` | `10` | ✓ |
| `elongation.preElongFactor` | `GrowthModel.ts:673` literal `0.01` | `0.01` | ✓ |
| `heightCurve.sigmoidK.mu` | `PlantGenome.ts:64` literal `0.07` | `0.07` | ✓ |
| `heightCurve.sigmoidK.sigma` | `PlantGenome.ts:64` literal `0.008` | `0.008` | ✓ |
| `heightCurve.sigmoidMid.mu` | `PlantGenome.ts:65` literal `45` | `45` | ✓ |
| `heightCurve.sigmoidMid.sigma` | `PlantGenome.ts:65` literal `4` | `4` | ✓ |
| `heightCurve.maxCm.mu` | `PlantGenome.ts:63` literal `200` | `200` | ✓ |
| `heightCurve.maxCm.sigma` | `PlantGenome.ts:63` literal `15` | `15` | ✓ |
| `heightCurve.maxCm.min` | `PlantGenome.ts:63` literal `160` | `160` | ✓ |
| `heightCurve.maxCm.max` | `PlantGenome.ts:63` literal `240` | `240` | ✓ |
| `initialStateOffsetDays` | `GrowthModel.ts:609` literal `-30` | `-30` | ✓ |
| `initialStateSpread` | `GrowthModel.ts:609` literal `0.5` | `0.5` | ✓ |

All cultivars (cherry / round / beefsteak / roma / tomimaru) read the
same values for the stem section. **No drift.**

---

## Fruit development (Table 3)

### 4 generic cultivars (cherry / round / beefsteak / roma)

None of them declare a `botanicalOverride.fruitDevelopment` block, so
all read the base.

| Path | Before | After | Match |
|---|---|---|---|
| `visualSigmoid.steepness` | `GrowthModel.ts:625` literal `0.12` | `0.12` | ✓ |
| `visualSigmoid.midpointDays` | `GrowthModel.ts:626` literal `18` | `18` | ✓ |
| `ripening.startAgeDays` | `GrowthModel.ts:627` literal `25` | `25` | ✓ |
| `ripening.durationDays` | `GrowthModel.ts:628` literal `18` | `18` | ✓ |
| `flowering.delayPerPositionDays` | `GrowthModel.ts:859` literal `2` | `2` | ✓ |
| `flowering.bloomDurationDays` | `GrowthModel.ts:863` literal `5` | `5` | ✓ |
| `flowering.setDelayDays` *(inactive)* | `GrowthModel.ts:864` literal `12` | `12` | ✓ |
| `gompertz.rateB.mu` | `cultivar.physiology.gompertzRateB = 0.06` (all 4) | base `0.06` | ✓ |
| `gompertz.inflectionC.mu` | `cultivar.physiology.gompertzInflectionC = 0.45` (all 4) | base `0.45` | ✓ |
| `gompertz.exponentScaling` | `FruitGrowth.ts:51` literal `0.01` | `0.01` | ✓ |

### tomimaru-muchoo (override case)

The only cultivar with a populated `botanicalOverride`. The override
declares Gompertz `rateB.mu = 0.05` and `inflectionC.mu = 0.55`
(scientifically justified shift from the base 0.06 / 0.45 per
Anaya-Ramirez 2024 cluster centre).

| Path | Before (cultivar.physiology in JSONC) | After (resolved) | Match |
|---|---|---|---|
| `gompertz.rateB.mu` | `0.05` | `0.05` (override wins) | ✓ |
| `gompertz.rateB.sigma` | n/a | base fall-through | base |
| `gompertz.inflectionC.mu` | `0.55` | `0.55` (override wins) | ✓ |
| `gompertz.inflectionC.sigma` | n/a | base fall-through | base |

**Engine-read path** in Phase 1 is still
`cultivar.gompertzRateB / gompertzInflectionC`, populated from
`j.physiology.gompertz*`. The override is declared, validated, and
exposed via `cultivar.resolvedBotanical` but **not yet consumed**. This
preserves functional equivalence. A follow-up `engine_logic` plan
(Iter 1B) will:

1. Switch `FruitGrowth.potentialFreshWeight` to read from
   `cultivar.resolvedBotanical.fruitDevelopment.gompertz.{rateB,inflectionC}.mu`.
2. Delete the duplicate legacy `physiology.gompertz*` keys from
   tomimaru's JSONC.

Since the override mu values were chosen to equal the legacy physiology
values exactly, that switchover is also a functional no-op.

---

## Validation suite executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vite-node packages/tomato-engine/test-coremodel.ts` | all literature-range checks pass |
| 5-seed × 25-field byte-identity check on `generateGenome(seed)` | 125/125 fields identical |
| 5 cultivars × 30+ field resolved-botanical spot-check | 100% match |
| `ACTIVE_BOTANICAL.tomato` immutability after `resolveBotanical(base, override)` | base unchanged |
| Override with typo (`lenghtDistribution`) | rejected by `rejectUnknownKeys` |
| Invalid `parameterNotes` path | rejected by `validatePathWhitelist` |

---

## Next steps (not in this plan)

- **Iter 1B (engine_logic plan)**: switch consumer of Gompertz params to
  `cultivar.resolvedBotanical`, remove legacy `physiology.gompertz*`
  keys from tomimaru. Functional no-op (values pre-aligned).
- **Phase 2 (Leaf Module)**: migrate Table 2 leaf hardcoded values into
  `botanical/tomato.jsonc` under a `leafDevelopment` section.
- **Phase 3 (side-shoot biology)**: Table 4.
- **Phase 4 (physics layer)**: separate physics into
  `physics/tomato.jsonc` rather than expanding `botanical/`.
- **Phase 5 (cross-crop)**: write `botanical/paprika.jsonc` etc., reuse
  the resolver as-is.
