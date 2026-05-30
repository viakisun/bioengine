# Iter 31 — Pre-fix Baseline (Phase 0)

> Phase 0 baseline freeze — Phase 1-3 fix _전_ 측정값 동결.
> Source: [`iter31-multi-timepoint-leaf-node-data.md`](./iter31-multi-timepoint-leaf-node-data.md)
> Branch + commit: `iter30-hotfix-and-allocation @ 92aeff6` (Iter 30 종료)
> Generated: 2026-05-30

---

## 1. Plant-level baseline

| D | stemHeight | nodeCount | visibleLeaves | phytomerBound | bbox 최대 | bbox 평균 |
|---|---|---|---|---|---|---|
| 10 | 17.1cm | 8 | 0 | 0 | — | — |
| 20 | 31.5cm | 11 | 1 | 1 | 4.6cm | 4.6cm |
| 30 | 50.1cm | 14 | 9 | 9 | **55.6cm** (side:0 idx=0) | 35cm |
| 40 | 71cm | 17 | 7 | 7 | 62cm (main idx=11) | 38cm |
| 50 | 93.5cm | 20 | 10 | 10 | 62.8cm (main idx=10) | 41cm |
| 60 | 117.4cm | 23 | 13 | 13 | 66.5cm (main idx=16) | 51cm |
| 70 | 143cm | 26 | 16 | 16 | 67.1cm (main idx=19) | 51cm |
| 80 | 167.5cm | 29 | 19 | 19 | 67.5cm (main idx=10) | 56cm |
| 90 | 189.6cm | 32 | 22 | 22 | **72.2cm** (main idx=10) | 60cm |

→ D=30+ 모든 시점에서 max bbox > 35cm hard guard 위반.

## 2. R6 Stem Direction Bug Evidence

D=20~D=30 stem 마지막 3 node Δy:

```
D=20 (nodes 9,10):           5.31, 0.61, 0.06  ← apex 폭주 시작
D=30 (nodes 11,12,13):       2.00, 0.64, 0.07  ← 연속 collapse
D=40 (nodes 14,15,16):       2.14, 0.70, 0.06
D=50 (nodes 17,18,19):       2.04, 0.42, 0.05
D=60 (nodes 20,21,22):       2.40, 0.72, 0.08
D=70 (nodes 23,24,25):       2.19, 0.70, 0.07
D=80 (nodes 26,27,28):       2.01, 0.61, 0.06
D=90 (nodes 29,30,31):       1.70, 0.53, 0.06
```

→ 모든 시점에서 마지막 internode Δy ≈ 0.06cm. 정상 internode 5-9cm 대비 ~1%.
→ Phase 1 R6 root cause: `GrowthModel.ts:1655` `synthesizeGrowthDir(prev.position, ...)`
  → fix: `nodes[i].position`.

## 3. R5 Leaf Length Projection Evidence

### Mature small side leaf 직접 evidence

**D=30 side:0 idx=0** (★ Phase 2.A v3 sqrt(current/reference) fix의 핵심 evidence):

| 측정 | 값 |
|---|---|
| target | 102 cm² |
| current | 102 cm² (mature) |
| current/target | 1.000 (sizeFactor v1 LINEAR = 1.0) |
| **bbox** | **55.6 cm** |
| 정상 길이 sqrt(102) | ≈ 10cm |
| 폭주 배수 | **5.5×** |

→ v1 산식 `sqrt(current/target) = 1`로는 잡을 수 없음.
→ v3 `sqrt(current/reference) = sqrt(102/700) = 0.38` → 38% scale → 정상.

### Main leaf 비교 (mature size별 bbox / sqrt(target) ratio)

| D | leaf | target | sqrt | bbox | ratio | 폭주 |
|---|---|---|---|---|---|---|
| 30 main idx=10 | mature | 374 | 19.3 | 48.6 | 2.5× | mid |
| 30 side:0 idx=0 | mature | 102 | 10.1 | 55.6 | **5.5×** | severe |
| 50 main idx=10 | mature | 522 | 22.8 | 62.8 | 2.8× | mid |
| 90 main idx=10 | mature | 650 | 25.5 | 72.2 | 2.8× | mid |

→ 작은 leaf일수록 폭주 배수 큼 (sizeFactor LINEAR이 작은 area에서 _상대적_ 영향 큼).

### sizeFactor LINEAR 패턴 검증

```
D=30 main idx=10/11 (compound_mature): sizeFactor = 1.0
D=30 main idx=12 (compound_developing): sizeFactor = 0.6 (current/target = 0.6)
D=30 main idx=13 (simple_leaf, young): sizeFactor = 0.25
```

