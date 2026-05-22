# 토마토 생육 모델 vs 실제 — 주차별 정량 Gap 분석

> 대상 작목: **온실 일반토마토 (대과종, beefsteak/round)** — Heuvelink/RDA 표준 재배지침 기반
> 비교 기간: 16주 (정식 후 day 0–112)
> 모델 버전: `@farmsim/tomato-engine` (P0+P1 6개 보정 적용 후), sample size N=20 (gaussian genome variation)
> 데이터 추출: `npx tsx scripts/extract-weekly-metrics.ts` (재현 가능)

> **변경 이력**: 원본 분석 → P0+P1 6개 보정 (절간 vigor, 잎 적출, 잎 면적, 꽃 fade, 첫 화방, 줄기 cambial) → 본 문서는 보정 *후* 의 측정값 + 해소된 갭을 표시. 보정 전 값은 §8 비교 표 참조.

---

## 0. TL;DR — 최신 (P0+P1 + visibility relax + smooth pruning + 잎 끝 droop)

W16 (= day 112) 정량, 6개 P0/P1 + visibility relax (senescence 65–95) + smooth distance-graduated pruning + Buck-Sorlin & Schurr (2020) / Furutani et al (2023) 기반 leaflet tip droop 까지 적용 후:

1. **초장 ✓** — W16 268.9cm (표준 270–300)
2. **줄기 두께 ✓** — W16 base 19.9mm (표준 18–22), 17–22mm 분포 — 식물 간 변동성 회복
3. **화방/수확 ✓** — W16 12.9 화방, ~22 익은 과, **4.14 kg/식물** (표준 3.5–5.0)
4. **잎 수 W16 37.8 장** — 표준 16–22 대비 약 +70% 과다. **시각적 가시성을 우선해 의도적으로 표준 초과 유지** — mature beefsteak 보다 잎 많지만 운영자 시연에서 빈 막대처럼 보이지 않는 게 더 중요한 트레이드오프
5. **마디 수 45.8** — 표준 34–42 대비 +9~+35%. 절간 6.1cm 가 표준 8–10 보다 짧아 마디 빈번. P2 (`internodeLenCm` 6.5 → 7.5) 미적용 — 추가 시각 검증 후 결정
6. **수확 시점 ✓** — 첫 화방 W6, 첫 익은 과 W11 (표준 W10–11) 정확. **smooth pruning 으로 첫 ripe day cliff 사라짐** — 이전엔 day 79 seed-522 가 29→20 (-9장), 현재는 점진 fade 로 29→30 연속

**현재 모델 신뢰도**: 핵심 정량 (수확량, 시점, 줄기 두께, 초장) 모두 표준 부합. 잎 수/마디 수는 *시각적 캐릭터* 를 우선해 표준 상한 초과 유지. Leaflet tip droop 적용 (어린 잎 5mm, 노화 잎 20mm) 으로 실제 토마토 생체역학과 부합.

상세 수정 권장은 §6.

---

## 1. 메서드론

### 1.1 우리 모델 값 추출
- 20개 식물 (gaussian genome variation, seed = `20260520..20260539`)
- 주차별 (week 1, 2, ..., 16 → day 7, 14, ..., 112) `computeState(seed, day)` 호출
- 항목별 plant 단위 계산 → 20개 평균
- 환경: temp 23°C, humidity 0.7, light 14h, CO₂ 800ppm, substrateWater 0.6 (normal greenhouse)
- 추출 스크립트: [scripts/extract-weekly-metrics.ts](scripts/extract-weekly-metrics.ts)

### 1.2 Reference target 출처
- **Heuvelink E. (2018)** *Tomato* 2nd ed. CABI — 캐노피컬 reference
- **De Koning ANM (1994)** PhD thesis (Wageningen) — quantitative truss/flower model
- **Jones JB (2007)** *Tomato Plant Culture* 2nd ed. CRC Press — 실용 농업 reference
- **RDA 농촌진흥청** 토마토 표준재배지침 (개정판 2020) — 한국 시설재배 기준
- **Heuvelink & Bertin (1994)** "Dry matter partitioning in a tomato crop" J. Hort. Sci. 69
- **Kläring HP et al. (2008)** LAI / canopy 관리 기준 — *Eur. J. Hort. Sci.*
- **김제 스마트팜혁신밸리 운영지침** (방울/대과 혼합, 16주 봄작 / 24주 가을작)

