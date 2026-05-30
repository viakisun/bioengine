# Iter 32 Candidates (Auto-classified from Iter 31 Self-loop 3)

> 생성: Iter 31 Phase 7 Self-loop Loop 3 — _수정 없음, 분석만_.
> Source: [`docs/analysis/iter31-dump-analysis.md`](./analysis/iter31-dump-analysis.md) Detector 5.
> Iter 31 commits: `b7887e8..17473e1` (Phase 0-4) + 본 commit.

---

## Iter 31 v3 _이번에 fix한_ 결함

- ✅ F3 R6 — Stem direction (synthesizeGrowthDir current pos)
- ✅ F2 R5 — Leaf geometry projection (PlantBase 계산, Skin 적용만)
- ✅ F1 R4-후속 — Frame parallel-transport + side-shoot parent seed
- ✅ F4 R11~R18 → **Phase 10** — leaf rotation 4줄 단순화 (`09233be`)
  - R11 baseAlign convention
  - R12 azimuth around world Y
  - R14 azimuth 제거 (parallel-transport phyllotaxy)
  - R16 curl 0.30 (transverse cup)
  - R17 droop base 0.30 (cantilever)
  - R18 droop axis horizontal ⊥ petiole
  - **Phase 10 종합 폐기 + `makeLeafQuaternion(petiole, bladeUp)` 4줄**

## Phase 10 사용자 통찰

> "잎 방향 하나를 결정하는데 왜 이렇게 복잡한가?"

R11~R18 6번 fix 반복은 _wrong abstraction (4 회전 합성) 안에서 헛바퀴_.
사용자 지적 후 _2 vector (petiole + bladeUp) → lookRotation quat_ 4줄로 단순화.

측정값 (D=30 9 leaves):
- petiole world y _모두 음수_ (gravity drop) ✅
- blade world y _모두 > 0.95_ (위 향함) ✅
- petiole world az std 100.8° (phyllotaxy spread) ✅

## Iter 32 _분리된_ 후보 (자동 분류)

### R7 — sideShootPotential cultivar 재보정 (★ 우선순위 1)

**Symptom**: D=30 side:0 모든 leaf (5/5)에서:
- `axisSrc = 0.5` (clamp)
- `axisCap = 0.35` (clamp)
- `sideShoot = 0.2` (clamp)
- `finalAlloc = 0.15` (clamp)
- `limitationReason = 'side_shoot_limited'`

**Root cause 가설**:
1. `cultivar.sideShootPotential = 0.4` default가 너무 낮음
2. `computeSideShootAllocationFactor` clamp 범위 [0.2, 0.7] 하한 도달
3. side-shoot stem `axisCapacityFactor` clamp 범위 [0.35, 1.0] 하한 도달

**Fix 방향**:
- cultivar `sideShootPotential` cultivar variant별 차등 (cherry 0.5 / indeterminate 0.6+)
- side-shoot stem radius / length 측정 보정 (axisStructuralCapacity)
- `computeApexDominanceReleaseFactor` apex 위치 정밀화

**관련 파일**:
- `packages/tomato-engine/src/growth/SideShootAllocation.ts`
- `packages/tomato-engine/src/growth/AxisCapacityModel.ts`
- `packages/tomato-engine/src/CultivarGrowthProfile.ts`

---

### R8 — plantSourceFactor 0.65 lower clamp 동적화 (★ 우선순위 2)

**Symptom**: D=20~D=60 모든 시점에서 `plantSrc = 0.65` _하한 박힘_.
D=70+ 회복 (0.7 → 0.85 → 0.97).

**Root cause 가설**:
1. `SourceSinkProxyV1` 하한 clamp 0.65가 _작은 plant_에서 항상 active
2. `sourceSinkSensitivity` (Iter 30 P3에 정의, 부분 wire-in) 영향 부족
3. supply/demand ratio가 _절대값_으로는 합리적이지만 clamp가 _차이를 평탄화_

**Fix 방향**:
- 하한 clamp [0.65, 1.15] → [0.45, 1.30] 확장 (TOMSIM 정합)
- `sourceSinkSensitivity` full wire-in (cultivar별 sink 차등 정밀화)
- _작은 plant_에서 demand가 _상대적으로_ 큰 점 보정 (D=20~D=60 영향)

**관련 파일**:
- `packages/tomato-engine/src/growth/SourceSinkProxyV1.ts`

---

### R9 — cultivar referenceLeafAreaCm2 차등화 (Phase 2.A 추가 calibration)

**Symptom**: Iter 31 Phase 2 R5 fix 후 D=30 main max bbox 48.6 → 45.6cm (-6%만 회복).
Visual target ≤ 25cm 미달성.

**Root cause 가설**:
- Phase 2.A 산식 자체는 정확 (sqrt(current/reference))
- D=30 main idx=10 current=374cm², reference=700cm² → sqrt = 0.73 → leafAxisLengthScale 0.64
- rachisLen = 0.30 × 0.64 = 19cm — 정상 mature
- 그러나 _사용자 시각_에서는 D=30 main leaf 25cm 정도가 자연
- → `referenceLeafAreaCm2 = 700` 자체가 너무 _큼_ vs D=30 main mature 정상 size

**Fix 방향**:
- `referenceLeafAreaCm2` cultivar 재정의 (medium 500cm² 추천)
- 또는 _global_ leafSizeMultiplier reduce
- TOMSIM Heuvelink "medium tomato 600-800cm² mature"는 _최종_ size — D=30은 중간 단계

