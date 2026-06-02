# Skeleton Close — J0 종료 Baseline (Iter 39)

> **Status: CLOSED** (J0-9E, Iter 39 Phase J0 종료).
>
> 이 문서는 _Skeleton 영역이 botanical 토마토 복엽으로 닫혔다_는 baseline.
> 이후 변경은 본 문서의 21 invariants 회귀 검증 필수.

## ★ Skeleton Close 8 조건 (사용자 v21 #4)

```text
1. SSOT / layout-first invariants PASS
2. Curvature RANGE PASS
3. Attach spacing rhythm PASS
4. Branch direction variation PASS
5. Branch length rhythm PASS
6. Hierarchy visible PASS
7. Closure coverage PASS
8. Isolated Mode A sanity (compound leaf 인식) — 결정 기준 X, sanity only
```

**Critical**: 결정은 1-7 _metrics_ (active 원칙 #21 사용자: graph-native 정량
기반). 8번은 _참고 reference_ — sanity check.

## ★ 27 Invariants 누적 (H 4 + I 1 + J0-1~9 16 + K0 2 + K1 1 + K3 1 revised + L0 1 — Iter 39 Phase L0-D-1)

> **L0-D-1 (Per-Leaflet Pitch)**: K3 후에도 close-up "안쪽 cup" 인상 잔존
> 진단 — `foldDroopDeg = -10 + 40 × maturity` (mature 30°)이 leaflet plane
> 평균 31° tilt 야기. Track A (vertex cup/droop) baseline 측정으로 _반박_
> 후 폐기. Root cause = per-leaflet pose. fix: `-5 + 15 × maturity` (mature
> 10°). normalDotUp p50 0.854 → 0.951. [LEAF_MESH_SHAPE.md](LEAF_MESH_SHAPE.md).

> **K3 (Mesh Anchor 3D)**: K2 후에도 사용자 close-up _수십 mm gap_ 잔존
> 진단 — `normalizeLeafMeshVertices`가 x만 shift, stem-side vertex y/z offset
> p50 8mm / max 91mm. K3에서 3D shift (x, y, z 모두) → stem-side = (0, 0, 0).
> ANCHOR-04 (K3 3D revised). [MESH_ANCHORS.md](MESH_ANCHORS.md).

> **K0 (Leaf Tube Rendering, lateral-vein 0.0 → 0.65 / petiolule 0.30 → 0.50)**:
> [LEAF_TUBE_RENDERING.md](LEAF_TUBE_RENDERING.md). `lateral-vein` explicit
> skip이 visual implicit assumption 위반 → policy 보정.
>
> **K1 (End-Anchored Truncation)**: forward truncate가 leaflet 쪽 잘라 blade
> base gap. `truncateBonePathByArcLength` 방향 역순화. K2 후에는 _guardrail_
> (현재 사용 안 함, 미래 회귀 보호).
>
> **K2 (Connector Visibility 1.0)**: K1 reverse 후에도 attach 쪽 ~10mm gap
> 잔존 (embed 0.6mm, 17배 차이). `fraction = 1.0`만이 양쪽 gap 모두 해소.
> lateral-vein 0.65 → 1.0, petiolule 0.50 → 1.0. LEAF-TUBE-VISIBILITY-01
> revised (range 폐기, == 1.0 강제). 원칙 #36.

### Phase H — Structural Integrity (4)
- `SKELETON-EDGE-01` — bonePath endpoint == node.pos (≤1mm)
- `NODE-EDGE-INCIDENCE-01` — node.edgeIds incidence strict
- `LEAFLET-REF-01` — attachNodeId/parentLeafNodeId 존재 + bladeDir 정규화 + targetSizeM > 0
- `LEAF-COMPOUND-GROUP-01` — 같은 parentLeafNodeId 그룹은 하나의 compound leaf

### Phase I — Layout-First (1)
- `LEAFLET-ATTACH-COHERENCE-01` — primary/intercalary attachNodeId rachis-attach + edge.startNodeId 일치

### Phase J0-1~6 — Closure Foundation (8)
- `RACHIS-MONOTONIC-01` — projection strict 증가 + segment dot > 0.70
- `RACHIS-SMOOTH-01` — 인접 tangent dot > 0.85
- `LEAFLET-DETERMINISM-01` — node.pos byte-identical 재빌드
- `HIERARCHY-VISIBLE-01` — term/prim ≥ 1.20, prim/inter ≥ 2.2 (J0-9B-1 강화)
- `LR-STAGGER-01` — 좌우 같은 U 0, sizeFactor 차이 ≥ 0.05
- `COMPOUND-GAP-01` (case-aware) — young/mature/complex
- `COMPOUND-SLOTS-01` — intercalary primary 영역 ±0.10
- `TERMINAL-CLEARANCE-01` — lastPrimaryU ≤ 0.82, clearance ≥ 0.15