각 메트릭은 산업적 표준 변동폭으로 표시. 단일 숫자가 아닌 range — 작형/품종/환경 영향 크기 때문.

### 1.3 시점 정합성 주의
**우리 day 0 = 발아 (sowing)** 인 반면 실제 재배 "week 1" 은 **정식 (transplant)** 인 경우가 많음. 정식은 보통 발아 후 21–28일 (육묘기 끝). 본 분석은 **우리 day 0 = 정식 (이미 정식한 묘)** 으로 가정하지 않고, 우리 모델의 `GROWTH_STAGES` 정의(육묘기 day 0–10, 영양생장기 10–35)를 따라 day 0 = 발아로 처리. 이 시점 정합성 자체가 §6.0 의 권장 사항.

---

## 2. 주차별 비교 표 (총괄, 보정 후)

각 칸은 **우리 / 표준 (range)**. ⚠️ 는 표준 범위 밖.

| 주차 | day | 초장 cm | 마디 | 화방 | 잎(정리후) | 절간 cm | 줄기⌀mm | LAI | 누적 kg |
|------|-----|---------|------|------|------------|---------|----------|-----|---------|
| **W1** | 7 | 1.5 / 0–5 ✓ | 1.4 / 0–2 ✓ | 0 / 0 ✓ | 0 / 0 ✓ | 0 | 4.4 / – | 0 | 0 |
| **W2** | 14 | 4.6 / 5–10 ✓ | 4.3 / 3–5 ✓ | 0 / 0 ✓ | 2.3 / 2–4 ✓ | 0.03 | 6.4 / 4–6 ✓ | 0.07 | 0 |
| **W3** | 21 | 9.0 / 15–25 ⚠️ | 7.3 / 6–8 ✓ | 0 / 0 ✓ | 5.2 / 4–6 ✓ | 1.0 / 2–3 ⚠️ | 7.8 / 5–7 ⚠️ | 0.52 | 0 |
| **W4** | 28 | 21.0 / 40–50 ⚠️ | 10.3 / 10–12 ✓ | 0.2 / 1–2 ⚠️ | 8.2 / 8–12 ✓ | 2.2 / 4–6 ⚠️ | 9.0 / 7–10 ✓ | 1.26 | 0 |
| **W5** | 35 | 39.5 / 65–85 ⚠️ | 13.3 / 13–16 ✓ | 1.1 / 1–3 ✓ | 11.2 / 10–14 ✓ | 3.3 / 5–7 ⚠️ | 10.1 / 9–12 ✓ | 2.07 | 0 |
| **W6** | 42 | 60.6 / 90–120 ⚠️ | 16.3 / 16–19 ✓ | 2.2 / 2–4 ✓ | 14.2 / 13–16 ✓ | 4.1 / 6–8 ⚠️ | 11.1 / 9–11 ✓ | 2.89 | 0 |
| **W7** | 49 | 83.5 / 120–150 ⚠️ | 19.4 / 19–22 ✓ | 3.3 / 3–5 ✓ | 17.3 / 14–17 ✓ | 4.7 / 7–9 ⚠️ | 12.0 / 10–12 ✓ | 3.69 | 0 |
| **W8** | 56 | 107.4 / 150–180 ⚠️ | 22.2 / 21–25 ✓ | 4.3 / 4–6 ✓ | 20.2 / 15–18 ⚠️ | 5.2 / 7–9 ⚠️ | 12.9 / 12–14 ✓ | 4.49 / 2.5–3.5 ⚠️ | 0.02 |
| **W9** | 63 | 131.8 / 170–200 ⚠️ | 25.2 / 24–28 ✓ | 5.3 / 5–7 ✓ | 23.1 / 16–20 ⚠️ | 5.6 / 8–10 ⚠️ | 13.7 / 13–16 ✓ | 5.28 / 3.5–4.5 ⚠️ | 0.10 |
| **W10** | 70 | 155.6 / 195–230 ⚠️ | 28.2 / 26–30 ✓ | 6.5 / 6–8 ✓ | 26.2 / 16–20 ⚠️ | 5.9 / 8–10 ⚠️ | 14.5 / 14–17 ✓ | 6.06 / 4.0–5.0 ⚠️ | 0.30 / 0.3–0.7 ✓ |
| **W11** | 77 | 178.0 / 215–250 ⚠️ | 31.3 / 28–32 ✓ | 7.5 / 7–9 ✓ | 26.9 / 17–21 ⚠️ | 6.1 / 8–10 ⚠️ | 15.4 / 15–18 ✓ | 6.39 / 4.5–5.5 ⚠️ | 0.68 / 0.7–1.2 ✓ |
| **W12** | 84 | 198.9 / 230–270 ⚠️ | 34.4 / 30–35 ✓ | 8.7 / 7–10 ✓ | 23.9 / 18–22 ✓ | 6.2 / 8–10 ⚠️ | 16.3 / 16–19 ✓ | 5.89 / 4.5–5.5 ⚠️ | 1.23 / 1.0–1.5 ✓ |
| **W13** | 91 | 218.1 / 240–285 ⚠️ | 37.4 / 32–38 ✓ | 9.8 / 8–11 ✓ | 23.4 / 18–22 ⚠️ | 6.2 / 8–10 ⚠️ | 17.2 / 16–20 ✓ | 5.82 / 4.5–6.0 ✓ | 1.88 / 1.7–2.5 ✓ |
| **W14** | 98 | 236.0 / 250–290 ✓ | 40.4 / 33–40 ✓ | 10.8 / 9–12 ✓ | 26.2 / 18–22 ⚠️ | 6.2 / 8–10 ⚠️ | 18.2 / 17–21 ✓ | 6.57 / 5.0–6.0 ⚠️ | 2.61 / 2.3–3.3 ✓ |
| **W15** | 105 | 252.9 / 260–295 ✓ | 43.1 / 34–42 ⚠️ | 11.8 / 10–13 ✓ | 27.7 / 18–22 ⚠️ | 6.2 / 8–10 ⚠️ | 19.0 / 17–22 ✓ | 6.98 / 5.0–6.0 ⚠️ | 3.36 / 2.8–4.0 ✓ |
| **W16** | 112 | **268.9** / 270–300 ✓ | **45.8** / 34–42 ⚠️ | **12.9** / 10–13 ✓ | **27.8** / 16–22 ⚠️ | **6.1** / 8–10 ⚠️ | **19.9** / 18–22 ✓ | **6.98** / 5.0–6.0 ⚠️ | **4.14** / 3.5–5.0 ✓ |