**관련 파일**:
- `packages/tomato-engine/src/CultivarGrowthProfile.ts`
- `packages/tomato-engine/models/cultivars/*.jsonc`

---

### R10 — sourceSinkSensitivity full wire-in

**Symptom**: Iter 30 Phase 3에서 정의 + partial wire-in. 그러나 plantSrc 박힘 (R8과 결합) +
cultivar 차등 효과 미관찰.

**Fix 방향**:
- `SourceSinkProxyV1.computeSourceSinkProxyV1FromPlant` 산식에 sensitivity 영향
- assertion test 강화

---

### R20 — Phase 10 cleanup + Quality Gate I wake (★ 우선순위 1)

**Status**: Iter 31 close 시점 _Phase 10_ 4줄 산식 측정값 통과, 사용자 _시각 wake_ 미확인.

**Iter 32 작업**:
- Phase 10 사용자 D=30 사진 wake — visual 회복 확인
- 시각 미회복 시 _추가 surgical fix_ — 단, **합성 회전 abstraction _금지_** (R11~R18 패턴 반복 금지)
- `composeLeafRotationLocal` legacy fallback path cleanup (Phase 10 채택 후 거의 사용 안 됨)
- `posture.azimuthDeg` 필드 제거 검토 (Phase 10에서 무시)
- visual hard guard recalibration:
  - VISUAL-D30-BBOX-HARD-01 (≤ 50cm) — R14+R16+R17 적용 후 회귀, 신규 baseline 측정 필요
  - VISUAL-D45-BBOX-HARD-01 (≤ 65cm) — 동일

**관련 파일**:
- `src/plant/skeleton/AnchorTransform.ts`
- `src/plant/skeleton/populator/populateAnchorMorphology.ts`
- `tests/architecture/iter31-visual-recovery.spec.ts`

---

## Iter 31 _완료된_ Acceptance 요약

| Phase | Invariants | Commit |
|-------|------------|--------|
| Phase 0 | 6/6 baseline | `b7887e8` |
| Phase 1 R6 stem | 7/7 | `a20ad9e` |
| Phase 2 R5 leaf | 15/15 | `12a66e1` |
| Phase 3 R4 frame | 8/8 | `9be4644` |
| Phase 4 visual | 7/7 | `17473e1` |
| Phase 5-6 analysis | 6/6 | (Phase 8 commit) |

Iter 30 (155) + Iter 31 (49 = 6+7+15+8+7+6) = **204 architecture invariants**.

## Visual Recovery 측정 요약

| 지표 | Iter 30 baseline | Iter 31 Phase 1-3 | 회복 |
|------|------------------|---------------------|------|
| D=30 side max bbox | 55.6cm | 36.4cm | **-35%** |
| D=30 main max bbox | 48.6cm | 45.6cm | -6% |
| frame.normal.y (side) | 0 (lock) | -0.275 (diverse) | **XZ 해소** |
| D=30 apex tangent.y | (collapse) | > 0.99 모두 | **vertical** |
| D=30 side leaf XZ spread | (fern stack) | 11.5cm | **분산** |
| area 보존 (D=30 main mean) | 254.5cm² | 254.3cm² | Δ 0.1% ✅ |

## Quality Gate I

Phase 7 Self-loop 1-3 수렴 + Quality Gate I _사용자 wake_ 의무.
사용자 D=15/30/45/90 사진 재촬영 → fern stack + horizontal stem + size 평가.
미해결 결함은 본 문서 R7/R8/R9/R10에 추가 분류.

---

## ★ Iter 31 R26 Cleanup 후 추가 후보 (Phase F~Z)

### POSTURE-FIELD-CLEANUP-01 (Phase F marker → Iter 32 제거)

R26 이후 `LeafPostureState` 4개 필드 — `azimuthDeg`, `petioleElevationDeg`,
`droopDeg`, `twistDeg` — _leaf rotation에 미사용_. `curl`만 leafChunk mesh
deformation에서 활용. Phase F는 _@deprecated JSDoc marker만_ 추가;
실제 제거는 Iter 32:

- LeafPostureState rotation 4 필드 _interface 제거_
- `LeafPostureModel.composePosture()` 출력 4 필드 _drop_
- PlantBase가 채워주는 _population 경로_ 정리
- 관련 architecture invariant (`LEAF-POSTURE-COMPOSITION-01` 등) 갱신 또는 정리
- ★ 사전 의존성 grep: `posture.azimuthDeg|petioleElevationDeg|droopDeg|twistDeg`
  사용처 0건 확인

### ANCHOR-TRANSFORM-COMPOSE-LEAF-ROTATION-REMOVAL-01 (Phase B 후보)

Phase B에서 `composeLeafRotation` 함수는 _Iter 30 SKELETON-ANCHOR-TRANSFORM-01
invariant 보존_ 위해 유지. Iter 32에서:

- `composeLeafRotation` 함수 + `quatY` / `quatX` / `quatZ` / `quatMul` 의존 제거
- Iter 30 `SKELETON-ANCHOR-TRANSFORM-01` invariant _deprecation_ 또는 단위 검증
  대상을 _IDENTITY_QUAT + makeLeafQuaternion_으로 갱신
- composeLeafRotation 호출하는 _test spec 정리_ (이미 `_archive`에 한 개 보존)
