# Cultivar Parameters Inventory — 재배중인 토마토 모델 parameter 전수

> **Iter 30 Phase 0.0 산출물 #2** — 사용자 검증 baseline.
> 본 문서는 _현재 cultivar JSONC + botanical + genome + active_model_의
> 모든 parameter를 표/cross-reference로 정리. **이 parameter들이 맞는지
> 사용자가 직접 검증**하고, [`EQUATIONS_INVENTORY.md`](./EQUATIONS_INVENTORY.md)의
> 51 수식과 연결해서 _값과 산식 결합_의 정합성을 확인.
>
> Baseline: commits `1caae3e..0340fbb` (Iter 29 v3.3 완료 시점)
> 작성: 2026-05-30
> Plan SSOT: [`/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md) §0.99

---

## 인덱스

| 섹션 | 출처 | 의미 |
|---|---|---|
| [1. CultivarGrowthProfile (Iter 29 P1-Pre)](#1-cultivargrowthprofile-iter-29-phase-1-pre-11-필드) | `cultivars/*.jsonc:growthProfile` | TT-based 생장 모델 (잎/줄기 핵심) |
| [2. Provenance](#2-cultivargrowthprofileprovenance-iter-29-phase-5) | `CultivarGrowthProfile.ts` | source/range/default/confidence |
| [3. Cultivar 기존 필드](#3-cultivar-기존-필드-iter-29-이전) | `cultivars/*.jsonc` | phenology/reproductive/morphology/color/pruning |
| [4. BotanicalSpec](#4-botanicalspec-botanicaltomatojsonc) | `botanical/tomato.jsonc` | stem/fruit/cotyledon 작물 default |
| [5. PlantGenome](#5-plantgenome-per-plant-random-draw) | `PlantGenome.ts` | per-plant Gaussian sample |
| [6. ACTIVE_MODEL](#6-active_model-tomgro-v1jsonc) | `tomgro-v1.jsonc` | global model parameter |
| [7. Cross-reference 표](#7-cross-reference--수식--parameter-매핑) | 수식 ↔ parameter | 검증 가이드 |

---

## 1. CultivarGrowthProfile (Iter 29 Phase 1-Pre, 11 필드)

★ **canonical 생장 parameter**. Phase 0.A linear product fix가 이 값들을 입력으로 사용.

| 필드 | cherry-generic | round-generic | beefsteak-generic | roma-generic | tomimaru-muchoo | DEFAULT |
|---|---:|---:|---:|---:|---:|---:|
| `phyllochronTT` (GDD/leaf) | **38** | **38** | **40** | **36** | **40** | 38 |
| `plastochronTT` (GDD, v1 미사용) | 30 | 30 | 32 | 28 | 32 | 30 |
| `baseInternodeLengthCm` | **5** | **7** | **8** | **6** | **7** | 7 |
| `maxLeafAreaCm2` ★ R1 영향 | **550** | **700** | **850** | **650** | **800** | 800 |
| `maxLeafletCount` | **7** | **9** | **11** | **9** | **11** | 9 |
| `leafExpansionDurationTT` (GDD) | 380 | 400 | 450 | 380 | 430 | 400 |
| `leafLifespanTT` (GDD) | 1100 | 1200 | 1300 | 1100 | 1300 | 1200 |
| `firstTrussNodeIndex` | **8** | **9** | **10** | **7** | **10** | 9 |
| `trussIntervalNodes` | 3 | 3 | 3 | 3 | 3 | 3 |
| `baseStemRadiusMm` | **6** | **8** | **10** | **7** | **9** | 8 |
| `sourceSinkSensitivity` | 0.35 | 0.35 | **0.40** | **0.38** | **0.40** | 0.35 |

**기본 변별 패턴**:
- 작은 cultivar (cherry / roma): 잎 작음, 줄기 가늚, 잎 expansion 빠름
- 큰 cultivar (beefsteak / tomimaru): 잎 큼, 줄기 굵음, 잎 수명 김, sink draw 강함
- round = baseline (모든 default와 유사)

**Type-default fallback** (`defaultGrowthProfileForType`, [CultivarGrowthProfile.ts](../../packages/tomato-engine/src/CultivarGrowthProfile.ts#L160)):
- cherry: maxLeafArea=550, maxLeafletCount=7, internode=5, stemR=6
- beefsteak: maxLeafArea=850, maxLeafletCount=11, internode=8, stemR=10
- roma: maxLeafArea=650, firstTrussIdx=7 (determinate earlier)
- round/default: 위 DEFAULT 컬럼

---

## 2. CultivarGrowthProfileProvenance (Iter 29 Phase 5)

각 필드의 _provenance metadata_. 파일: [`CultivarGrowthProfile.ts:107-160`](../../packages/tomato-engine/src/CultivarGrowthProfile.ts#L107-L160).

| 필드 | source | default | range | confidence | sourceRefs |
|---|---|---:|---|---|---|
| `phyllochronTT` | literature | 38 | [32, 45] | high | Heuvelink 1996 TOMSIM (38 GDD/leaf) |
| `plastochronTT` | estimated | 30 | [25, 38] | low | placeholder (v1 미사용) |
| `baseInternodeLengthCm` | literature | 7 | [4, 10] | medium | greenhouse indeterminate 6-8 cm |
| `maxLeafAreaCm2` | literature | 800 | [450, 950] | medium | cherry 450-650 / medium 600-800 / beefsteak 750-950 |
| `maxLeafletCount` | literature | 9 | [7, 11] | high | cherry 7 / standard 9 / beefsteak 11 |
| `leafExpansionDurationTT` | literature | 400 | [350, 500] | medium | Marcelis 1996 typical ~400 GDD |
| `leafLifespanTT` | estimated | 1200 | [1000, 1400] | medium | ~60d at 20°C → ~1200 GDD |
| `firstTrussNodeIndex` | literature | 9 | [7, 11] | high | indeterminate tomato 8-10 |
| `trussIntervalNodes` | literature | 3 | [2, 4] | high | 3-leaf phyllotaxis 상업 cultivar |
| `baseStemRadiusMm` | literature | 8 | [5, 12] | medium | greenhouse indeterminate ~8mm mid-shoot |
| `sourceSinkSensitivity` | literature | 0.35 | [0.25, 0.45] | medium | Marcelis 1996 sink leaf ~0.35 (fruit=1.0) |

**round-generic.jsonc만 sample provenance 보유** (Iter 29 P5 demo):
```jsonc
"growthProfileProvenance": {
  "phyllochronTT": {
    "source": "literature", "default": 38, "range": [32, 45],
    "confidence": "high",
    "sourceRefs": ["Heuvelink 1996 TOMSIM"]
  },
  "maxLeafAreaCm2": { ... range: [600, 800], confidence: medium, ... }
}
```

---

## 3. Cultivar 기존 필드 (Iter 29 이전)

### 3.1 Phenology (GDD-driven)

| 필드 | cherry | round | beefsteak | roma | tomimaru | Source |
|---|---:|---:|---:|---:|---:|---|
| `T_base` | 10°C | 10°C | 10°C | 10°C | 10°C | Heuvelink 1996 |
| `GDD_to_first_flower` | 250 | 250 | 250 | 250 | 250 | TOMSIM |
| `GDD_flower_to_red` | 800 | 800 | 800 | 800 | 800 | TOMSIM |
| `GDD_per_truss` | 120 | 120 | 120 | 120 | 120 | ~1 truss/week at 20°C |
| `cellDivisionDurationGDD` | 150 | 150 | 150 | 150 | 150 | Gillaspy 1993 |
| `cellExpansionDurationGDD` | 500 | 500 | 500 | 500 | 500 | Gillaspy 1993 |
| `ripeningDurationGDD` | 200 | 200 | 200 | 200 | 200 | Gillaspy 1993 |
| `trussRipeningSpreadGDD` | 60 | 90 | 100 | 70 | 80 | empirical |

### 3.2 Reproductive

| 필드 | cherry | round | beefsteak | roma | tomimaru |
|---|---|---|---|---|---|
| `flowersPerTruss` (μ ± σ) | 12 ± 3 | 6 ± 1.5 | 5 ± 1.0 | 6 ± 1.5 | 5 ± 1.0 |
| `fruitSetRate` | 0.7 | 0.6 | 0.5 | 0.65 | 0.5 |
| `potentialFruitMassG` (μ ± σ) | 18 ± 4 | 130 ± 25 | 250 ± 40 | 90 ± 15 | 250 ± 30 |

### 3.3 Morphology (per-fruit 분포)

| 필드 | cherry | round | beefsteak | roma | tomimaru |
|---|---|---|---|---|---|
| `firstTrussNodeIdx` (μ ± σ) | 8 ± 1 | 9 ± 1 | 10 ± 1 | 7 ± 1 | 10 ± 1 |
| `trussIntervalNodes` | 3 | 3 | 3 | 3 | 3 |
| `fruitMaxDiameterMm` (μ ± σ) | 30 ± 3 | 67 ± 7 | 90 ± 8 | 55 ± 5 | 90 ± 8 |
| `loculeCount` (μ) | 2.0 | 4.0 | 7.0 | 3.0 | 7.0 |
| `heightWidthRatio` (μ) | 0.96 | 0.90 | 0.70 | 1.20 | 0.70 |
| `ribbingStrength` (μ) | 0.05 | 0.18 | 0.40 | 0.10 | 0.40 |
| `asymmetryStrength` | 0.05 | 0.08 | 0.10 | 0.07 | 0.10 |
| `blossomEndAdvanceFrac` (μ) | 0.35 | 0.45 | 0.50 | 0.40 | 0.50 |

### 3.4 Color

| 필드 | cherry | round | beefsteak | roma | tomimaru |
|---|---|---|---|---|---|
| `fullRipeRGB` | [195,30,22] | [205,35,28] | [185,30,25] | [215,40,25] | [200,30,25] |
| `greenStageRGB` | [34,120,30] | [40,120,35] | [38,115,30] | [42,118,30] | [38,118,30] |
| `hueVariance` | 0.04 | 0.05 | 0.06 | 0.04 | 0.06 |

### 3.5 Sink Strength (Marcelis 1996; fruit=1.0)

| 필드 | cherry | round | beefsteak | roma | tomimaru |
|---|---:|---:|---:|---:|---:|
| `sinkStrengthLeaf` | 0.35 | 0.35 | 0.35 | 0.35 | 0.35 |
| `sinkStrengthStem` | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 |
| `sinkStrengthRoot` | 0.07 | 0.07 | 0.07 | 0.07 | 0.07 |

★ _현재 5 cultivar 모두 동일 값_. Iter 29 후속 Phase 7 candidate (Phase 3 axis variant 도입 시 활용 가능).

### 3.6 Pruning

| 필드 | cherry | round | beefsteak | roma | tomimaru |
|---|---:|---:|---:|---:|---:|
| `defoliationAggressiveness` | 0.40 | 0.35 | 0.35 | 0.35 | 0.35 |
| `trussTargetFruitCount` | 10 | 5 | 3 | 5 | 4 |

### 3.7 Misc Physiology

| 필드 | cherry | round | beefsteak | roma | tomimaru |
|---|---:|---:|---:|---:|---:|
| `SLA` (m²/g DM) | 0.028 | 0.028 | 0.028 | 0.028 | 0.028 |
| `abortionThresholdRatio` | 0.25 | 0.25 | 0.25 | 0.25 | **0.25** (override) |
| `abortionLagDays` | 4 | 4 | 4 | 4 | **10** (override) |

### 3.8 Cultivar-specific botanicalOverride (gompertz)

| Cultivar | gompertzRateB | gompertzInflectionC | exponentScaling |
|---|---:|---:|---:|
| cherry / round / beefsteak / roma | 0.06 | 0.45 | (botanical default) |
| **tomimaru** | **0.05** | **0.55** | **0.08** |

Tomimaru는 _phaseAwareMassGrowth_ 추가:
```jsonc
"massFlow": {
  "phaseAwareMassGrowth": {
    "enabled": true,
    "divisionPhaseMassFraction": 0.10,
    "cellDivisionStepDemandFraction": 0.10,
    "transitionZoneGDD": 40,
    "expansionPhaseGrowthMultiplier": 1.25
  }
}
```

---

## 4. BotanicalSpec (`botanical/tomato.jsonc`)

작물 _공통_ default. cultivar는 `botanicalOverride`로 partial override만 가능.

### 4.1 stemGrowth

#### hypocotyl
```jsonc
{
  "emergenceDay": 5,
  "maxCm": 4,
  "growthRateCmPerDay": 0.8
}
```
→ EQ-S8 hypocotylCm 입력 (Heuvelink 2018 Ch.4)

#### seedlingInternode
```jsonc
{
  "count": 4,
  "firstLenCm": 1.5,
  "slopePerNode": 0.8
}
```
→ EQ-S4 seedling pattern

#### matureInternode
```jsonc
{
  "vigorFloor": 0.75,
  "vigorRange": 0.5,
  "taperStartFrac": 0.8,
  "taperSlope": 0.5,
  "lengthDistribution": {
    "mu": 8.0, "sigma": 0.8, "min": 6.0, "max": 10.5
  }
}
```
→ EQ-S1 finalLen + EQ-S5 taper. _Reference Pack 285cm/34nodes ≈ 8.4cm/internode_

#### elongation
```jsonc
{
  "steepness": 0.4,
  "preElongFactor": 0.01,
  "delayDays": { "mu": 4.0, "sigma": 0.5, "min": 3, "max": 6 },
  "midpointDays": { "mu": 8.0, "sigma": 1.0, "min": 6, "max": 10 }
}
```
→ EQ-S2 elongation sigmoid (GA-mediated delay)

#### heightCurve
```jsonc
{
  "maxCm": { "mu": 285.0, "sigma": 15.0, "min": 240, "max": 320 },
  "sigmoidK": { "mu": 0.07, "sigma": 0.01 },
  "sigmoidMid": { "mu": 45, "sigma": 5 }
}
```
→ EQ-S1 vigor = 4·S·(1-S) input

### 4.2 cotyledon (Iter 29 P2)

```jsonc
{
  "maxHalfLengthM": 0.008,    // 1.6cm full (Heuvelink 2018 Ch.4 표준 1-2cm)
  "widthLengthRatio": 0.35     // 2.85:1 elongated oval (Jones JB 2007)
}
```
→ EQ-F5 cotyledonSize × maxHalfLengthM = real size

### 4.3 fruitDevelopment

#### visualSigmoid
```jsonc
{
  "steepness": 1.0,
  "midpointDays": 35
}
```
→ EQ-F1 diameter legacy sigmoid

#### ripening
```jsonc
{
  "startAgeDays": 35,
  "durationDays": 20
}
```
→ EQ-F4 ripenStage

#### flowering
```jsonc
{
  "delayPerPositionDays": 1.5,
  "bloomDurationDays": 7,
  "setDelayDays": 12
}
```

#### gompertz
```jsonc
{
  "rateB": { "mu": 0.06, "sigma": 0.005 },
  "inflectionC": { "mu": 0.45, "sigma": 0.03 },
  "exponentScaling": 0.10
}
```
→ EQ-F2 Gompertz W(t) (Anaya-Ramirez 2024)

---

## 5. PlantGenome (per-plant random draw)

각 plant마다 SeededRandom으로 Gaussian sample. 파일: [`PlantGenome.ts:1-160`](../../packages/tomato-engine/src/PlantGenome.ts#L1-L160).

### 5.1 Growth curve (botanical heightCurve에서 draw)
```ts
heightMaxCm:    clamp(gaussian(285, 15), 240, 320)
heightSigmoidK: clamp(gaussian(0.07, 0.01), 0.04, 0.10)
heightSigmoidMid: clamp(gaussian(45, 5), 35, 55)
```

### 5.2 Phyllotaxis
```ts
phyllotaxisJitter: gaussian(0, 8)    // ±8° per node random
```

### 5.3 Leaves
```ts
leafSizeMultiplier:    clamp(gaussian(1.0, 0.12), 0.7, 1.3)   // ★ EQ-L2 potentialSize 입력
leafletCountBias:      round(clamp(gaussian(0, 0.6), -1, 1))   // -1, 0, +1
leafDroopMultiplier:   clamp(gaussian(1.0, 0.15), 0.6, 1.4)   // ★ EQ-SN8 ageDroop
leafHueBias:           gaussian(0, 0.05)
```

### 5.4 Visual
```ts
stemRadiusMultiplier: clamp(gaussian(1.0, 0.1), 0.75, 1.25)
fruitOblongFactor:    clamp(gaussian(1.0, 0.08), 0.82, 1.18)
```

### 5.5 Biomechanics
```ts
stemStrengthFactor:    clamp(gaussian(1.0, 0.1), 0.75, 1.25)     // ★ EQ-S6 stemRadiusMm
stemYoungsModulusMPa:  clamp(gaussian(10, 2), 5, 15)
stemWoodDensity:       clamp(gaussian(800, 50), 700, 900)
wireAttachmentHeight:  clamp(gaussian(3.5, 0.1), 3.3, 3.7)
```

### 5.6 Leaf shape (Phase 5 cultivar bias 적용)
```ts
leafSerrationDepth: clamp(gaussian(0.18, 0.03), 0.10, 0.25)
leafSerrationFreq:  clamp(gaussian(10, 1.5), 7, 14)
leafLobeDepth:      clamp(gaussian(0.08, 0.03), 0.0, 0.15)
leafWaviness:       clamp(gaussian(0.003, 0.001), 0.0, 0.006)
leafPetioleLength:  clamp(gaussian(0.10, 0.015), 0.06, 0.14)    // ★ EQ-L8 baseline
```

★ Phase 5 `applyCultivarLeafShape`가 cultivar.type 별로 추가 곱셈:
- cherry: serration × 1.5, lobe × 0.6
- beefsteak: serration × 0.85, lobe × 1.5
- roma: serration × 1.10, lobe × 0.85

### 5.7 Internode & expansion (botanical에서 draw)
```ts
internodeLenCm:        clamp(gaussian(8.0, 0.8), 6.0, 10.5)   // ★ EQ-S1 baseInternode
leafExpansionRate:     clamp(gaussian(0.35, 0.04), 0.25, 0.45)  // ★ EQ-L5 leafExpK
internodeElongDelay:   clamp(gaussian(4.0, 0.5), 3, 6)         // ★ EQ-S2 elongDelay
internodeElongMid:     clamp(gaussian(8, 1.0), 6, 10)          // ★ EQ-S2 elongMid
```

### 5.8 Sway (Lever A')
```ts
swayAmplitude:           clamp(gaussian(0.10, 0.025), 0.05, 0.15)
swayFrequencyRadPerM:    clamp(gaussian(0.3, 0.15), 0.1, 0.6)
swayPhaseOffsetRad:      uniform(0, 2π)
wireSlideAzimuthRad:     uniform(0, 2π)
plantingDayOffset:       clamp(gaussian(0, 2), -5, 5)
```

---

## 6. ACTIVE_MODEL (`tomgro-v1.jsonc`)

전역 model parameter. 파일: [`models/tomgro-v1.jsonc`](../../packages/tomato-engine/models/tomgro-v1.jsonc).

### 6.1 thermalTime
```jsonc
{
  "T_base_C": 10,           // ★ EQ-TT1 T_base
  "T_max_dev_C": 30         // ★ EQ-TT1 cardinal ceiling
}
```

### 6.2 organogenesis
```jsonc
{
  "phyllochronGDD": 38,                       // legacy field — cultivar.growthProfile.phyllochronTT가 canonical
  "initialNodeCountAtTransplant": 5,          // ★ EQ-P1 input
  "TT_at_transplant": 280                     // ★ EQ-P1 input
}
```

### 6.3 photosynthesis
```jsonc
{
  "plantFootprintM2": 0.34   // 단일 plant 영역 (LAI 계산용)
}
```

### 6.4 lai
```jsonc
{
  "defoliation_cap_base": 3.0   // Heuvelink 1996 commercial cap
}
```

### 6.5 abortion (cultivar-level override 가능)
```jsonc
{
  "threshold_ratio": 0.25,    // Marcelis 1996 trigger (actualDM/potentialDM < this)
  "lag_days": 4               // abortion 결정 lag
}
```

---

## 7. Cross-reference — 수식 ↔ parameter 매핑

★ **사용자 검증 가이드**: 각 수식이 어떤 parameter를 입력으로 받는지.

| 수식 | 핵심 parameter | 출처 | 결함 |
|---|---|---|---|
| **EQ-L1** leafletCountFromMaturity | cultivar.growthProfile.maxLeafletCount (7/9/11) | cherry/round/beefsteak/roma/tomimaru JSONC | ✓ Iter 29 P1-Pre 완료 |
| **EQ-L2** leafSizeFactor (4 factor) | genome.leafSizeMultiplier (0.7-1.3), genome.heightSigmoidK/Mid | PlantGenome.ts | — |
| **EQ-L3** ★ leafAreaCm2 quadratic | cultivar.growthProfile.maxLeafAreaCm2 (550/700/850/650/800) | cultivar JSONC | **★ R1 quadratic** → Phase 0.A fix |
| **EQ-L5** leafExpansion sigmoid | cultivar.growthProfile.leafExpansionDurationTT (380-450) | cultivar JSONC | — |
| **EQ-L8** petioleLen baseline | genome.leafPetioleLength (0.08 m gaussian) | PlantGenome.ts | — |
| **EQ-S1** internode finalLen | botanical.matureInternode.{vigorFloor, vigorRange, taperStart}, genome.heightSigmoidK/Mid | botanical/tomato.jsonc + PlantGenome.ts | — |
| **EQ-S2** elongation sigmoid | botanical.elongation.steepness, genome.internodeElongDelay/Mid | botanical + PlantGenome | — |
| **EQ-S6** stemRadiusMm | physics massR2 + cambialMm² coefs, genome.stemStrengthFactor | PhysicsModel.ts | — |
| **EQ-S8** hypocotyl | botanical.hypocotyl.{emergenceDay=5, maxCm=4, rateCmPerDay=0.8} | botanical | — |
| **EQ-S10** stemVigorFactor | hardcoded `√(heightCm/50)` clamp [0.5, 1.5] | LeafGrowthModel.ts | reference 50cm은 hardcoded — cultivar로 이관 candidate |
| **EQ-F2** Gompertz W(t) | botanical.fruitDevelopment.gompertz.{rateB, inflectionC, exponentScaling} + per-fruit potentialMassG | botanical (tomimaru override 보유) | — |
| **EQ-F4** ripenStage | botanical.ripening.{startAgeDays=35, durationDays=20} | botanical | — |
| **EQ-F5** cotyledonSize | hardcoded `day < 3 / 8 / 15 / 25` thresholds | GrowthModel.ts | botanical로 이관 candidate (Phase 5) |
| **EQ-P1** initiationTT | cultivar.growthProfile.phyllochronTT (36-40), ACTIVE_MODEL.organogenesis.{initialNodeCountAtTransplant=5, TT_at_transplant=280} | cultivar + tomgro-v1 | — |
| **EQ-P6** juvenileScale | hardcoded `day < 15` 0.3→1.0 | GrowthModel.ts | TT-based 이관 candidate (Phase 2A) |
| **EQ-SN1** senescenceStartTT | cultivar.growthProfile.leafLifespanTT (1100-1300), hardcoded `senescenceStartRatio=0.7` | cultivar + SenescenceModel.ts | — |
| **EQ-SN7** ⚠️ yellowing legacy | hardcoded `age > 60` day-based | GrowthModel.ts | Phase 5에서 deprecate (TT canonical만) |
| **EQ-SN9** weightDroop | EQ-L4 leafMassG, hardcoded armLenM=0.22m, coef=6000 | GrowthModel.ts | cantilever coefs hardcoded — botanical로 이관 candidate |
| **EQ-SS3** sourceSinkProxyV1 | hardcoded clamp [0.65, 1.15], demand/supply formula | SourceSinkProxyV1.ts | ★ R3 plant-wide single — Phase 3 axis variant |
| **EQ-TT1** GDD daily | ACTIVE_MODEL.thermalTime.{T_base_C=10, T_max_dev_C=30} | tomgro-v1.jsonc | — |
| **EQ-POSTURE1** ★ composeLeafRotation | quat math constants only | AnchorTransform.ts | **★ R4 world-frame** → Phase 0.D fix |
| **EQ-POSTURE3** azimuthDeg | hardcoded GOLDEN_ANGLE=137.508°, genome.phyllotaxisJitter (±8°) | GrowthModel.ts + PlantGenome | — |

---

## 검증 요청 사항 (사용자 직접)

### 8.1 Cultivar growth profile 값이 _과학적으로 맞는가?_

특히:
- **cherry maxLeafAreaCm2=550** — cherry 토마토 실측 mature leaf area?
- **beefsteak maxLeafAreaCm2=850** — beefsteak 실측?
- **roma firstTrussNodeIndex=7** — determinate roma 실측?
- **phyllochronTT 36-40 GDD/leaf** — Heuvelink 1996 (38) 범위 안?
- **sourceSinkSensitivity 0.35-0.40** — Marcelis 1996 sink leaf (0.35) 안에 들어가나?

### 8.2 Cultivar 기존 필드

- **sinkStrengthLeaf/Stem/Root**: 5 cultivar 모두 동일 (0.35/0.15/0.07) — _cultivar별 차이가 있어야 하나?_
- **trussTargetFruitCount**: cherry 10 / beefsteak 3 vs 실측?
- **abortion**: tomimaru만 lagDays=10 override — 다른 cultivar는 4. 맞나?

### 8.3 BotanicalSpec

- **hypocotyl** maxCm=4 + 0.8 cm/day rate — 실측?
- **matureInternode** 8±0.8 cm (6-10.5 clamp) — 줄기 마다 마디 길이 8cm?
- **heightCurve** maxCm=285 — 토마토 indeterminate plant max height 285cm?
- **gompertz** rateB=0.06, inflectionC=0.45 — Anaya-Ramirez 2024 fit 안에?

### 8.4 PlantGenome ranges

- `leafSizeMultiplier 0.7-1.3` — 개체 차이 ±30%?
- `leafSerrationDepth 0.10-0.25` — Skin morphology, 검증 가능한가?
- `leafPetioleLength 0.06-0.14 m` — mature 토마토 petiole?

### 8.5 ACTIVE_MODEL

- `phyllochronGDD=38` (legacy) vs `cultivar.growthProfile.phyllochronTT` (canonical) — _값 다를 수 있으나_ Iter 29 P1-Pre에서 canonical 우선. 맞나?
- `initialNodeCountAtTransplant=5` + `TT_at_transplant=280` — 4주 묘기 5 노드?
- `lai.defoliation_cap_base=3.0` — Heuvelink 1996 commercial cap. 맞나?

### 8.6 결함 식별

- 위 표에서 _값이 틀린_ parameter는?
- 표 안에 _누락된_ parameter는?
- _수식 + parameter 결합_이 잘못된 곳은? (cross-reference 표 §7)
- 5 cultivar _변별이 부족_한 영역은?

회신 받으면 Phase 0.A~0.D _구체 산식 fix + parameter tuning_에 반영합니다.