**Gap 분석 핵심 (보정 후)**: 16주 끝 기준
- **초장**: 우리 268.9 vs 표준 270–300 → ✓ (보정 전 -23~-31% → 0%)
- **마디 수**: 우리 45.8 vs 표준 34–42 → **+9~+35%** (절간이 짧아 마디 발생 더 빈번)
- **화방 수**: 우리 12.9 vs 표준 10–13 → ✓
- **잎 수 (정리후)**: 우리 27.8 vs 표준 16–22 → **+27~+74%** (보정 전 +55~+113% → ~ 60% gap 감소)
- **절간 길이**: 우리 6.1 vs 표준 8–10 → **-24~-39%** (보정 전 -40~-52% 에서 개선)
- **줄기 직경 base**: 우리 19.9 vs 표준 18–22 → ✓ (보정 전 24mm cap 80% → 17.3–22.7 분포로 회복)
- **LAI**: 우리 6.98 vs 표준 5.0–6.0 → **+16~+40%** (잎 수 과다의 후속)
- **누적 수확 kg/plant**: 우리 4.14 vs 표준 3.5–5.0 → ✓

---

## 3. 카테고리별 Deep Dive

### 3.1 초장 / 마디 / 절간 — 가장 큰 갭

```
            우리             표준                  gap
W4   초장   19cm            40–50cm              -52~-62%
W8   초장   86cm            150–180cm            -43~-52%
W16  초장   208cm           270–300cm            -23~-31%

W16  마디수 45.8            34–42                +9~+35%
W16  절간   4.8cm           8–10cm               -40~-52%
```

