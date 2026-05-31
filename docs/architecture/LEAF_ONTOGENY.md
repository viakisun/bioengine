# 잎 Ontogeny Engine — 6 단계 botanical model (Iter 36 v5)

> 사용자 제공 botanical reference 직접 인용 (UC Davis PLB Lab + NC State + Virginia Tech).
> "토마토 잎이 줄기에서 분화되는 과정을 이해하면 mesh가 자연스럽게 emerge."

본 문서는 토마토 잎의 ontogeny (development) 6단계와 FarmSim 코드 매핑입니다.

---

## 6 단계 (사용자 botanical model)

### 1. Primordium — 줄기 옆 작은 돌기

처음에는 줄기의 생장점 가까이에서 작은 잎 원기가 생깁니다. 겉으로 보면 줄기 옆에
**아주 작은 초록 돌기**, 또는 **가느다란 순**처럼 보일 수 있습니다.

```
줄기  │\
     │ \  ← 아주 작은 잎자루 + 접힌 어린 잎
     │
```

### 2. Petiole + Rachis 확립

옆으로 나온 잎자루가 길어집니다. 그리고 그 잎자루의 연장선처럼 **중앙축 (rachis)**이
생깁니다.

```
어린 복엽

줄기 │
     │\
     │ \____  ← 잎자루
     │      |
     │      |  ← 잎의 중앙축, 엽축
     │     / \
     │    작은 소엽들
```

### 3. Leaflet 분화

끝에는 비교적 큰 **끝소엽** + 중앙축 양쪽에 **주요 소엽** 부착. 흔히 한 잎에 5~9
소엽 (cherry/early ~7 / standard ~9 / beefsteak ~11).

```
          끝소엽
            ▲
        \   |   /
         \  |  /
소엽  ----  |  ---- 소엽
           |
        잎자루
```

### 4. Leaflet 확장 + 톱니

각 소엽이 커지면서 가장자리가 매끈한 타원형이 아니라, **톱니 모양**, **깊게 패인
갈래**, **작은 보조 소엽**을 만듭니다.

### 5. Mature 복엽

성숙한 토마토 잎. 작은 가지처럼 보이지만 식물학적으로는 **줄기에서 나온 한 장의 잎**.

★ 핵심 botanical fact: **잎자루와 줄기가 만나는 그 지점에만 곁눈/곁순**.
소엽 부착자리에는 곁눈이 없음 → 소엽은 _가지가 아닌 잎의 일부_.

### 6. Senescence + 곁순 분화

노화 시작 (잎 yellowing + curl) + 잎겨드랑이에서 **곁순 (axillary bud)** 활성화.
곁순이 자라면 가지/새 줄기/꽃송이/열매.

---

## 코드 매핑

| 단계 | 코드 트리거 | 위치 |
|---|---|---|
| 1. Primordium | `LeafStage.PRIMORDIUM`, `currentArea ≈ 0` | `packages/tomato-engine/src/LeafStage.ts` |
| 2. Petiole/Rachis | `EARLY_TRUE` + `leafLengthSigmoid < 0.3` | `LeafGrowthModel.ts` |
| 3. Leaflet 분화 | `leafletCount` 증가 (3→7→9→11) | `LeafGrowthModel.leafletCountFromMaturity` |
| 4. Confluence + 톱니 | `linearAreaScale 0.6-0.9` + `morphology.serrationDepth` | `LeafGrowthModel.computeLeafGeometryProjection` |
| 5. Mature | `currentArea ≈ targetArea`, `expansion = 1.0` | `LeafGrowthModel.computeLeafExpansion` |
| 6. Senescence + Bud | `senescence.colorDullness` + `BudState.growing` | `LeafGrowthModel.computeSenescence` + `SideShootModel` |

---

## 핵심 산식

### 잎 age (ageTT)

잎 emergence부터 누적 thermal time. `LeafGrowthModel.ts:ageTT`.

### Expansion sigmoid

`computeLeafExpansionProgress` — leaf area의 0→1 sigmoid 진행.

```text
expansion(t) = 1 / (1 + exp(-k × (t - t_mid)))
  k = 6 / leafExpansionDurationTT  (Marcelis 1996 ~400 GDD)
  t_mid = leafExpansionDurationTT × 0.5
```

### Length maturity sigmoid (botanical fact: length는 area보다 먼저 완성)

`leafLengthSigmoid` — leaf length가 area보다 _먼저_ 완성.

```text
lengthMaturity(t) = 1 / (1 + exp(-k × (t - t_mid)))
  k = 6 / leafLengthExpansionDurationTT  (typical = areaDuration × 0.5)
```

### Apical youth factor

★ **Iter 36 v5 Phase A 정정** — 단계 1-2 (apex) young leaf gate.

```text
apicalYouthFactor(t) = clamp(t / YOUNG_LEAF_FULL_LENGTH_TT, 0.05, 1.0)

v1 (구버전): YOUNG_LEAF_FULL_LENGTH_TT = 80 TT (~6 day)
  → apex leaf가 6일 만에 full scale (단계 1→5 jump, 너무 빠름)

v5 (현재): YOUNG_LEAF_FULL_LENGTH_TT = 250 TT (~19 day)
  → apex 5 nodes (recent ~250 TT 누적) linear ramp 0.05→1.0
  → top young leaves가 _명확히_ 작음 + ontogeny 6단계 자연 분포.
```

---

## Node Position → Ontogeny 자동 매핑 (사용자 "linear gradient")

Node가 emergence 시점부터 누적 ageTT를 가지므로:

| Node Position | ageTT | Stage |
|---|---|---|
| Top (recent emerged) | 50-200 TT | 단계 1-3 (primordium/petiole/leaflet 분화) |
| Mid | 400-800 TT | 단계 4-5 (확장/mature) |
| Bottom (oldest) | 1200+ TT | 단계 5-6 (mature/senescence) |

→ **linear gradient _자동_ emerge** (별도 node-position 산식 _불필요_).

---

## 사용자 핵심 통찰

> "토마토 잎은 처음에는 줄기 옆의 작은 돌기처럼 시작해서 잎자루가 길어지고,
> 그 축을 따라 좌우 소엽들이 깃털처럼 펼쳐지며, 시간이 지나면 각 소엽이 커지고
> 톱니·갈래가 생겨 복잡한 복엽이 됩니다. 그리고 잎겨드랑이에서 따로 나온 곁순은
> 잎이 아니라 장차 가지가 되는 새 줄기입니다."

이 ontogeny가 코드의 leaf engine에서 자연스럽게 emerge하도록 설계.

---

## References

- UC Davis Plant Biology Lab — [Tomato Leaf Anatomy](https://labs.plb.ucdavis.edu/rost/tomato/Leaves/leafanat.html)
- NC State Extension — [Plant Toolbox: Solanum lycopersicum](https://plants.ces.ncsu.edu/plants/solanum-lycopersicum/)
- Virginia Tech Extension — [Tomato Physiology and Morphology](https://pubs.ext.vt.edu/SPES/spes-508/spes-508.html)
- NC State Extension Handbook — [Botany](https://content.ces.ncsu.edu/extension-gardener-handbook/3-botany)

## Related Documentation

- [SKELETON_3TIER.md](./SKELETON_3TIER.md) — 3-tier 데이터 흐름
- [LEAF_PRESETS.md](./LEAF_PRESETS.md) — 5 age presets
- [LEAF_VARIATION_RULES.md](./LEAF_VARIATION_RULES.md) — correlation rules
