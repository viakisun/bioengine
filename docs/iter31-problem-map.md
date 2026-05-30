# Iter 31 — Problem Map (Phase 0)

> Phase 0 root cause 매핑 — Phase 1-3 fix _대상_ vs Iter 32 후보 _분리_.
> Plan: `/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md` (v3).

---

## 1차 결함 (Iter 31 v3 fix 대상)

### F3 R6 — Stem direction sway phase lag

| | |
|---|---|
| **Symptom** | D=20+ 모든 시점 apex 마지막 internode Δy ≈ 0.06cm (정상 5-9cm 대비 ~1%) |
| **Root cause** | `packages/tomato-engine/src/GrowthModel.ts:1655` |
| | `synthesizeGrowthDir(prev.growthDir, prev.position, anchor, ...)` |
| | `synthesizeGrowthDir` 내부 sway phase = `prevPos.y × freq` (height-dependent) |
| | _이전_ node 위치 전달 → phase lag → apex horizontal collapse |
| **Fix** | `nodes[i].position` 전달 (1648-1652에서 _이미_ 계산됨) |
| **Phase** | 1 (1-line) |
| **Evidence** | [`iter31-baseline.md`](./iter31-baseline.md) §2 |

### F2 R5 — Leaf geometry length projection

| | |
|---|---|
| **Symptom** | D=30 mature small side leaf bbox 55.6cm (target 102cm² → 정상 ~10cm) |
| **Root cause 1** | `src/plant/LeafGenerator.ts:309` `sizeFactor = current/target` LINEAR |
| | mature small leaf는 current==target → ratio=1 → sizeFactor=1 → full-size |
| **Root cause 2** | `packages/tomato-geometry/src/leafChunk.ts:97-98` `rachisLen = 0.32 × sizeFactor × maturity` |
| | hardcoded 0.32m (cultivar-independent) |
| **Fix** | Phase 2.A: `sqrt(currentArea / referenceLeafArea)` _절대_ ratio (PlantBase 계산) |
| | Phase 2.B: cultivar `referenceRachisLengthM` + `referencePetioleLengthM` 전파 |
| | Phase 2.C: `lengthMaturity` + `apicalYouthFactor` (PlantBase 계산, Skin _적용만_) |
| **Phase** | 2 (LeafGrowthModel computeLeafGeometryProjection + Skin refactor) |
| **Evidence** | [`iter31-baseline.md`](./iter31-baseline.md) §3 |

### F1 R4-후속 — Frame normal XZ plane lock

| | |
|---|---|
| **Symptom** | 모든 시점 _모든_ node frame.normal.y = 0 (XZ plane lock) |
| | 사진: 우측 cluster 6-7 leaves _동일 vertical plane_에 stack (fern frond) |
| **Root cause** | `src/plant/skeleton/populator/populateNodeTypes.ts:89` |
| | `normal = WORLD_UP × tangent = (0,1,0) × tangent` → 항상 y=0 |
| | + 각 node 첫 bone만 참고 → side-shoot 전체 similar frame |
| **Fix** | Phase 3.A parallel-transport (Gram-Schmidt) |
| | Phase 3.B side-shoot 첫 frame = parent main-axis frame seed |
| **Phase** | 3 (populateNodeTypes computeFrameWithTransport) |
| **Evidence** | [`iter31-baseline.md`](./iter31-baseline.md) §4 |

---

## 2차 결함 (Iter 32 후보, _이번 Iter scope 밖_)

### R7 — Side-shoot allocation min clamp 박힘

| | |
|---|---|
| **Symptom** | D=30 side:0 _모든_ leaf: axisSrc=0.5 / axisCap=0.35 / sideShoot=0.2 → final=0.15 |
| | (모두 하한 clamp 도달) |
| **Hypothesis** | `cultivar.sideShootPotential=0.4` 너무 낮음 |
| | + axis demand model 측지 stem 약함 과대 평가 |
| | + parentVigorFactor saturation |
| **Defer to** | Iter 32 (1 결함 1 Iter 원칙) |

### R8 — plantSourceFactor 0.65 lower clamp saturation

| | |
|---|---|
| **Symptom** | D=20~D=60 모두 plantSrc=0.65 박힘. D=70+에서 회복 (0.7→0.85→0.97) |
| **Hypothesis** | `SourceSinkProxyV1` 하한 clamp 0.65가 동적 변화 차단 |
| | + sourceSinkSensitivity 미사용 (Iter 30 P3에서 정의만, 산식 wire 미실현) |
| **Defer to** | Iter 32 |

### R9 — Cultivar referenceLeafAreaCm2 baseline value

| | |
|---|---|
| **Symptom** | (Iter 31 v3 fix _후_ 발견 가능) `maxLeafAreaCm2` 700cm²가 너무 큰지 작은지 미검증 |
| **Hypothesis** | Heuvelink TOMSIM medium-fruit 600-800cm² 정합 vs cultivar 차등 부족 |
| **Defer to** | Iter 32 (Phase 8 docs `iter32-candidates.md` 자동 분류) |

---

## Phase 1-3 Acceptance 매핑

| Phase | Invariant | Evidence | Pass 조건 |
|---|---|---|---|
| 1 R6 | `STEM-APICAL-DELTA-Y-01` | §2 표 | D=30/40/50 apical 5 internodes 마지막 2개 제외 평균 Δy ≥ 2cm |
| 1 R6 | `STEM-APICAL-TANGENT-UP-01` | (Phase 1 후 측정) | tangent.y > 0 모든 시점 |
| 1 R6 | `STEM-APEX-COLLAPSE-01` | §2 표 | 연속 2+ internode Δy < 0.2cm 0건 |
| 2 R5 | `LEAF-ABSOLUTE-AREA-SCALE-01` | §3 D=30 side:0 idx=0 | `sqrt(current/reference)` 패턴 사용, `current/target` 금지 |
| 2 R5 | `LEAF-MATURE-SMALL-LEAF-01` | §3 표 | mature small leaf (current ≤ 200cm²)의 linearAreaScale < 0.6 |
| 2 R5 | `LEAF-SIDE-SMALL-BBOX-01` | §3 D=30 side bbox | D=30 side leaf bbox ≤ 20cm |
| 2 R5 | `SKIN-NO-AGETT-ACCESS-01` | (Phase 2 후 grep) | LeafGenerator.ts에서 `leafOrganState.ageTT` 0건 |
| 3 R4 | `FRAME-NOT-XZ-LOCKED-01` | §4 표 | curved stem 구간 normal.y std > 0 (정상은 1e-3 이상) |
| 3 R4 | `SIDE-FRAME-PARENT-SEED-01` | (Phase 3 후) | side-shoot 첫 frame이 parent frame transport |

---

## Self-loop 1-3 입력

Phase 1-3 _순차_ 적용 후 Self-loop 1 (Geometry) → Loop 2 (Stem/frame) → Loop 3 (Allocation 분석만) 진행.

- Loop 1 수렴: D=30 max bbox ≤ 25cm + side bbox ≤ 20cm
- Loop 2 수렴: apex Δy ≥ 2cm + tangent.y > 0 + normal.y XZ lock 해소
- Loop 3 산출: `docs/iter32-candidates.md` (R7+R8+R9 자동 생성)