→ sizeFactor가 current/target ratio. mature leaf는 항상 1.0.
→ 어떤 작은 mature leaf라도 sizeFactor=1.0이라 full-size 렌더.

## 4. R4 Frame Normal XZ-Plane Lock Evidence

**모든** node frame.normal에서 _y component = 0_ (D=30/40/50/60/70/80/90 전수 확인):

```
D=30 main:
  node 10: tangent=(0.61,-0.32,-0.72) normal=(-0.76, 0.00, -0.65)  ← y=0
  node 11: tangent=(0.01,-0.16, 0.99) normal=( 1.00, 0.00, -0.01)  ← y=0
  node 12: tangent=(-0.66,-0.02,-0.75) normal=(-0.75, 0.00,  0.66)  ← y=0
  node 13: tangent=(0.99,-0.00, 0.13) normal=( 0.13, 0.00, -0.99)  ← y=0

D=30 side:0:
  node 0: tangent=(0.90,-0.43, 0.00) normal=( 0.00, 0.00, -1.00)   ← y=0
  node 1: tangent=(-0.69,-0.37, 0.63) normal=( 0.68, 0.00,  0.74)  ← y=0
  ...

D=50/60/70/80/90 — 동일 패턴, normal.y = 0 _모든_ node.
```

→ `normal = WORLD_UP × tangent = (0,1,0) × tangent` → 결과는 항상 horizontal plane (y=0).
→ 모든 leaf droop이 _같은 binormal axis_ 주위로 회전 → fern frond stack.
→ Phase 3 root cause: `populateNodeTypes.ts:89` cross product 자체.
→ fix: parallel-transport (Gram-Schmidt) + side-shoot parent frame seed.

## 5. Allocation Saturation (Iter 32 후보, _분리_)

### R7 — side-shoot min clamp 박힘

D=30 side:0 5 leaves _모두_ identical:
```
plantSrc=0.65, axisSrc=0.5 (min), axisCap=0.35 (min), sideShoot=0.2 (min),
stress=1.0 → final=0.15 (min) — side_shoot_limited
```

→ axisSrc / axisCap / sideShoot / final 모두 _하한 clamp_ 도달.
→ Iter 32 R7 — sideShootPotential, parentVigor model recalibration.

### R8 — plantSourceFactor 0.65 saturation

```
D=20: 0.65   D=30: 0.65   D=40: 0.65   D=50: 0.65   D=60: 0.65
D=70: 0.70   D=80: 0.85   D=90: 0.97
```

→ D=20~D=60 모두 0.65 하한 박힘. D=70+에서 회복.
→ Iter 32 R8 — sourceSinkProxyV1 dynamic range, sourceSinkSensitivity wire 재검토.

## 6. Posture (참고용 — 사진의 90° droop은 R5 length 폭주의 시각 효과)

mature leaf의 finalDroop은 산식상 30° 이하. 사진의 _90° droop_은 droop 산식 결함이
아니라 R5 length 폭주로 길게 처진 시각 효과:

| D | leaf | gravityDroop | finalDroop |
|---|---|---|---|
| 30 main idx=10 (mature) | 18.9° | 18.9° |
| 50 main idx=10 (mature) | 29.4° | 29.4° |
| 90 main idx=10 (mature) | 38.8° | 56.1° (+ sen 17.3°) |

→ posture 산식 자체는 합리적. Iter 31에서 추가 fix _불필요_.

## 7. 문헌 backbone 정합

- **TOMGRO (Wageningen)**: organ dynamic state (잎/과실/stem segment) — PhytomerNode 구조 정합
- **Heuvelink TOMSIM 1996**: stem node number plastochron + sink strength partitioning — Iter 30 Phase 2 LeafAllocationState 정합
- **Marcelis 1996**: sink strength = potential growth rate — potentialAreaCm2 (Iter 30 Phase 2) 정합
- **Heuvelink Leaf Area Management**: LAI per vegetative unit + old leaf removal — Iter 32+ scope

→ 시각 회귀 1차 원인은 source-sink 모델이 아니라 **geometry projection (Phase 2)
+ stem direction (Phase 1) + frame continuity (Phase 3)**. Iter 31 v3는 이 3축 집중.

## 8. Phase 0 종료

- ✅ `docs/iter31-multi-timepoint-leaf-node-data.md` 존재 (Phase 0.0)
- ✅ 본 `docs/iter31-baseline.md` 측정값 동결
- ➡️ 다음: `docs/iter31-problem-map.md` (root cause 매핑)
- ➡️ Phase 1-3 fix 시작
