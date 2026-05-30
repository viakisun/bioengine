# Growth Equations Inventory — 현재 코드 수식 전수

> **Iter 30 Phase 0.0 산출물** — 사용자 검증 baseline.
> 본 문서는 _현재 코드에서 실제로 사용 중인_ 모든 생육 수식을 file:line으로
> 정리한 _감사 보고서_입니다. **이 수식들이 맞는지 사용자가 직접 검증**하면,
> 그 결함 list를 Phase 0.A~0.D hotfix의 _구체 산식 fix_에 반영합니다.
>
> 검증 순서: **수식 → 값 → 노드 → 시각** (시각화는 결과지 검증 대상 아님).
>
> Baseline: commits `1caae3e..0340fbb` (Iter 29 v3.3 완료 시점)
> 작성: 2026-05-30
> Plan SSOT: [`/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md) §0.99

---

## 카테고리 인덱스

| 카테고리 | 수식 수 | 핵심 layer | 알려진 결함 |
|---|---|---|---|
| [1. Leaf](#1-leaf) | 12 | PlantBase + Skin | ★ EQ-L3 quadratic |
| [2. Stem](#2-stem) | 10 | PlantBase | — |
| [3. Fruit](#3-fruit) | 5 | PlantBase | — |
| [4. Phytomer](#4-phytomer) | 6 | PlantBase | — |
| [5. Senescence](#5-senescence) | 8 | PlantBase | EQ-SN7 day-based legacy |
| [6. Source-Sink](#6-source-sink) | 3 | PlantBase | — |
| [7. Thermal Time](#7-thermal-time) | 1 | PlantBase | — |
| [8. Posture](#8-posture) | 4 | PlantBase + Skeleton | ★ EQ-POSTURE1 world-frame |
| [9. Geometry](#9-geometry) | 2 | Skin | — |

**총 51개 수식** + 부록 (constants 표).

---

## 1. Leaf

### EQ-L1: leafletCountFromMaturity (SSOT)
- **File**: `packages/tomato-engine/src/LeafStage.ts:74-89`
- **Code**:
  ```ts
  if (biasedMaturity < 0.4) return 1 + t * 2;          // EARLY_TRUE 1→3
  return 5 + t * (maxLeafletCount - 5);                 // COMPOUND 5→max
  ```
- **Inputs**: `maturity` (0-1), `bias` (genome.leafletCountBias, default 0 ×0.15 weight), `maxLeafletCount` (cultivar: 7|9|11)
- **Output**: fractional leaflet count
- **Unit**: leaflets
- **Source**: Iter 29 Phase 0 + Phase 1-Pre (cultivar-driven max)
- **Layer**: PlantBase
- **Note**: ✓ 정상 (Iter 29 P1-Pre 완료, cultivar로 이관)

### EQ-L2: leafSizeFactor (4-factor composition)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1038`
- **Code**:
  ```ts
  leafSizeFactor = potentialSize × leafExpansion × plantJuvenileScale × stemVigorFactor
  ```
- **Inputs**:
  - `potentialSize = (0.85 + 0.20 × sin(nodeFrac·π)) × genome.leafSizeMultiplier` (0.85-1.05 × ~1.0)
  - `leafExpansion = sigmoid(age, leafExpK, 9)` (0-1)
  - `plantJuvenileScale = day < 15 ? (0.3 + 0.7·day/15) : 1.0` (0.3-1.0)
  - `stemVigorFactor = clamp(√(heightCm/50), 0.5, 1.5)` (0.5-1.5)
- **Output**: 무차원 multiplier
- **Unit**: dimensionless (0.3-1.5 typical)
- **Source**: Plan §6.3 (lightweight vigor proxy, NOT TOMSIM)
- **Layer**: PlantBase

### EQ-L3: leafAreaCm2 ★ R1 결함
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1044`
- **Code**:
  ```ts
  leafAreaCm2 = cultivar.growthProfile.maxLeafAreaCm2 × leafSizeFactor²
  ```
- **Inputs**: `maxLeafAreaCm2` (cherry 550 / round 700 / beefsteak 850 / roma 650 / tomimaru 800), `leafSizeFactor` (EQ-L2, 0.3-1.5)
- **Output**: 현재 잎 면적 cm²
- **Unit**: cm²
- **Source**: ★ **알려진 결함** — `leafSizeFactor²` quadratic으로 vigor/expansion이 비선형 증폭. Plan §6 spec은 _linear product_.
- **Layer**: PlantBase
- **Note**: D=45 idx=10 trace = 700 × 1.344² = 1264 cm² > cultivar bound 700 (1.82× overshoot). Phase 0.A에서 linear 3-stage로 fix 예정.

### EQ-L4: leafMassG (mass scaling)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1045`
- **Code**:
  ```ts
  leafMassG = 25 × leafSizeFactor² × leafMaturity
  ```
- **Inputs**: `leafSizeFactor`, `leafMaturity` (0-1, clamp ≥0.02)
- **Output**: 잎 fresh mass (blade only)
- **Unit**: grams
- **Source**: hardcoded calibration (TOMSIM-inspired)
- **Layer**: PlantBase

### EQ-L5: leafExpansion sigmoid (Phase 2A canonical)
- **File**: `packages/tomato-engine/src/growth/LeafGrowthModel.ts:218-228`
- **Code**:
  ```ts
  1 / (1 + exp(-steepness × (ageTT - midpoint))); midpoint = expansionDurationTT / 2
  ```
- **Inputs**: `ageTT` (GDD), `expansionDurationTT` (cultivar, default 400), `steepness` (default 0.015)
- **Output**: 0→1 expansion progress
- **Unit**: dimensionless
- **Source**: Plan §7 (Marcelis 1996 leaf expansion timescale)
- **Layer**: PlantBase

### EQ-L6: positionFactor (sin curve)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1010`
- **Code**:
  ```ts
  positionFactor = sin(nodeFrac × π)   // nodeFrac = i / (intNodeCount - 1)
  ```
- **Inputs**: node index i, intNodeCount
- **Output**: 0→1 (peak at nodeFrac=0.5)
- **Unit**: dimensionless
- **Source**: Heuvelink 1996 canopy structure
- **Layer**: PlantBase

### EQ-L7: targetAreaCm2 (proxy modulation)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1291`
- **Code**:
  ```ts
  targetAreaCm2 = (leafAreaCm2 / leafExpansion²) × sourceSinkProxyV1
  ```
- **Inputs**: `leafAreaCm2` (EQ-L3), `leafExpansion` (EQ-L5), `sourceSinkProxyV1` (EQ-SS3, 0.65-1.15 clamp)
- **Output**: 잠재 target 면적 (current 변환 전)
- **Unit**: cm²
- **Source**: Plan §6.4 (Phase 2B proxy)
- **Layer**: PlantBase
- **Note**: ★ EQ-L3가 quadratic이라 EQ-L7도 _potential²_ 잔차 보유. Phase 0.A fix와 함께 변경.

### EQ-L8: petioleLen (Skin)
- **File**: `packages/tomato-geometry/src/leafChunk.ts:97`
- **Code**:
  ```ts
  petioleLen = petioleLength × sizeFactor × maturity
  ```
- **Inputs**: `petioleLength` (genome 기본 0.08 m), `sizeFactor` (Skin), `maturity` (0-1)
- **Output**: 현재 petiole 길이
- **Unit**: meters
- **Source**: hardcoded (Iter 18+ morphology calibration)
- **Layer**: Skin

### EQ-L9: rachisLen (Skin)
- **File**: `packages/tomato-geometry/src/leafChunk.ts:98`
- **Code**:
  ```ts
  rachisLen = 0.32 × sizeFactor × maturity
  ```
- **Inputs**: `sizeFactor`, `maturity`
- **Output**: rachis (엽축) 길이
- **Unit**: meters
- **Source**: empirical baseline 0.32 m
- **Layer**: Skin

### EQ-L10: leafletSize (Skin per-leaflet)
- **File**: `packages/tomato-geometry/src/leafChunk.ts:155`
- **Code**:
  ```ts
  leafletSize = 0.12 × sizeFactor × expansionScale × baseSizeMod × stageScale × rng(0.92, 1.08)
  ```
- **Inputs**: `expansionScale = maturity²`, `baseSizeMod = isTerminal ? 1.2 : 0.5+0.5·sin(t·π)`, `stageScale` (outermost fade)
- **Output**: 개별 leaflet 크기
- **Unit**: meters
- **Source**: Phase A.3 asymmetry guideline §7.2
- **Layer**: Skin

### EQ-L11: petioleRadius (Skin taper)
- **File**: `packages/tomato-geometry/src/leafChunk.ts:101-102`
- **Code**:
  ```ts
  baseRadius = 0.0018 × sizeFactor;  tipRadius = 0.0012 × sizeFactor
  ```
- **Output**: petiole base→tip radius
- **Unit**: meters
- **Layer**: Skin

### EQ-L12: rachisRadius (Skin taper)
- **File**: `packages/tomato-geometry/src/leafChunk.ts:124-125`
- **Code**:
  ```ts
  baseRadius = 0.0010 × sizeFactor;  tipRadius = 0.0005 × sizeFactor
  ```
- **Output**: rachis base→tip radius
- **Unit**: meters
- **Layer**: Skin

---

## 2. Stem

### EQ-S1: internode finalLen (vigor sigmoid 기반)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:918-934`
- **Code**:
  ```ts
  S = sigmoid(nodeDay, heightSigmoidK, heightSigmoidMid)
  vigor = 4 × S × (1-S)                                   // 0-1, peak at midpoint
  finalLen = baseInternode × (vigorFloor + vigorRange × vigor)
  ```
- **Inputs**: `baseInternode` (cultivar 5-8 cm), `vigorFloor` (botanical 0.75), `vigorRange` (botanical 0.5), nodeDay
- **Output**: 절간 target 길이
- **Unit**: cm
- **Source**: botanical layer (matureInternode + heightCurve sigmoid)
- **Layer**: PlantBase

### EQ-S2: internode elongation sigmoid (delayed)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:936-943`
- **Code**:
  ```ts
  elongAge = age - elongDelay
  elongation = elongAge ≤ 0 ? PRE_ELONG : max(PRE_ELONG, sigmoid(elongAge, ELONG_K, elongMid))
  ```
- **Inputs**: `elongDelay` (cultivar 4 days), `elongMid` (cultivar 8 days), `ELONG_K` (botanical 0.4), `PRE_ELONG` (0.01)
- **Output**: 0.01→1 elongation progress
- **Unit**: dimensionless
- **Source**: botanical (GA-mediated delay model)
- **Layer**: PlantBase

### EQ-S3: currentLen
- **File**: `packages/tomato-engine/src/GrowthModel.ts:943`
- **Code**:
  ```ts
  currentLen = finalLen × elongation
  ```
- **Unit**: cm
- **Layer**: PlantBase

### EQ-S4: seedling internode (fixed pattern)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:920-922`
- **Code**:
  ```ts
  finalLen = seedFirstLen + i × seedSlope   // for i < seedCount
  ```
- **Inputs**: `seedFirstLen` (botanical 1.5 cm), `seedSlope` (botanical 0.8 cm/node), `seedCount` (botanical 4)
- **Output**: 첫 4 노드 고정 길이
- **Unit**: cm
- **Layer**: PlantBase

### EQ-S5: taperStartFrac (apical narrowing)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:931-933`
- **Code**:
  ```ts
  if (nodeFrac > taperStart) finalLen *= 1.0 - (nodeFrac - taperStart) × taperSlope
  ```
- **Inputs**: `taperStart` (botanical 0.8), `taperSlope` (botanical 0.5)
- **Output**: 상위 20% 길이 reduction
- **Unit**: dimensionless multiplier
- **Layer**: PlantBase

### EQ-S6: stemRadiusMm (pipe model + cambial)
- **File**: `packages/tomato-engine/src/PhysicsModel.ts:100-106`
- **Code**:
  ```ts
  massR2Mm² = massAboveKg × 0.0000025 × 1e6 × strengthFactor
  cambialMm² = age × 0.7 × strengthFactor
  rawRadius = √(massR2Mm² + cambialMm² + MIN_RADIUS²)
  ```
- **Inputs**: `massAboveKg` (cumulative), `age` (days), `strengthFactor` (genome)
- **Output**: stem radius (clamp 2-11.5 mm)
- **Unit**: mm
- **Source**: Phase 7 physics (gap analysis P1 #6: 12→11.5 mm cap)
- **Layer**: PlantBase

### EQ-S7: stemRadius (side-shoot pipe model)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:663-664`
- **Code**:
  ```ts
  stemRadiusMm = parentNode.stemRadiusMm × 0.6 × max(0.15, 1 - k / shootInternodes)
  ```
- **Inputs**: `parentNode.stemRadiusMm`, k (node index), `shootInternodes`
- **Output**: 측지 radius (base→tip taper)
- **Unit**: mm
- **Source**: Marcelis 1996 (0.6 secondary status)
- **Layer**: PlantBase

### EQ-S8: hypocotylCm
- **File**: `packages/tomato-engine/src/GrowthModel.ts:906-908`
- **Code**:
  ```ts
  hypocotylCm = day < hypoEmergeDay ? 0 : min(hypoMax, (day - hypoEmergeDay) × hypoRate)
  ```
- **Inputs**: `hypoEmergeDay` (botanical 5), `hypoMax` (botanical 4 cm), `hypoRate` (botanical 0.8 cm/day)
- **Output**: 자엽하 부분 길이
- **Unit**: cm
- **Layer**: PlantBase

### EQ-S9: heightCm accumulation (bottom-up)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:947-958`
- **Code**:
  ```ts
  accHeight = hypocotylCm; for (i) accHeight += internodeData[i].currentLen
  ```
- **Output**: 각 노드 누적 height
- **Unit**: cm
- **Layer**: PlantBase

### EQ-S10: stemVigorFactor (lightweight proxy)
- **File**: `packages/tomato-engine/src/growth/LeafGrowthModel.ts:204-207`
- **Code**:
  ```ts
  stemVigorFactor = max(0.5, min(1.5, √(heightCm / 50)))
  ```
- **Inputs**: `heightCm` (현재 plant height), reference 50 cm
- **Output**: 0.5-1.5 multiplier
- **Unit**: dimensionless
- **Source**: Plan §6.3, Iter 29 v1 P3 (commit 382dcc2 lightweight proxy, NOT carbon partition)
- **Layer**: PlantBase

---

## 3. Fruit

### EQ-F1: diameterMm sigmoid (legacy visual)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1168-1169`
- **Code**:
  ```ts
  diameterMm = fruitMaxDiameterMm × sigmoid(fruitAge, FRUIT_SIGMOID_K, FRUIT_SIGMOID_MID)
  ```
- **Inputs**: `fruitMaxDiameterMm` (arch sample), `fruitAge` (days), `FRUIT_SIGMOID_K` (botanical), `FRUIT_SIGMOID_MID` (botanical 35)
- **Output**: 시각 fruit 지름
- **Unit**: mm
- **Source**: botanical (legacy — Phase 3 hybrid uses CoreModel physiology)
- **Layer**: PlantBase

### EQ-F2: Gompertz mass (potentialFreshWeight)
- **File**: `packages/tomato-engine/src/FruitGrowth.ts:45-60`
- **Code**:
  ```ts
  W(t) = a × exp(-exp(-b · (t - τ) × exponentScaling))
  ```
- **Inputs**:
  - `a` = `genome.potentialMassG` (per-fruit sampled)
  - `b` = `cultivar.gompertzRateB × genome.ripeningSpeedFactor`
  - `τ` = `(cellDivisionDurationGDD + cellExpansionDurationGDD) × cultivar.gompertzInflectionC`
  - `exponentScaling` = botanical
  - `t` = `gddSinceFert`
- **Output**: 잠재 fresh weight
- **Unit**: grams FW
- **Source**: Anaya-Ramirez 2024 (R²>0.99); Gillaspy 1993 3-phase
- **Layer**: PlantBase (Phase 2+ physiology)

### EQ-F3: potentialStepFreshGrowthG (Gompertz 미분 — daily increment)
- **File**: `packages/tomato-engine/src/FruitGrowth.ts:118-128`
- **Code**:
  ```ts
  stepGrowth = max(0, W(gddEnd) - W(gddStart))
  ```
- **Output**: 일별 mass 증가
- **Unit**: g/step
- **Layer**: PlantBase

### EQ-F4: ripenStage & ripenFraction (color)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1173-1178`
- **Code**:
  ```ts
  ripenProgress = (fruitAge - RIPEN_START_AGE) / RIPEN_DURATION
  totalStageProgress = ripenProgress × 5
  ripenStage = floor(clamp(0, 5, totalStageProgress))
  ripenFraction = totalStageProgress - ripenStage
  ```
- **Inputs**: `RIPEN_START_AGE` (botanical 35d), `RIPEN_DURATION` (botanical 20d)
- **Output**: stage (0-5) + 0-1 blend
- **Unit**: dimensionless
- **Source**: botanical (ripening phenology)
- **Layer**: PlantBase

### EQ-F5: cotyledonSize (emergence & senescence)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1367`
- **Code**:
  ```ts
  cotyledonSize =
    day < 3 ? 0 :
    day < 8 ? (day-3)/5 :
    day < 25 ? max(0, 1-(day-15)/10) : 0
  ```
- **Output**: 0→1→0 size (expand 3-8d, peak 8-15d, fade 15-25d)
- **Unit**: dimensionless (× 0.008 m base = real size)
- **Source**: hardcoded seedling phenology
- **Layer**: PlantBase

---

## 4. Phytomer

### EQ-P1: nodeInitiationTT (phyllochron)
- **File**: `packages/tomato-engine/src/growth/PhytomerModel.ts:74-86`
- **Code**:
  ```ts
  initiationTT = (nodeIndex - initialNodeCountAtTransplant) × phyllochronTT + TT_at_transplant
  ```
- **Inputs**: `nodeIndex` (0-based), `initialNodeCountAtTransplant` (5), `phyllochronTT` (cultivar 38 GDD), `TT_at_transplant` (280 GDD)
- **Output**: 노드 initiation TT
- **Unit**: GDD
- **Source**: Plan §3, Heuvelink 1996 TOMSIM (38 GDD/leaf)
- **Layer**: PlantBase

### EQ-P2: nodeAgeTT
- **File**: `packages/tomato-engine/src/growth/PhytomerModel.ts:110-111`
- **Code**:
  ```ts
  ageTT = max(0, currentTT - initiationTT)
  ```
- **Unit**: GDD
- **Source**: Plan §3 (GROWTH-CLOCK-02)
- **Layer**: PlantBase

### EQ-P3: dailyGDD (bridge legacy day-based)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:836`
- **Code**:
  ```ts
  dailyGDD = day > 0 ? TT / day : 0
  ```
- **Output**: 일평균 GDD
- **Unit**: GDD/day
- **Source**: Plan §3 (Phase 2A intermediate bridge)
- **Layer**: PlantBase

### EQ-P4: nodeDayOf (legacy 계산 보조)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:845-858`
- **Code**:
  ```ts
  nodeDay =
    i < initialN ? (offsetDay + i × spread) :
    (emergenceTT / dailyGDD)
  ```
- **Inputs**: `offsetDay` (botanical -30), `spread` (botanical 0.5)
- **Output**: 노드 _birth day_ (day-based legacy 필드용)
- **Unit**: days
- **Source**: PROBE A.1 (2026-05-25 fix)
- **Layer**: PlantBase

### EQ-P5: phyllotaxisAngle (golden spiral)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:998`
- **Code**:
  ```ts
  phyllotaxisAngle = (i × GOLDEN_ANGLE + genome.phyllotaxisJitter × i × 0.3) % 360
  ```
- **Inputs**: i (node index), `GOLDEN_ANGLE = 137.508°`, jitter (genome)
- **Output**: 잎 azimuth (degrees)
- **Unit**: degrees
- **Source**: Fibonacci spiral (canonical botanical)
- **Layer**: PlantBase

### EQ-P6: plantJuvenileScale (seedling→full plant)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1019`
- **Code**:
  ```ts
  plantJuvenileScale = day < 15 ? (0.3 + 0.7 × day/15) : 1.0
  ```
- **Output**: 0.3→1.0 over first 15 days
- **Unit**: dimensionless
- **Source**: Iter 16 SSOT #169
- **Layer**: PlantBase

---

## 5. Senescence

### EQ-SN1: senescenceStartTT
- **File**: `packages/tomato-engine/src/growth/SenescenceModel.ts:23-28`
- **Code**:
  ```ts
  senescenceStartTT = initiationTT + leafLifespanTT × senescenceStartRatio   // 0.7 default
  ```
- **Inputs**: `leafLifespanTT` (cultivar 1200 GDD), `senescenceStartRatio` (0.7)
- **Output**: 노화 시작 TT
- **Unit**: GDD
- **Source**: Plan §12 (~70% lifespan)
- **Layer**: PlantBase

### EQ-SN2: senescenceProgress sigmoid
- **File**: `packages/tomato-engine/src/growth/SenescenceModel.ts:44-56`
- **Code**:
  ```ts
  delta = ageTT - senescenceStartOffsetTT
  midpoint = senescenceDurationTT / 2
  progress = 1 / (1 + exp(-steepness × (delta - midpoint)))   // steepness 0.012
  ```
- **Output**: 0→1 노화 progress
- **Unit**: dimensionless
- **Source**: Plan §12 (LEAF-SENESCENCE-TT-01)
- **Layer**: PlantBase

### EQ-SN3: colorDullness
- **File**: `packages/tomato-engine/src/growth/SenescenceModel.ts:63-65`
- **Code**:
  ```ts
  progress ≤ 0.15 ? 0 : (progress - 0.15) / 0.7   // clamp 0-1
  ```
- **Output**: 0→1 색 둔화 (chlorophyll loss)
- **Unit**: dimensionless
- **Layer**: PlantBase

### EQ-SN4: visibleAreaFactor
- **File**: `packages/tomato-engine/src/growth/SenescenceModel.ts:73-75`
- **Code**:
  ```ts
  progress ≤ 0.5 ? 1 : max(0.15, 1 - (progress - 0.5) × 1.7)
  ```
- **Output**: 0.15→1 area multiplier
- **Unit**: dimensionless
- **Layer**: PlantBase

### EQ-SN5: senescenceCurl
- **File**: `packages/tomato-engine/src/growth/SenescenceModel.ts:82-84`
- **Code**:
  ```ts
  progress ≤ 0.2 ? 0 : min(0.6, (progress - 0.2) × 0.75)
  ```
- **Output**: 0→0.6 curl
- **Unit**: dimensionless
- **Layer**: PlantBase

### EQ-SN6: senescenceDroopDeg
- **File**: `packages/tomato-engine/src/growth/SenescenceModel.ts:91-92`
- **Code**:
  ```ts
  min(35, progress × 35)
  ```
- **Output**: 0→35° 추가 droop
- **Unit**: degrees
- **Layer**: PlantBase

### EQ-SN7: yellowing (legacy day-based bridge)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1047`
- **Code**:
  ```ts
  yellowing = age > 60 ? min(1, (age - 60) / 30) : 0
  ```
- **Output**: 0→1 yellowing
- **Unit**: dimensionless
- **Source**: Phase 2A bridge (TT canonical로 점진 replace; Phase 5 deprecate 예정)
- **Layer**: PlantBase
- **Note**: ⚠️ Legacy alias path. TT canonical EQ-SN2와 blending됨.

### EQ-SN8: ageDroop
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1053-1057`
- **Code**:
  ```ts
  ageDroop =
    age < 8 ? 0 :
    age < 20 ? min(25, (age-8) × 1.2 × droopMult) :
    min(55, 15 + (age-20) × 0.8 × droopMult)
  ```
- **Inputs**: `droopMult` (genome.leafDroopMultiplier)
- **Output**: 0→25→55° age-dependent droop
- **Unit**: degrees
- **Source**: hardcoded (two-slope formula)
- **Layer**: PlantBase

### EQ-SN9: weightDroop (cantilever 기계학)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1052`
- **Code**:
  ```ts
  weightDroop = (leafMassG / 1000) × armLenM² × 6000
  ```
- **Inputs**: `leafMassG`, `armLenM` (0.22 m petiole cantilever), DROOP_WEIGHT_COEFF=6000
- **Output**: 무게 droop (degrees)
- **Unit**: degrees
- **Source**: cantilever beam mechanics (mass × arm²)
- **Layer**: PlantBase

---

## 6. Source-Sink Proxy V1

### EQ-SS1: organDemand
- **File**: `packages/tomato-engine/src/growth/SourceSinkProxyV1.ts:30-40`
- **Code**:
  ```ts
  demand = nodeCount × avgLeafTargetArea + trussCount × trussSinkStrength × 100
  ```
- **Inputs**: `nodeCount`, `averageLeafTargetAreaCm2` (cultivar.max × 0.7), `trussCount`, `trussSinkStrength` (1.0)
- **Output**: 합성 sink strength
- **Unit**: dimensionless
- **Source**: Plan §6.4 (Marcelis 1996 sink-strength, lightweight approx)
- **Layer**: PlantBase
- **Note**: ★ plant-wide single scalar — axis 별 분리 0. Iter 30 Phase 3에서 axis variant 추가 예정.

### EQ-SS2: assimilateSupply
- **File**: `packages/tomato-engine/src/growth/SourceSinkProxyV1.ts:52-59`
- **Code**:
  ```ts
  baseSupply = heightCm² × 0.5
  supply = baseSupply × (1 - stressFactor)
  ```
- **Inputs**: `heightCm`, `stressFactor` (0-1 water+disease composite)
- **Output**: assimilate supply proxy
- **Unit**: dimensionless
- **Source**: Plan §6.4 (height² proxy for LAI, NOT photosynthesis model)
- **Layer**: PlantBase

### EQ-SS3: sourceSinkProxyV1 (clamp ratio)
- **File**: `packages/tomato-engine/src/growth/SourceSinkProxyV1.ts:76-79`
- **Code**:
  ```ts
  clamp(supply / demand, 0.65, 1.15)
  ```
- **Output**: 0.65-1.15 multiplier
- **Unit**: dimensionless
- **Source**: Plan §6.4, Phase 2B v1 narrow clamp
- **Layer**: PlantBase

---

## 7. Thermal Time

### EQ-TT1: computeGDDDay
- **File**: `packages/tomato-engine/src/growth/ThermalTime.ts:43-49`
- **Code**:
  ```ts
  T_eff = max(0, min(T_max_C, T_mean_C) - T_base_C)
  ```
- **Inputs**: `T_mean_C` (daily mean temp), `T_base_C` (cultivar 10°C), `T_max_C` (cardinal ceiling 30°C)
- **Output**: GDD for one day
- **Unit**: GDD (°C·days)
- **Source**: Heuvelink 1996 TOMSIM canonical
- **Layer**: PlantBase

---

## 8. Leaf Posture (Skeleton + PlantBase)

### EQ-POSTURE1: composeLeafRotation ★ R4 결함
- **File**: `src/plant/skeleton/AnchorTransform.ts:64-74`
- **Code**:
  ```ts
  qY = quatY(azimuthDeg)     // world Y axis 회전
  qX = quatX(-droopDeg)      // world X axis 회전
  qZ = quatZ(twistDeg)       // world Z axis 회전
  return quatMul(qY, quatMul(qX, qZ))   // Y ⊗ X ⊗ Z (twist innermost)
  ```
- **Inputs**: azimuthDeg, droopDeg, twistDeg
- **Output**: Quat4 (x,y,z,w)
- **Source**: ★ **알려진 결함** — _world axis_ 기반. Stem이 휘어도 leaf orientation은 world Y에 lock. 모든 잎이 동일 평면에 누적. SkeletonNode.frame (LocalFrame, Iter 26 PR 1-1)이 _정의되어 있으나 사용 안 됨_.
- **Layer**: Skeleton (populator) → Skin이 anchor.rotation 그대로 적용
- **Note**: Phase 0.D에서 `composeLeafRotationLocal(stemFrame, ...)` 로 fix 예정.

### EQ-POSTURE2: petioleElevationDeg
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1263`
- **Code**:
  ```ts
  petioleElevationDeg = 35 - 23 × leafMaturity - senescenceState.droopDeg × 0.5
  ```
- **Inputs**: leafMaturity (0-1), senescenceState.droopDeg
- **Output**: petiole elevation (degrees; 35° young → 12° mature)
- **Unit**: degrees
- **Source**: hardcoded calibration
- **Layer**: PlantBase

### EQ-POSTURE3: azimuthDeg (phyllotaxis spiral, posture-level)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1262`
- **Code**:
  ```ts
  azimuthDeg = (i × 137.508 + genome.phyllotaxisJitter × i × 0.3) % 360
  ```
- **Output**: leaf azimuth (0-360°)
- **Unit**: degrees
- **Source**: Fibonacci spiral
- **Layer**: PlantBase

### EQ-POSTURE4: droopDeg composition (weight + age + stress + senescence)
- **File**: `packages/tomato-engine/src/GrowthModel.ts:1063-1066`
- **Code**:
  ```ts
  droopExtra = min(120, weightDroop + ageDroop + waterStressDroop + senescenceDroop)
  ```
- **Inputs**: EQ-SN9 weightDroop, EQ-SN8 ageDroop, `waterStress × 30`, `yellowing × 25`
- **Output**: 0-120° total droop
- **Unit**: degrees
- **Source**: Plan §11 composite
- **Layer**: PlantBase
- **Note**: ★ Iter 30 Phase 5에서 gravity/senescence/water/stress 분리 9-필드로 재정의 예정.

---

## 9. Geometry Morphology (Skin)

### EQ-GEO1: petiole arch geometry (gravity curve)
- **File**: `packages/tomato-geometry/src/leafChunk.ts:112-120`
- **Code**:
  ```ts
  archY = sin(t·π) × petioleLen × archStrength       // archStrength = 0.03 × (1 - ageFrac × 4)
  gravityY = -t^1.6 × petioleLen × (0.08 + ageFrac × 0.35)
  ```
- **Inputs**: t ∈ [0,1] along petiole, ageFrac
- **Output**: 정점 별 Y offset (arch young / droop old)
- **Unit**: meters
- **Source**: Phase 3 cantilever beam + parametric aging (exponent 1.6)
- **Layer**: Skin

### EQ-GEO2: rachis droop geometry (parabolic sag)
- **File**: `packages/tomato-geometry/src/leafChunk.ts:129-136`
- **Code**:
  ```ts
  rachisDroop = t² × rachisLen × (0.12 + ageFrac × 0.45)
  ```
- **Inputs**: t ∈ [0,1], ageFrac
- **Output**: rachis 따라 정점 Y offset (parabolic)
- **Unit**: meters
- **Source**: Skin geometry (parabolic cantilever)
- **Layer**: Skin

---

## 부록 A — 핵심 상수

| 기호 | 값 | 위치 | 비고 |
|---|---|---|---|
| GOLDEN_ANGLE | 137.508° | GrowthModel.ts:998 | Fibonacci canonical |
| T_base (tomato) | 10°C | ThermalTime.ts:43 | cultivar override 가능 |
| T_max | 30°C | ThermalTime.ts | cardinal ceiling |
| vigorFloor | 0.75 | botanical.matureInternode | off-peak 노드 elongation 비율 |
| MIN_RADIUS_MM | 2 | PhysicsModel.ts:18 | growing tip 최소 |
| MAX_RADIUS_MM | 11.5 | PhysicsModel.ts:22 | gap P1 #6 cap (12→11.5) |
| CAMBIAL_GROWTH_MM2_PER_DAY | 0.7 | PhysicsModel.ts:30 | secondary growth |
| DROOP_WEIGHT_COEFF | 6000 | GrowthModel.ts:1051 | cantilever tuning |
| leafMassG coeff | 25 | GrowthModel.ts:1045 | g per leafSizeFactor² × maturity |
| BASE_LEAF_AREA_CM2 | ✗ 880 hardcoded (Iter 29 P1-Pre 제거) | cultivar.growthProfile.maxLeafAreaCm2로 이관 | cherry 550 / round 700 / beefsteak 850 / roma 650 / tomimaru 800 |
| petioleLength baseline | 0.08 m | leafChunk.ts (genome) | mature ~ 30-40cm 도달 ratio |
| rachisLen baseline | 0.32 m | leafChunk.ts:98 | mature petiole+rachis ~ 40cm |

---

## 부록 B — Layer 별 요약

### PlantBase (computePlantState + growth/ 모듈)
- Leaf: EQ-L1~7 (area, mass, expansion, leaflet count)
- Stem: EQ-S1~10 (internode, radius, height, vigor)
- Fruit: EQ-F1~5 (diameter, Gompertz, ripening, cotyledon)
- Phytomer: EQ-P1~6 (TT, phyllotaxis, juvenile)
- Senescence: EQ-SN1~9 (TT canonical + legacy day-based bridge)
- Source-Sink: EQ-SS1~3 (proxy)
- Thermal Time: EQ-TT1
- Posture: EQ-POSTURE2~4 (PlantBase computes posture values)

### Skeleton (AnchorTransform + populator)
- EQ-POSTURE1 composeLeafRotation (Quat4)

### Skin (leafChunk + cotyledonChunk + buildLeafMeshFromPhytomer)
- Leaf morphology: EQ-L8~12 (petiole, rachis, leaflet, radii)
- Geometry deformation: EQ-GEO1~2 (arch, droop)
- cotyledonChunk (cotyledonSize × oval ratio — EQ-F5 + widthLengthRatio 0.35)

---

## 부록 C — 알려진 결함 (Iter 30 Phase 0.A~0.D fix 대상)

| ID | 수식 | 문제 | Phase fix |
|---|---|---|---|
| **R1** | EQ-L3 `leafAreaCm2 = max × leafSizeFactor²` | quadratic compounding → cultivar bound 1.82× 초과 | Phase 0.A linear product 3-stage |
| **R2** | populator `findNodeState(axisIdx !== 0) → undefined` | 측지 phytomer 미바인딩 → leaf mesh bbox=0 | Phase 0.B `state.allAxes` 순회 추가 |
| **R3** | EQ-SS3 plant-wide single proxy | 측지가 더 약하다는 axis 정보 미반영 | Phase 3 axis variant 추가 |
| **R4** | EQ-POSTURE1 `composeLeafRotation` world-frame | stem 휘어도 world Y 회전 → 동일 평면 누적 | Phase 0.D `composeLeafRotationLocal(stemFrame, ...)` |
| **R5** | EQ-POSTURE4 `droopExtra` 단일 합산 | light-facing + gravity 분리 안 됨 | Phase 5 9-필드 분해 |

---

## 검증 요청 사항 (사용자 직접)

1. **각 수식이 _과학적으로 맞는가?_** — 특히:
   - EQ-L2 `leafSizeFactor` 4-factor 산식의 _의미_ (이미 R1 quadratic 결함 알고 있음)
   - EQ-SN8 `ageDroop`의 두-slope hardcoded (25 / 55° threshold)
   - EQ-S6 `stemRadiusMm`의 `massR2 = mass × 0.0000025 × 1e6 × strengthFactor` 계수
   - EQ-F2 Gompertz 산식 + `exponentScaling` 위치
   - EQ-POSTURE4 droop composition이 단일 스칼라 합산인 점
2. **결함 list 회신**:
   - R1~R5 외에 추가 결함이 있는가?
   - 산식 자체가 틀린 게 있는가?
   - 의미는 맞는데 _상수_가 틀린 게 있는가?
3. **literature reference 누락**: Plan §6, Heuvelink 1996, Marcelis 1996, Gillaspy 1993, Anaya-Ramirez 2024 외에 추가해야 할 출처는?

회신 받으면 Phase 0.A~0.D _구체 산식 fix_에 반영합니다.