### Phase J0-7 — Rhythm Restoration (4)
- `ATTACH-SPACING-CV-01` — pair ≥ 3, 간격 CV ∈ [0.05, 0.30]
- `BRANCH-DIR-VARIATION-01` — pair ≥ 2, forward variance > 0.0001
- `PETIOLULE-LEN-01` (재정의) — primary avg ≤ 0.10, max ≤ 0.12, min ≥ 0.04
  (실제 ratio, inflated 잎 제외)
- `RACHIS-CURVATURE-PRESENCE-01` (J0-8A에서 RANGE-01로 대체, 본 spec retired)

### Phase J0-8 — Curvature Amplification (1)
- `RACHIS-CURVATURE-RANGE-01` — relSag ∈ [4%, 10%] (visual detectability)

### Phase K0 — Leaf Tube Rendering (2)
- `LEAF-TUBE-AUDIT-01` — 5 leaf tube edge types (petiole / leaf-rachis /
  lateral-vein / petiolule, sub-vein 제외) 모두 graph 존재 + 잎별 leaflet
  count vs edge count 대응 (primary↔lateral-vein, intercalary↔petiolule)
- `LEAF-TUBE-VISIBILITY-01` (K2 revised) — connector edge (leaf-rachis /
  lateral-vein / petiolule) `|value - 1.0| ≤ 1e-6` 강제 + sub-vein `|value
  - 0.0| ≤ 1e-6` (secondary disabled 전제). K0 range [0.5, 0.9] / [0.45,
  0.75] 폐기. 원칙 #36 (connector는 visibility 자르지 않음).

### Phase K1 — End-Anchored Truncation (1 신규, K2에서 guardrail)
- `LEAF-TUBE-ANCHOR-01` (mode A graph + mode B synthetic) — K1
  `truncateBonePathByArcLength` end-anchored 산식 보호. mode A: 현재 graph에
  fraction < 1.0 edge가 있을 시 검증 (K2 후 0개, vacuously PASS). mode B:
  synthetic fixture (6 fractions)로 산식 자체 회귀 catch. 원칙 #35.

### Phase L0-D-1 — Per-Leaflet Pitch (1 신규)
- `LEAF-LEAFLET-PITCH-01` — `mesh.rotationQuaternion`이 leaflet plane을
  과도 기울이는 회귀 방지. planeNormalDotUp (= rotated mesh +Y · WORLD_UP)
  분포 검증: p50 ≥ 0.93 (= cos(22°)), p90 ≥ 0.85, mean ≥ 0.90. L0 이전
  (foldDroopDeg mature 30°)는 p50 0.854로 자동 fail. 원칙 #37.

### Phase J0-9 — Grammar Closure (4)
- `CLOSURE-MAX-UNCOVERED-GAP-01` — influence radius (primary 0.11 / intercalary
  0.06 / terminal 0.10) coverage. rachis [0.15, 0.95] uncovered max ≤ mature
  0.18 / young 0.30
- `CLOSURE-INTERCALARY-FILL-01` — pair-base macro gap fill ratio ≥ 0.60 (pair ≥ 3)
- `CLOSURE-TERMINAL-EMPHASIS-01` — terminalU ≥ 0.95 + term/prim ≥ 1.20 +
  clearance ∈ [0.15, 0.28]
- `CLOSURE-ROLE-SEPARATION-01` — sizeRatio ≥ 2.2 + branchLenRatio ≥ 1.6 (apex
  clamp 영역 제외)

## ★ J0-9 Baseline Metrics (post J0-9D, day 45)

```text
maxUncoveredUOverall:       0       (완전 cover)
maxUncoveredUAvg:           0
intercalaryFillAvg:         1.00    (100%)
terminalUAvg:               1.00
terminalSizeOverPrimAvg:    1.82
terminalClearanceAvg:       0.19
roleSizeRatioAvg:           3.43
roleBranchLenRatioAvg:      5.60
```

## ★ Critical Constants (J0 종료 시점 freeze)