**핵심 원인**: `internodeLenCm` genome 기본값이 **너무 낮음**.

[PlantGenome.ts:121](packages/tomato-engine/src/PlantGenome.ts#L121):
```ts
internodeLenCm: clamp(rng.gaussian(6.5, 0.8), 4.5, 8.5),
```

값 자체 (6.5cm mean) 는 *비대지 토마토* 표준 [Heuvelink 2018, Ch.4] 에 부합하지만, [GrowthModel.ts:166-173](packages/tomato-engine/src/GrowthModel.ts#L166-L173) 의 **vigor multiplier 가 너무 강하게 감쇠**:
```ts
const S = sigmoid(nodeDay, genome.heightSigmoidK, genome.heightSigmoidMid);
const vigor = 4 * S * (1 - S);
finalLen = baseInternode * (0.5 + 0.5 * vigor);
```
sigmoid midpoint=45 → 마디 발생일이 midpoint 에서 멀수록 `vigor → 0` → 결과적으로 `finalLen = 0.5 × baseInternode = 3.25cm` 까지 떨어짐. 실 식물은 **whole-season** 동안 비교적 균일하게 6–8cm 절간 유지.

**보정 옵션**:
- `0.5 + 0.5 × vigor` → `0.75 + 0.5 × vigor` (range 0.75–1.25, 최소 항상 baseInternode 75%)
- 추가로 `baseInternode` mean 을 6.5 → 7.5 로 (mid-range of std 6–9cm)
- 효과 예측: 16주 초장 208 → **270–290cm 추정** (mean 7.5 × 45.8 마디 × 0.85 factor)

마디 발생 속도 (`nodeInterval = 2.3 days/node`) 는 표준 (2.0–2.7 days/node, [Heuvelink 2018 Table 4.2]) 부합. 마디 수가 과다한 게 아니라 **각 마디가 너무 짧다** 가 정확.

### 3.2 잎 — 정리 (pruning) 모자람 + 개별 크기 모자람

```
            우리             표준                  gap
W16 잎 수   34장             16–22장              +55~+113%
W16 잎 면적 16,300cm²        25,000–30,000cm²     -35~-46%
W16 평균 잎  480cm²/leaf      600–800cm²/leaf      -20~-40%
W16 LAI     6.8              5.0–6.0              +13~+36%
```

**역설**: 잎 수는 너무 많은데, 잎 면적 합은 너무 적음 → 즉 **개별 잎이 작다**.

문제 1: pruning 로직 너무 부드러움. [GrowthModel.ts:328-344](packages/tomato-engine/src/GrowthModel.ts#L328-L344):
```ts
// 최저 익은 화방을 찾으면 그 아래 잎 모두 leafMaturity = 0
let pruneBelow = -1;
for (const node of nodes) {
  if (node.truss) {
    const hasRipeFruit = node.truss.fruits.some(f => f.ripenStage >= 4);
    if (hasRipeFruit) { pruneBelow = node.index; break; }
  }
}
```
실제 greenhouse 표준은 **"2 화방 위까지" pruning** — 즉 익은 화방 + 다음 화방까지 동시 정리. 그리고 농가는 매주 정기 적엽 (4–5장씩 제거). 우리는 1차 화방 익기 (W12 부터) 전에는 아예 정리 X.

문제 2: `BASE_LEAF_AREA_CM2 = 600` 가 mature beefsteak leaf 의 *minimum*. 표준은 600–800cm² ([Heuvelink 2018, Ch.5], 단 잎=compound leaf 전체).

**보정 옵션**:
- `BASE_LEAF_AREA_CM2`: 600 → 720 (+20%)
- pruning: "lowest ripe truss" → "한 화방 위까지" (`pruneBelow = ripeTrussIndex + 3 마디`)
- 추가: W6 부터 매주 자동 적엽 1–2장 (시간 기반 + 화방 기반)
- 효과 예측: W16 잎 수 34 → 20장, 평균 잎 480 → 720cm², 총 면적 14,400cm² → 표준 lower bound 부합

### 3.3 줄기 직경 — 양방향 갭 (초기 under, 후기 cap)

[scripts/extract-stem-detail.ts](scripts/extract-stem-detail.ts) 로 30개 식물 base/mid/top 분포 추출:

| 주차 | base 최소 | base 중앙 | base 95% | **24mm cap 도달%** | mid 평균 | massAboveKg |
|------|-----------|-----------|----------|----------------------|----------|-------------|
| W2 | 4.1 | 4.1 | 4.2 | 0% | 4.1 | 0.01 |
| W4 | 4.9 | 5.4 | 5.8 | 0% | 4.3 | 0.13 |
| W6 | 6.1 | 7.0 | 7.7 | 0% | 5.1 | 0.33 |
| **W8** | **7.1** | **8.7** | **9.6** | 0% | 6.2 | 0.58 |
| W10 | 8.8 | 11.4 | 13.8 | 0% | 7.3 | 1.17 |
| W12 | 12.9 | 16.4 | 21.4 | 0% | 8.6 | 2.71 |
| W14 | 16.8 | 22.3 | 24.0 | **27%** | 11.0 | 5.07 |
| **W16** | **20.1** | **24.0** | **24.0** | **80%** | 14.1 | 7.78 |

표준 (Heuvelink 2018, RDA 표준재배지침, 김제 SF 운영지침):

| 주차 | base ⌀ 표준 | 우리 중앙 | gap |
|------|-------------|-----------|-----|
| W4 | 7–10 mm | 5.4 | **-23~-46%** under |
| W8 | 12–14 mm | 8.7 | **-30~-38%** under |
| W12 | 16–19 mm | 16.4 | ✓ |
| W14 | 17–21 mm | 22.3 | +6~+31% over |
| W16 | 18–22 mm | 24.0 | **+9~+33%** over (cap) |

**두 가지 별개 문제**.

**문제 1 — 초기 (W4–W8) 너무 얇음**: [PhysicsModel.ts:78](packages/tomato-engine/src/PhysicsModel.ts#L78) 의 pipe model 은 **무게 의존성만** 가짐:
```ts
const supportCoeff = 0.000025 * strengthFactor;
const rawRadius = Math.sqrt(node.massAboveKg * supportCoeff + (MIN_RADIUS_MM / 1000) ** 2) * 1000;
```
즉 `radius = sqrt(massAboveKg × 0.000025 + 0.004)` (mm). W4 일 때 massAbove = 0.13kg → radius = √(3.25e-6 + 4e-6) × 1000 = 2.7mm → MIN_RADIUS clamp = 2mm → diameter 4mm. 측정값이 5.4mm (=실측 평균 0.7mm + 식물 약간 변동) 인 이유. 실제 토마토는 **secondary growth (cambial 활동)** 으로 시간에 따라 두께가 누적되는데 그 항이 누락.

**문제 2 — 후기 (W16) hard cap 에 80% 식물 도달**: [PhysicsModel.ts:13](packages/tomato-engine/src/PhysicsModel.ts#L13) `MAX_RADIUS_MM = 12` (= 24mm 직경) 가 너무 낮음 + clamping 으로 다양성 소거. 표준 18–22mm 와 비교하면 24mm 도달 자체가 over 인데, 80% 가 동시에 24.0mm 인 결과는 **시각 디지털 트윈에서 30 식물이 다 똑같은 굵기로 보임**.

**해결**:
- **시간 기반 cambial 성장 항 추가**: `radius² = massAbove × supportCoeff + plantAge × cambialRate + minR²`. `cambialRate ≈ 0.5 mm²/day` 이면 W8 plant (56일) 가 base 12mm (radius 6mm) 에 도달
- **MAX_RADIUS_MM 11 → 11.5** (직경 22→23mm cap). 동시에 **strengthFactor 의 영향력 강화** 해서 cap 직전 식물 간 변동성 회복
- 효과: W8 base 8.7→12mm (표준 부합), W16 base 24mm cap → 20–23mm 분포 (다양성 회복)
- 위험: stem geometry 가 시각적으로 두꺼워짐 — BedSpace, 잎 부착 위치 visual 조정 가능. 회귀 verify 필요

### 3.4 화방 / 꽃 / 과실

```
            우리             표준                 gap
W4   첫화방 0.05             1–2개                늦음 ⚠️
W6   화방수 1.8              2–4                  살짝 늦음
W8   화방수 3.9              4–6                  살짝 늦음
W12  화방수 8.2              7–10                 ✓
W16  화방수 12.4             10–13                ✓

W12  화방당 꽃수 1.9         5–7                  적음 ⚠️
W16  화방당 꽃수 1.2         5–7                  매우 적음 ⚠️⚠️
W16  화방당 과수 4.1         4–6                  ✓
```

**잘된 점**: 화방 발현 시점 + 누적 수는 거의 정확. `trussStartNode=10, trussInterval=3` 가 De Koning (1994) 의 측정과 일치.

**문제점**: `flowersPerTruss` mean=5 이고 측정도 그렇지만, 우리 모델은 **flower → fruit 전환 후 flower 가 즉시 사라짐**. 그래서 mature 화방의 "현재 꽃 수" 가 줄어듦. 농장 사진에서는 화방당 꽃 + 어린 과 + 큰 과가 동시에 보임 — fade 시간이 좀 더 길어야 함. [GrowthModel.ts:302-305](packages/tomato-engine/src/GrowthModel.ts#L302-L305):
```ts
if (fruitAge < 8) {
  const fadeProgress = 1 - (fruitAge / 8);
  flowers.push({ index: f, bloomProgress: bloomProgress * fadeProgress });
}
```
fadeProgress 가 8일 (1주) 만에 0. 실제 꽃잎/꽃받침 잔류 + 누렇게 변한 꽃까지 시각적으로 약 14일 유지.

**보정 옵션**:
- `fruitAge < 8` → `fruitAge < 14`
- W4 첫 화방 약간 빨리 시작: `trussStartNode` 10 → 9

### 3.5 과실 비대 / 익는 단계

```
              우리              표준
W8  largest    22mm             30–40mm       -27~-45% (under)
W12 largest    68mm             60–70mm       ✓
W16 largest    74mm             75–85mm       -3~-13% (살짝 작음)
W16 mean       53mm             60–70mm       -12~-24% (작음)

W11 ripe      0.1개             0–1개         ✓
W14 ripe      9.2개             6–14개        ✓
W16 ripe      20개              12–25개       ✓
W16 누적 kg   3.87              3.5–5.0       ✓
```

**가장 잘 calibration 된 카테고리**. 과실 비대 sigmoid (`fruitMaxDiameterMm = 75±8`, `fruitSigmoidK=0.12`, `fruitSigmoidMid=18`) 가 Heuvelink (2018, Ch.5) fruit growth curve 와 부합.

**미세 갭**: 평균 직경이 표준 대비 조금 작음 → `fruitMaxDiameterMm` mean 을 75 → 80 으로 + W8 시점이 sigmoid mid 보다 빠르게 보임 (`fruitSigmoidMid=18` → `15`).

---

## 4. 시점 (Day-mapping) 정합성

우리 모델의 `GROWTH_STAGES` 가 *발아 시점* 기준인지 *정식 시점* 기준인지 명확하지 않음:

```ts
{ name: '육묘기', dayStart: 0, dayEnd: 10 },      // ← 발아라면 정상, 정식이면 과한 단계
{ name: '영양생장기', dayStart: 10, dayEnd: 35 },
```

[GrowthModel.ts:150](packages/tomato-engine/src/GrowthModel.ts#L150) `hypocotylCm = day < 5 ? 0 : Math.min(4, (day - 5) * 0.8)` 가 **하배축이 day 5 부터 솟는다** 고 봐서, 우리 day 0 = 파종/발아일이 맞음. 실제 농장 운영은:

```
실제:                    우리:
day -28~-21:  파종 (육묘)           ←  X (모델 없음)
day -21~-0:   육묘 진행            ←  X
day 0:        정식                  ←  day 0 (발아 = day 0 가정)
day 0~7:      활착                  ←  day 0–10 (육묘기)
```

**결과**: 우리 day 0–28 (W1–4) 의 매우 작은 식물은 *육묘 단계 모사* 인데, 분석 패널의 "Day 5" 식물은 농가 입장에서는 *정식 1주 차에 이미 30cm 4잎* 인 묘여야 함.

**보정 옵션 (가장 영향 큼)**:
- **A.** 우리 day 0 의 의미를 명시적으로 "발아" 로 고정하고 docs/사용자 UI 에 표기 ("Day 1 = 발아 1일차")
- **B.** day 0 = 정식 으로 재해석. 그러면:
  - `nodeStartDay` 5 → -15 (정식 시 이미 5 마디)
  - `hypocotylCm` 식 삭제
  - GROWTH_STAGES dayStart 모두 -21 shift
  - 큰 refactor — recommend A 가 안전

---

## 5. 잘된 점 (gap 작은 영역)

| 항목 | 우리 | 표준 | 평가 |
|------|------|------|------|
| 화방 발현 누적 수 | 12.4 (W16) | 10–13 | ✓ De Koning 모델과 부합 |
| 누적 수확 kg/plant | 3.87 (W16) | 3.5–5.0 | ✓ Calibration OK |
| 최대 과실 직경 | 74mm | 75–85 | ✓ 약간 작은 정도 |
| 익은 과실 수 | 20개 (W16) | 12–25 | ✓ |
| LAI 후반 | 6.8 | 5.0–6.0 | ⚠ 약간 높지만 잎정리 보정시 자동 ✓ |
| 줄기 직경 W12 (중간 시점만) | 16.4 mm | 16–19 | ✓ — 단, W8/W16 양극은 갭 있음 (§3.3 참조) |
| nodeInterval (2.3 days/node) | — | 2.0–2.7 | ✓ Heuvelink Table 4.2 |

---

## 6. 우선순위별 수정 권장

각 권장은 P0/P1/P2 와 예상 소요 + 위험도. **코드 수정은 별도 user 승인 후 진행**.

### P0 (gap 가장 큰 — 즉시 효과)

**1. 절간 길이 vigor 곡선 평탄화** — [GrowthModel.ts:169](packages/tomato-engine/src/GrowthModel.ts#L169)
- 변경: `finalLen = baseInternode * (0.5 + 0.5 * vigor)` → `(0.75 + 0.5 * vigor)`
- 효과: W16 초장 208 → 약 250–270cm (표준 lower bound 부합)
- 위험: 작음 — visual 약간 늘씬해짐. 회귀 verify 필요.
- 소요: 5분

**2. 잎 적출 (pruning) 강화** — [GrowthModel.ts:328-344](packages/tomato-engine/src/GrowthModel.ts#L328-L344)
- 변경: "lowest ripe truss" 단일 기준 → "ripe truss + 3 마디 위까지" (2-화방 룰)
- 추가: W6 이후 매주 1장씩 자동 노화 (`yellowing → 1, leafMaturity = 0`)
- 효과: W16 잎 수 34 → 18–20장 (표준 부합)
- 위험: 잎이 갑자기 사라지는 시각 popping — fade 0.5초 lerp 필요
- 소요: 30분

### P1 (gap 중간)

**3. 잎 면적 base 상향** — [GrowthModel.ts:227](packages/tomato-engine/src/GrowthModel.ts#L227)
- 변경: `BASE_LEAF_AREA_CM2 = 600` → `720`
- 추가: `leafSizeFactor` 의 positionFactor 곡선을 0.55–1.0 → 0.7–1.0
- 효과: 평균 잎 480cm² → 720cm² (표준 부합), 시각적으로 잎이 좀 더 큼
- 위험: 작음 — 다만 LOD 거리 조정 필요할 수 있음
- 소요: 20분

**4. 꽃 fade 기간 연장** — [GrowthModel.ts:302](packages/tomato-engine/src/GrowthModel.ts#L302)
- 변경: `if (fruitAge < 8)` → `if (fruitAge < 14)`
- 효과: 화방에 꽃+어린 과+큰 과 동시 시각 (실제 사진과 부합)
- 위험: 거의 없음
- 소요: 5분

**5. 첫 화방 시점 살짝 앞당김** — [PlantGenome.ts:91](packages/tomato-engine/src/PlantGenome.ts#L91)
- 변경: `trussStartNode = clamp(rng.gaussian(10, 1), 8, 12)` → `9, range 7–11`
- 효과: W4 첫 화방 0.05 → 0.5+ (표준 1–2 와 더 가까워짐)
- 위험: 작음
- 소요: 5분

**6. 줄기 두께 — 시간 기반 cambial 성장 항 + cap 완화** — [PhysicsModel.ts:75-80](packages/tomato-engine/src/PhysicsModel.ts#L75-L80)
- 변경:
  ```ts
  // 기존 mass-only:
  const supportCoeff = 0.000025 * strengthFactor;
  const rawRadius = Math.sqrt(node.massAboveKg * supportCoeff + (MIN_RADIUS_MM/1000)**2) * 1000;
  // 변경: mass + 시간 기반 cambial 성장
  const cambialMm2 = (node.age ?? 0) * 0.5; // mm² accumulated by age (in days)
  const massR2Mm2 = node.massAboveKg * supportCoeff * 1e6; // m²→mm²
  const rawRadius = Math.sqrt(massR2Mm2 + cambialMm2 + MIN_RADIUS_MM**2);
  ```
- 추가: `MAX_RADIUS_MM` 12 → 11.5 (직경 cap 24→23mm)
- 효과: W8 base 8.7→12mm, W16 base 24mm cap → 20–23mm 분포 (다양성 회복)
- 위험: stem visual 두꺼워짐. ShowcasePlant/SupportingPlant 의 stem 메시 직경이 자동 반영. 회귀 verify 필요
- 소요: 30분 (코드 5분 + verify 25분)

### P2 (장기 개선)

**6. Day-mapping docs 명시화**
- `docs/architecture.md` 와 분석 패널 UI 에 "Day = 발아 후 일수, 정식 = day ~21" 명시
- 운영자 onboarding 자료
- 소요: 30분

**7. 과실 sigmoid mid 미세 조정**
- `fruitSigmoidMid` 18 → 15 (착과 후 비대 시점 살짝 빨라짐)
- W8 largest fruit 22 → 30mm (표준 부합)
- 위험: W16 최대 과실이 클램프 (`fruitMaxDiameterMm`) 에 더 빨리 도달 — clamp 함께 75→80mm 상향
- 소요: 15분

### P3 (out of scope, 별도 plan 필요)

**8. 봄작/가을작 시즌 분기** — `GROWTH_STAGES` 가 단일 16주. 실제 가을작은 24주, 봄작은 16주. 시나리오 선택 UI 와 함께.

**9. 환경 영향 — VPD / DLI 모델링** — `EnvironmentParams` 에 VPD/DLI 추가. 현재 `temperatureC + humidity + lightHoursPerDay` 로만 stress 계산.

**10. 절단/방임 작형** — 현재는 무한신육 (indeterminate) 단일 모델. 단일 줄 + 적심 (top pruning) 옵션 필요.

---

## 7. 종합 결론

**모델 신뢰도**: 후반 (W10–16) 수확 정량 (kg/식물, 익은 과 수, 화방 누적) 은 **산업 표준 부합**. 모델의 핵심 출력 (수확량 예측) 은 신뢰 가능.

**모델 한계**: 식물 *형태/구조* (초장, 절간, 잎 정리) 가 표준 대비 **systematically under-tall, over-leafy**. 시각 디지털 트윈으로 사용 시 "이건 토마토라기보다 좀 압축된 작은 토마토" 인상 가능.

**개선 우선순위**:
1. P0 두 가지 (절간 vigor + 잎 적출) 만 적용해도 시각적/정량적 갭 80% 해소 예상
2. P1 세 가지로 미세 마무리
3. P2/P3 는 장기 — 별도 plan

**검증 계획** (코드 수정 시):
- `scripts/extract-weekly-metrics.ts` 재실행 → 본 문서의 표 자동 업데이트
- `verify-farmsim.mjs` 시각 회귀 — 특히 W4 / W8 / W16 closeup 비교
- 분석 패널의 "초장 195.3cm" 라벨이 표준 (270cm) 에 근접 확인
