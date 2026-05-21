# 토마토 생육 단계별 알고리즘 가이드

이 문서는 토마토 한 그루의 일생을 **모델(엔진)** 과 **렌더(메시)** 두 측면에서 단계별로 정리한 레퍼런스입니다. 모든 단계는 `@farmsim/tomato-engine` 의 `PlantState` 출력을 기반으로 자동 결정되며, 렌더러(Babylon `ShowcasePlant` / `SupportingPlant`)는 그 상태를 그대로 메시화합니다.

목차

1. [생장 단계 개요 (6 GROWTH_STAGES + Day-별 timeline)](#1-생장-단계-개요)
2. [떡잎 (Cotyledon) — 3 sub-stage](#2-떡잎-cotyledon)
3. [본엽 → 복엽 (Leaf) — 6 stage](#3-본엽--복엽-leaf)
4. [잎 처짐 + 노화 + 잎 제거](#4-잎-처짐--노화--제거)
5. [줄기 (Stem) — 4 단계](#5-줄기-stem)
6. [꽃 → 과실 (Flower) — 5 단계](#6-꽃--과실-flower)
7. [과실 익기 (Fruit Ripening) — 6 단계](#7-과실-익기-fruit-ripening)
8. [환경 변수 + 스트레스 (WaterStress / Disease)](#8-환경-변수--스트레스)
9. [코드 사용 예](#9-코드-사용-예)
10. [Glossary — 생물학 ↔ 코드 변수](#10-glossary)

---

## 1. 생장 단계 개요

엔진 정의 (`GrowthModel.GROWTH_STAGES`):

| # | 한국어 | Day 범위 | 핵심 사건 |
|---|--------|----------|----------|
| 1 | 육묘기 (Seedling) | 0–10 | 발아 → 떡잎 emergence → 첫 본엽 |
| 2 | 영양생장기 (Vegetative) | 10–35 | 줄기·잎 빠른 확장, 절간 신장 |
| 3 | 개화기 (Flowering) | 35–50 | 첫 화방 출현, 꽃 만개 |
| 4 | 착과기 (Fruit set) | 50–70 | 과실 visible, 비대 시작 |
| 5 | 과실비대기 (Fruit growth) | 70–95 | 과실 max diameter 도달 |
| 6 | 숙성기 (Ripening) | 95–120 | 색 변화 6단계, 잎 노화 |

실제 토마토 생리와 부합 (UMaine extension, 그린하우스 토마토 표준 자료). 우리 게놈 기본값 — `nodeStartDay=5`, `trussStartNode=10`, `ripenStartAge=25`, `ripenDuration=18` — 도 같은 timeline.

---

## 2. 떡잎 (Cotyledon)

> "Seedling Stage / 떡잎 2장 (oval)" — 사용자 자료 §1

### 모델 (engine)

`GrowthModel.computePlantState` 안의 cotyledon 모델:

```ts
hasCotyledons = (day >= 3 && day < 25);
cotyledonSize =
  day < 3  ? 0                                    // 미발아
  : day < 8 ? (day - 3) / 5                       // 0 → 1  (emerging)
  : day < 25 ? Math.max(0, 1 - (day - 15) / 10)   // 1 → 0  (fading)
  : 0;
```

3 sub-stage:

| sub-stage | day | cotyledonSize | 시각 |
|-----------|-----|--------------|------|
| **Emerging** | 3–8 | 0 → 1 (linear ramp) | 작게 등장, 점점 커짐 |
| **Peak** | 8–15 | 1 (잠시 유지) | 가장 큼, 첫 본엽 옆에 함께 |
| **Fading** | 15–25 | 1 → 0 (linear decline) | 점점 작아지고 떨어짐 |

### 렌더 (Babylon)

`ShowcasePlant.buildFromState` 안의 cotyledon 분기:

```ts
if (state.hasCotyledons && state.cotyledonSize > 0.01) {
  const cotSize = 0.03 * state.cotyledonSize;        // ~3cm peak
  const cotY = (state.nodes[0]?.heightCm / 100 ?? 0.03) * 0.3;
  for (const side of [-1, 1]) {
    const chunk = buildCotyledonChunk({ size: cotSize });  // 16-seg oval
    // ... applyChunkToMesh + position + rotation(±X out, +35°)
    cotyledonMat.alpha = Math.max(0.5, cotyledonSize * 1.4);  // alpha fade
  }
}
```

`buildCotyledonChunk` (engine-agnostic, `@farmsim/tomato-geometry`):
- 16-segment triangle fan
- length = `size * 2` (X 축), width = `size` (Z 축)
- 단순 평면, 정맥 없음, 톱니 없음 — 떡잎은 본엽보다 단순

---

## 3. 본엽 → 복엽 (Leaf)

> "Early True → Compound → Mature Leaf" — 사용자 자료 §2-4

### 모델

`GrowthModel.computePlantState` 가 노드별로 `leafMaturity`(0–1) + `leafletCount`(5/7/9) 계산. `LeafStage.getLeafStage(node, plantAge)` 가 이걸 6 단계로 분류하면서 **부드러운 blendT** 도 함께 반환 (renderer 가 morphing 가능):

| 단계 | 트리거 | leafletCount (실제) | serration | lobe |
|------|--------|---------------------|-----------|------|
| **PRUNED** | leafMaturity < 0.05 | 0 (skip) | 0 | 0 |
| **SENESCENT** | yellowing > 0.3 | 그대로 (그러나 yellow material) | 1.0 | 1.0 |
| **COTYLEDON** | plantAge < 15 AND node.index=0 AND maturity < 0.3 | 2 | 0 | 0 |
| **EARLY_TRUE** | leafMaturity < 0.4 | **1 → 3** (blendT 따라) | 0 → 0.4 | 0 → 0.3 |
| **COMPOUND_DEVELOPING** | 0.4 ≤ maturity < 0.7 | **5 → 7** (continuous) | 0.4 → 0.7 | 0.5 → 0.75 |
| **COMPOUND_MATURE** | maturity ≥ 0.7 | **7 → 9** (continuous) | 0.7 → 1.0 | 0.75 → 1.0 |

`leafletCount` 가 실수값이라는 게 핵심 — 외측 페어 leaflet 의 크기를 `(1 - |intCount - rawCount| × 2)` 로 보간해서 5→6→7 같은 전환에서 6, 7번째 leaflet 이 **갑자기 나타나지 않고** 점점 자람.

### 렌더

`buildLeafChunk` (engine-agnostic) 가 NodeState + stageInfo 받아서:

```ts
// outermost leaflet stage-blend scale
const isOutermost = !isTerminal && i === pairs - 1;
const stageScale = isOutermost ? (1 - |intCount - rawCount| * 2) : 1;
const leafletSize = 0.12 * sizeFactor * maturity² * baseSizeMod * stageScale * rng.range(0.8, 1.2);

// effective shape — stage strengths multiply genome's defaults
const effSerrationDepth = genome.leafSerrationDepth * stageInfo.serrationStrength;
const effLobeDepth = genome.leafLobeDepth * stageInfo.lobeStrength;
```

ShowcasePlant 가 `createLeafMeshFromNode(node, genome, plantAge, rng)` 로 호출, SupportingPlant 은 같은 알고리즘에 leaflet 수를 절반으로 (`Math.round(stageInfo.leafletCount * 0.5)`) 줄여서 가벼운 LOD.

---

## 4. 잎 처짐 + 노화 + 제거

### 처짐 (droopExtra)

`GrowthModel` 에서 일별로 계산:

```ts
// 무게 기반 (단위: 도)
weightDroop = (leafMassG / 1000) * armLen² * 6000;

// 나이 기반
ageDroop =
  age < 8   ? 0
  : age < 20 ? min(25, (age - 8) * 1.2 * leafDroopMultiplier)
  : min(55, 15 + (age - 20) * 0.8 * leafDroopMultiplier);

// 수분 스트레스 — 사용자 자료의 leaf.droop += waterStress * 0.45 와 같은 효과
waterStressDroop = waterStress * 30;

droopExtra = min(120, weightDroop + ageDroop + waterStressDroop);  // 도
```

총 0–120° 범위. ShowcasePlant 는 이 값을 `Quaternion.RotationAxis(Z, -droopRad)` 로 잎 메시에 직접 적용.

`buildLeafChunk` 내부에서도 ageFrac 따라 petiole + rachis 곡선을 변형 (gravity sag):

```ts
// 사용자 자료의 vertex.y -= droop * pow(distance, 1.6) 채택
gravityY = -Math.pow(t, 1.6) * petioleLen * (0.08 + ageFrac * 0.35);
```

### 노화 (yellowing)

```ts
yellowing = age > 60 ? min(1, (age - 60) / 30) : 0;
```

`SHOWCASE_SEED` 식물 기준 day 60+ 시작, day 90 무렵 완전 노란색. `ShowcasePlant` 가 `node.yellowing > 0.4` 면 `yellowLeafMaterial` 로 swap.

### 제거 (Pruning) — 그린하우스 관행

가장 낮은 ripenStage ≥ 4 (담적색) 화방을 찾아 그 아래 모든 노드의 `leafMaturity = 0` 으로 설정. 빛 침투를 위해 실제 농장에서 하는 작업.

```ts
// GrowthModel.computePlantState 끝부분
for (const node of nodes) {
  if (node.truss?.fruits.some(f => f.ripenStage >= 4)) {
    pruneBelow = node.index;
    break;
  }
}
if (pruneBelow > 0) {
  for (const n of nodes) if (n.index < pruneBelow) n.leafMaturity = 0;
}
```

ShowcasePlant 의 `if (node.leafMaturity < 0.05) continue` 가 시각적으로 잎을 제외.

---

## 5. 줄기 (Stem)

`StemGenerator.createStemMesh` 가 NodeState 배열을 받아 Frenet 곡선 + 정점 색 woodiness 로 메시 생성. 단계는 자동으로 다음과 같이 표현됨:

| 단계 | 조건 | stemRadiusMm | vertex color (base→tip) |
|------|------|--------------|------------------------|
| **Hypocotyl** | day < 10 AND height < 4cm | 2 mm | herbaceous green (얇음) |
| **Herbaceous** | day 10–50 | ~5 mm | green dominant |
| **Active Growth** | day 50–90 | ~8–12 mm | brown base → green tip (woodiness 시작) |
| **Lignified** | day 90+ | 12 mm (clamped) | base 짙은 갈색, woodiness ≈ 1.0 |

`stemRadiusMm` 는 PhysicsModel 의 pipe-model 출력:
```ts
radius = sqrt(massAboveKg * 0.000025 * stemStrengthFactor + MIN_RADIUS_MM²)
```

`woodiness = (1 - t)^0.6` 로 vertex color 보간 (`t` 는 base=0, tip=1):
```ts
r = 0.35 * woodiness + 0.28 * (1 - woodiness);  // brown↔green
g = 0.22 * woodiness + 0.55 * (1 - woodiness);
b = 0.12 * woodiness + 0.22 * (1 - woodiness);
```

`deflectionRad / deflectionAzimuth` (PhysicsModel 의 화방 무게 굽힘) 가 control point 에 누적 적용되어 줄기가 실제로 휨.

---

## 6. 꽃 → 과실 (Flower)

`TrussState.flowers[]` + `TrussState.fruits[]` 가 동시 존재. `FlowerState.bloomProgress` (0–1) 가 꽃 lifecycle 을 표현하고, 12일 후 `FruitState` 가 생성되면서 꽃이 점진 fade.

### 5 단계 (사용자 자료 §6)

| 단계 | 트리거 | 모양 | 비고 |
|------|--------|------|------|
| **Bud (봉오리)** | bloomProgress < 0.2 | 5 sepal + 작은 닫힌 petal cluster | 닫힌 컵 모양 |
| **Opening (열림)** | 0.2 ≤ p < 0.5 | petal 반쯤 펴짐 | reflex 시작 |
| **Full Bloom (만개)** | 0.5 ≤ p < 0.8 | petal 완전 펴짐 | 노란 별 모양 |
| **Petal Fall (꽃잎 떨어짐)** | p ≥ 0.8 | petal Y 감소 + length × (1 - dropProgress), sepal 남음 | NEW Group 4 |
| **Ovary Swelling (자방 비대)** | petalDrop > 0 | 사이즈 3 → 11 mm 녹색 sphere (sepal 안쪽) | NEW Group 4 |

```ts
// TrussGenerator.createTrussNode
const petalDrop = flower.bloomProgress > 0.7
  ? Math.min(1, (flower.bloomProgress - 0.7) / 0.3)
  : 0;
const ovarySwell = petalDrop * 0.8;
createFlowerNode(name, scene, flower.bloomProgress, petalDrop, ovarySwell);
```

`createFlowerNode` 안 petal:
```ts
petal.position.y = -0.005 * petalDropProgress;        // 처짐
petal.rotation.x = -0.6 * bloomProgress - 0.4 * petalDropProgress;  // reflex + 떨어짐
petal.size *= (1 - petalDropProgress);                // 점점 작아짐
```

자방 (ovary) 은 sepal 안쪽 작은 녹색 sphere:
```ts
const ovarySize = 0.003 + ovarySwellProgress * 0.008;  // 3mm → 11mm
```

---

## 7. 과실 익기 (Fruit Ripening)

`GrowthModel` 에서 `fruitAge` 따라 6 단계 + 색 interpolation:

```ts
ripenProgress = (fruitAge - ripenStartAge) / ripenDuration;
totalStageProgress = ripenProgress * 5;
ripenStage = floor(totalStageProgress);             // 0-5
ripenFraction = totalStageProgress - ripenStage;    // 0-1
color = lerpColor(STAGE_COLORS[ripenStage], STAGE_COLORS[ripenStage+1], ripenFraction);
```

### 6 단계 + 표면 (Group 4 강화)

| Stage | 한국어 | day after fruitSet | RGB | roughness | clearcoat |
|-------|--------|---------------------|-----|-----------|-----------|
| 0 | 녹숙기 | 0–25 | (34,120,30) | 0.40 | — |
| 1 | 변색기 | 25–28 | (140,148,50) | 0.375 | — |
| 2 | 채색기 | 28–32 | (185,110,60) | 0.35 | 0.25 |
| 3 | 도색기 | 32–36 | (210,80,65) | 0.325 | 0.35 |
| 4 | 담적색기 | 36–40 | (215,50,40) | 0.30 | 0.45 |
| 5 | 완숙기 | 40+ | (195,30,22) | 0.275 | 0.55 |

표면이 점진적으로 매트 → 광택 으로 바뀌어 실제 토마토의 waxy bloom 효과.

`FruitGenerator.createFruitNode` 분기:
```ts
const stage = clamp(fruit.ripenStage, 0, 5);
bodyMat.roughness = 0.4 - stage * 0.025;
bodyMat.clearCoat.isEnabled = stage >= 2;
bodyMat.clearCoat.intensity = stage < 2 ? 0 : 0.25 + (stage - 2) * 0.1;
```

크기는 `diameterMm = fruitMaxDiameterMm × sigmoid(fruitAge, fruitSigmoidK, fruitSigmoidMid)` 로 비대.

---

## 8. 환경 변수 + 스트레스

`GrowthEngine.setEnvironment(...)` 가 6 변수 받음:
- `temperatureC` (°C, 권장 20–26)
- `humidity` (0–1, 권장 0.6–0.75)
- `lightHoursPerDay` (시간, 권장 12–16)
- `co2ppm` (ppm, 권장 800)
- `nutrientEC` (dS/m, 권장 2.5–3.5)
- `substrateWater` (0–1, 권장 0.45–0.75)

`environmentStressFactor(env)` 가 6 변수를 band-pass 곱연산으로 0.3–1.25 스트레스 계수 산출. `applyEnvironmentToGenome` 가 5 게놈 파라미터를 스케일:

| 파라미터 | 영향 |
|----------|------|
| `heightSigmoidK` | 생장 속도 |
| `leafSizeMultiplier` | 잎 크기 |
| `leafExpansionRate` | 잎 확장 sigmoid k |
| `fruitMaxDiameterMm` | 과실 크기 |
| `nodeInterval` | 노드 생성 간격 (역수) |

### Stress wiring (Group 4)

`computeState(seed, day, envOverride?, stress?)` 의 stress 인자:
```ts
interface PlantStressInputs {
  waterStress?: number;   // 0-1, 잎 droopExtra +30°
  diseaseLoad?: number;   // 0-1, 잎 점무늬 텍스처 트리거
}
```

자동 유도: `env.substrateWater < 0.45` 이면 `waterStress = (0.45 - substrateWater) / 0.45` 로 계산.

mockScenario 의 `healthLabel` 이 SupportingPlant 에서 매핑:
```ts
'water-stress' → env.substrateWater=0.25, stress.waterStress=0.75
'disease'      → stress.diseaseLoad=0.8
'weak'         → env.lightHoursPerDay=9, temp=17, mild waterStress
```

### 시각적 결과

- **WaterStress** > 0.3 → 잎 droop +30°, 약간 작아짐 (`leafSizeMultiplier` 감소)
- **DiseaseLoad** > 0.3 → `getDiseasedLeafMaterial(scene)` 사용 → 갈색 점무늬 텍스처 (procedural Perlin threshold)

---

## 9. 코드 사용 예

### 9.1 단순 한 식물 day-별 PlantState
```ts
import { GrowthEngine } from '@farmsim/tomato-engine';

const engine = new GrowthEngine();
engine.addPlant({ seed: 42 });
for (let day = 0; day <= 120; day++) {
  const state = engine.computeState(42, day);
  console.log(`Day ${day}: ${state.heightCm.toFixed(1)}cm, ${state.nodeCount} nodes, ${state.totalFruits} fruits`);
}
```

### 9.2 게놈 override + 환경 stress
```ts
const engine = new GrowthEngine();
engine.setEnvironment({ temperatureC: 17, lightHoursPerDay: 9 });  // 추운 흐린 날
engine.addPlant({
  seed: 42,
  genomeOverrides: { heightMaxCm: 250, leafSizeMultiplier: 1.2 },
});
const state = engine.computeState(42, 80, undefined, {
  diseaseLoad: 0.6,  // 추가로 병해
});
// state.diseaseLoad === 0.6, state.nodes[i].droopExtra 증가됨
```

### 9.3 Babylon 식물 메시 한 번 생성
```ts
import { createShowcasePlant } from './twin/ShowcasePlant';
const handle = createShowcasePlant(scene, engine, 42, new Vector3(0, 0.95, 0));
handle.update(80);  // Day 80 시점 메시 빌드
```

### 9.4 단계 직접 조회 (분석/UI 용)
```ts
import { getLeafStage, LeafStage } from '@farmsim/tomato-engine';
const stageInfo = getLeafStage(state.nodes[5], state.day);
if (stageInfo.stage === LeafStage.COMPOUND_MATURE) {
  console.log(`성숙 복엽, ${stageInfo.leafletCount.toFixed(1)} leaflets`);
}
```

---

## 10. Glossary

| 한국어 | 영어 / 코드 | 값 형태 / 위치 |
|--------|-------------|---------------|
| 떡잎 | cotyledon | `PlantState.hasCotyledons`, `cotyledonSize` |
| 본엽 | true leaf | `node.leafletCount`, `getLeafStage(...) === EARLY_TRUE` |
| 복엽 | compound leaf | `getLeafStage(...) === COMPOUND_DEVELOPING / MATURE` |
| 소엽 | leaflet | `leafletCount` (1–9) |
| 잎자루 | petiole | `genome.leafPetioleLength`, `buildLeafChunk` petiole cylinder |
| 잎축 | rachis | `buildLeafChunk` rachis cylinder, 길이 `0.32 × sizeFactor × maturity` |
| 마디 | node | `PlantState.nodes[i]` |
| 절간 | internode | `node.internodeLenCm` |
| 화방 | truss | `node.truss` |
| 꽃 | flower | `node.truss.flowers[i].bloomProgress` |
| 자방 | ovary | NEW Group 4: ovary swelling sphere in flower node |
| 페디셀 | pedicel | TrussGenerator pedicel cylinder per fruit |
| 페던컬 | peduncle | TrussGenerator peduncle cylinder, droop = `computeTrussDroop(...)` |
| 꽃받침 | sepal / calyx | TrussGenerator 5 sepal + FruitGenerator calyx star |
| 처짐 | droop | `node.droopExtra` (0–120°) |
| 노화 / 황화 | yellowing / senescence | `node.yellowing` (0–1, day 60+) |
| 잎 제거 | leaf pruning | greenhouse practice, `node.leafMaturity = 0` below ripe truss |
| 줄기 굵기 | stem radius | `node.stemRadiusMm`, pipe model |
| 줄기 휨 | stem deflection | `node.deflectionRad`, `deflectionAzimuth` |
| 익는 단계 | ripenStage | 0–5, `STAGE_COLORS[i]` |
| 수분 스트레스 | water stress | `node.waterStress` (0–1) |
| 병해 부하 | disease load | `node.diseaseLoad` (0–1) |

---

각 단계는 verify-farmsim.mjs 의 day-별 스크린샷 (Day 5/15/25/50/80/100/120) 으로 시각 확인 가능. `/tmp/farmsim-verify-*.png` 참조.

---

## 11. Wind simulation (Phase B)

장면 전체에 적용되는 단일 바람 모델 — `useTwinStore.windStrength / flutterStrength / windDirection`. 잎 정점 위치에 3-layer sin 의 합을 더해 정적 메시처럼 보이지 않게 한다.

```
windWeight = clamp(pow(uv.y, 1.4) + pow(|uv.x*2-1|, 0.8)*0.35, 0, 1)
largeSway  = sin(t·0.6  + x·0.15 + z·0.10) · 0.08
mediumSway = sin(t·1.4  + x·0.80)         · 0.035
flutter    = sin(t·6.0  + x·3.0  + z·2.0) · 0.012 · flutterStrength
Δposition  = windDir · (large + medium + flutter) · windStrength · windWeight
```

- `windWeight` 가 잎자루(uv.y=0)는 거의 0, 잎끝/가장자리는 1 — 베이스가 흔들리지 않고 끝만 펄럭임
- WebGL2 → `PBRCustomMaterial.Vertex_Before_PositionUpdated` 로 GPU 측 주입, `BabylonEngine` 이 frame 마다 `setFloat('windTime', ...)` 만 push
- WebGPU → PBRCustomMaterial GLSL 컴파일 실패 (Phase S 의 확인된 위험) → CPU sine 으로 plant root TransformNode 의 z/x 축 미세 회전으로 대체

조정: `EnvironmentControls` 슬라이더 (`windStrength: 0–1`).

## 12. Interaction deformation (Phase C)

로봇이 식물에 다가가 잎이 살짝 밀렸다 천천히 복귀. shader 측 uniform array (vec4[8]) — xyz = 푸시 원점, w = 강도. 우리 source: Robot 이 `task === 'capturing'` 일 때 매 frame `addInteraction(...)`. 강도는 시간에 따라 `exp(-age*2)` 로 감쇠, 1.2s 후 사라짐.

```glsl
for (int i = 0; i < 8; i++) {
  if (i >= interactionCount) break;
  vec3 ipos = interactionData[i].xyz;
  float dist = distance(position, ipos);
  if (dist < 0.55) {
    float push = smoothstep(0.55, 0.0, dist) * interactionData[i].w;
    vec3 dir = normalize(position - ipos);
    positionUpdated += dir * push * 0.04 * windWeight;
  }
}
```

- `windWeight` 와 곱해 잎자루는 영향 없음, 잎 끝만 밀림
- WebGL2 only — WebGPU 는 shader injection 불가, fallback 없음 (CPU 단계에서 plant root 만 흔드는 wind 가 어느 정도 시각적 보상)

## 13. LOD 거리 스위칭 (Phase D)

29 supporting plants 가 카메라 거리에 따라:
- < 14 m → 전체 geometry (현재 Light LOD, GrowthEngine-driven)
- > 18 m → leaf-texture billboard plane (Mesh.BILLBOARDMODE_Y)
- 14–18 m 사이는 deadband — 마지막 상태 유지 → pop-flicker 방지

`PlantLODManager` 가 매 100ms 위치 check (30 식물 × 매 frame 은 불필요한 cost). 분석 모드에선 `forceFull()` 로 전체 메시 강제.

**다음 단계 (deferred)**: ThinInstance master mesh 로 29 식물 → 1 draw call, LOD3 zone-cluster billboard. 현재 식물 수 (~30) 에선 draw-call budget 여유가 있어 마이그레이션 비용 대비 이득이 작아 보류. 식물 수가 60+ 로 늘면 필수.

## 14. Smooth leaf color (Phase A.5 + B)

매 leaf rebuild 시 `getLeafBlendedColor(ageFrac, waterStress, yellowing)` 로 RGB 계산 → mesh vertex colors (RGBA, A=1) baking. PBRMaterial 의 자동 vertex-color multiply 로 albedo texture 위에 곱해진다.

- 4-색 팔레트: young `#5fa830` → mature `#3a7a30` → stress `#7a8635` → senescence `#a89030`
- 모두 mature 대비로 정규화돼 unstressed/young 잎은 텍스처 색 그대로 (tint=1)
- 노화/스트레스가 진행하면 부드럽게 색이 빠짐 — discrete material swap 보다 시각적으로 자연스러움
- shader 호환성 의존 X — WebGPU/WebGL2 모두 동일 경로