**Rachis curvature** (J0-8A, _freeze_ — active 원칙 #29):
```
droopMag  = rachisLen × 0.060 × 4u(1-u)    (peak 6%)
sideBend  = rachisLen × 0.015 × sin(πu) × leafSideBias  (peak 1.5%)
```

**Primary U** (J0-9A-1):
```
1: [0.50]
2: [0.34, 0.68]
3: [0.27, 0.48, 0.74]
4: [0.20, 0.42, 0.62, 0.79]    (gap 0.22/0.20/0.17 distal closure)
stagger ±0.020
```

**Primary direction** per pair index (J0-8C-1 moderate):
```
pair[0]: 0.70 lateral / 0.30 forward
pair[1]: 0.66 / 0.34
pair[2]: 0.68 / 0.32
pair[3]: 0.62 / 0.38 (fan)
```

**Primary branch length** per pair index (J0-9C):
```
pair[0]: factor 0.105
pair[1]:        0.100
pair[2]:        0.095
pair[3]:        0.090
intercalary:    0.050
terminal:       0
```

**Size factors** (J0-9B-1):
```
primary baseSf:    1.00 - i × 0.10  (range 1.00 ~ 0.70)
intercalary sf:    0.25 + (i%3) × 0.05  (0.25 / 0.30 / 0.35)
terminal sizeFactor: 1.0
POSITION_SIZE_MULT.terminal: 0.38 (유지)
```

**Intercalary slot** (J0-9A-1): largest-gap-first + sorted unique

## ★ Commit 누적 (J0-1 ~ J0-9)

- J0-1: Isolated Leaf Debug Mode (Mode A/B)
- J0-2A: Rachis simplification + RACHIS-MONOTONIC/SMOOTH
- J0-2B: droopRad audit (patch skip)
- J0-2C: rollOffset/twistOffset 제거 + LEAFLET-DETERMINISM-01
- J0-metrics: 8지표 probe
- J0-3A/B/decision: PETIOLULE-LEN-01 (J0-3B 채택 0.08/0.04)
- J0-4: PRIMARY_US 재분포 + COMPOUND-GAP/SLOTS/TERMINAL-CLEARANCE
- J0-5: hierarchy ratio + HIERARCHY-VISIBLE-01
- J0-6: LR-STAGGER-01
- J0-7A: rachis weak single arc (2.5% sag, 후 J0-8A 6%로 amplify)
- J0-7B: PrimaryUs rhythm + ATTACH-SPACING-CV-01
- J0-7C: PRIMARY_DIR_WEIGHT_BY_PAIR_INDEX + BRANCH-DIR-VARIATION-01
- J0-7D: branch length 0.10/0.05 채택 + PETIOLULE-LEN 재정의
- J0-7E/F: rachis metrics + docs
- J0-8A: rachis sag 2.5% → 6% + RACHIS-CURVATURE-RANGE-01
- J0-8B: rachisLen audit (FAIL 62.5% → POSTCLOSE-1)
- J0-8C-1: branch direction moderate forward (PRIMARY_DIR_WEIGHT 갱신)
- J0-9A-1: PRIMARY_US distal closure + largest-gap-first intercalary
- J0-9C: PRIMARY_BRANCH_LENGTH_BY_PAIR_INDEX + PETIOLULE-LEN realRatio
- J0-9B-1: hierarchy sf 강화 + HIERARCHY 1.20/2.2
- J0-9D: Compound Closure 4 invariants (influence radius)
- J0-9E: 본 docs + POSTCLOSE_PHASES.md

## ★ Active 원칙 1-32

Phase H/I/J0의 모든 원칙은 [SKELETON_SSOT.md](SKELETON_SSOT.md) 참조.

핵심 J0-9 신규:
- #30 곱셈 score 금지 — 독립 invariants 또는 정규화 0~100 점수
- #31 Coverage = influence radius (단순 center gap X)
- #32 Reporting first → Hard invariant (baseline 측정 후 활성)

## ★ Audit 결과

### droopRad audit (J0-2B)
```
n=8, min 0.34°, p50 25.08°, p95 33.12°, max 33.12°, avg 18.33°
```
모두 ≤ 45° → patch skip.

### rachisLen audit (J0-8B) — **FAIL**
```
n=8, min 6.2cm, p50 76cm, p95 1.26m, max 1.26m, avg 65cm
inflation 62.5% (5/8 visible, rachisLen > 0.40m)
botanical 토마토 mature: 25-30cm
```
→ **POSTCLOSE-1** 후속 phase 필수.

## ★ 다음 단계

→ [POSTCLOSE_PHASES.md](POSTCLOSE_PHASES.md)
