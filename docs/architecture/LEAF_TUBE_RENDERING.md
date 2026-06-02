# Leaf Tube Rendering — Phase K0 + K1 + K2 + K3 (Iter 39)

> **Status K3 (current)**: K2 (connector visibility 1.0) + **K3 (mesh anchor
> 3D shift)**. K2 후에도 사용자 close-up에서 _수십 mm gap_ 잔존 — `mesh.position
> = leafletNode.pos`임에도 `normalizeLeafMeshVertices`가 _x만_ shift하여
> stem-side vertex y/z offset (~8~91mm) 잔존. K3로 3D shift → leaflet base가
> 정확히 leafletNode.pos에 anchor. yzOffset 0. [MESH_ANCHORS.md](MESH_ANCHORS.md).
>
> **K2 (current connector policy)**: connector edge `skinVisibleFraction = 1.0`
> 강제 (lateral-vein 1.0 / petiolule 1.0). gap-free 수학적 보장.
>
> K0/K1 history (archived):
> - K0 (forward truncate, 0.65/0.50): leaflet 쪽 35% gap (blade floating).
> - K1 (end-anchored truncate, 0.65/0.50): leaflet gap 해소, attach 쪽 10mm gap
>   잔존 (embed 0.6mm로 occlude 불가, 17배 차이).
> - K2 (fraction = 1.0): cut = 0, 양쪽 gap = 0 (수학적).
>
> K1 산식 _보호 장치_로 유지 (미래 fraction < 1.0 재도입 시 leaflet 쪽 자동
> 방지). SKELETON-EDGE-01 contract 보존.

## ★ 왜 K0가 필요했나

J0 종료 후 ([SKELETON_CLOSE.md](SKELETON_CLOSE.md)) full-plant 스크린샷 재검토
결과: blade가 _공중에 떠 있는_ 인상. skeleton overlay (녹색 노드 markers)는
정상, blade mesh도 정상. 그러나 _둘 사이를 잇는 connector_가 그려지지 않음.

**Root cause**: `populator/populateEdgePolicies.ts` 의 explicit skip:
```ts
'lateral-vein': 0.0,   // primary connector 완전 skip
petiolule:      0.30,  // intercalary 30%만
```

`buildTomatoSkeletonGraph.ts:1225` leaflet edgeType 매핑:
- primary    → `lateral-vein` → SDF skip
- intercalary → `petiolule`   → 30%
- terminal   → `leaf-rachis`  → 100%
- secondary  → `sub-vein`     → SDF skip (disabled OK)

→ primary leaflet (잎 _대부분_)의 connector tube가 완전 invisible.

historical decision (F2/H4): "vein = surface feature (normal map / midrib
brightness)". skeleton + blade _사이_의 connector 부재는 visual _implicit
assumption_ 위반.

## ★ 3-책임 분리 (v23 #5)

```text
(1) Leaf Blade Mesh    (LeafGenerator.buildLeafChunkSkin)
    - leaf blade mesh (vertex/index/uv)
    - vein normal map / midrib brightness texture
    - serration / lobe / waviness shape params
    - blade base = leafletNode.pos (normalizeLeafMeshVertices)
    - K0 범위 밖

(2) Skeleton Edge Tube (StemFamilyTubeNetworkBuilder)
    - SDF tube along bonePath
    - edge.renderPolicy 소비 (skinVisibleFraction × radiusScale)
    - K0 간접 영향 (policy 변경 → 자동 반영)

(3) Edge Render Policy (populator/populateEdgePolicies)  ★ K0-3 변경 위치
    - SKIN_VISIBLE_FRACTION_BY_TYPE 정의
    - radius (biological / render / floor) 산출
    - junction parentContext / visualHint
```

K0는 **(3)만 변경**. (1) blade mesh 산식 + (2) tube builder 산식 모두 보존.

## ★ Leaf Tube Edge Types 5개 (LEAF-TUBE-AUDIT-01)

| edge type | leaflet position 매핑 | skinVisibleFraction (K0-3A) | r0 평균 | 비고 |
|---|---|---|---|---|
| `petiole` | leaf 본체 → 첫 rachis node | **1.0** | ~5mm | 변경 없음 |
| `leaf-rachis` | rachis 따라 sub-rachis chain | **1.0** | ~1mm | 변경 없음 (terminal 포함) |
| `lateral-vein` | primary leaflet | **0.65** (K0-3A) | ~0.5mm | ★ 0.0 → 0.65 |
| `petiolule` | intercalary leaflet | **0.50** (K0-3A) | ~0.5mm | ★ 0.30 → 0.50 |
| `sub-vein` | secondary leaflet | **0.0** | — | secondary disabled |

baseline (J0 종료 시 day 45): petiole 8 / leaf-rachis 118 / lateral-vein 64 /
petiolule 46 / sub-vein 0.

## ★ K0-3A 채택 + K0-3B (reserve)

**채택**: K0-3A `lateral-vein 0.65 / petiolule 0.50`.

**근거** (원칙 #22):
- audit baseline lateral-vein 0.0 → 0.65 = "완전 invisible → visible" 카테고리
  전환. visual 해소의 _categorical_ 변화.
- F2/H4 design intent "vein = surface feature" 35% 보존 (vein 끝 35%는 vein
  texture 영역).
- petiolule 0.50 = primary와 비율 일관 (0.65 / 0.50 = primary 강조, intercalary
  완화).

**K0-3B (reserve)**: `lateral-vein 0.85 / petiolule 0.60`. K0-3A로 부족하다고
판단되면 ladder 전환 가능. 이 경우 connector tube가 vein 전체 ≈ 85% 그려져
_가지처럼_ 보일 위험 존재 — `LEAF-TUBE-VISIBILITY-01` upper 0.9에서 차단.

## ★ LEAF-TUBE-VISIBILITY-01 (lower + upper)

```text
renderPolicy.skinVisibleFraction:
  leaf-rachis  == 1.0
  lateral-vein ∈ [0.5, 0.9]
  petiolule    ∈ [0.45, 0.75]
  sub-vein     == 0.0    (ENABLE_SECONDARY_LEAFLETS = false 한정)
```

**Lower 정당화**: 0.5 / 0.45 미만에서는 connector tube가 _너무 짧아_ blade가
다시 floating. 0.0의 categorical 회귀 차단.

**Upper 정당화**: 0.9 / 0.75 초과에서는 connector가 vein 전체 길이를 거의
다 그려 _가지(branch) 인상_. F2/H4 surface-feature intent 완전 폐기 = 시각
역효과.

→ 두 ceiling 모두 _design intent_와 _visual fail_의 trade-off (원칙 #34).

## ★ LEAF-TUBE-AUDIT-01 (count correspondence)

`tests/architecture/leaf-tube-audit.spec.ts`:

1. **Existence**: petiole / leaf-rachis / lateral-vein / petiolule 모두 N > 0
   (sub-vein 제외 — secondary disabled OK).
2. **Count correspondence per leaf**:
   ```
   leaflet.primary     == 'lateral-vein' edge count
   leaflet.intercalary == 'petiolule'    edge count
   leaflet.secondary   == 'sub-vein'     edge count (현재 0/0)
   ```
   → graph build _자체_의 누락 catch (renderPolicy로 못 살리는 영역).

## ★ POSTCLOSE와 독립

- **POSTCLOSE-1** (engine sizeFactor inflation, J0-8B audit 62.5% FAIL) — K0와
  _독립_. K0 = rendering policy, POSTCLOSE-1 = engine scale.
- **POSTCLOSE-2** (J1 mesh pose roll/twist) — K0와 _독립_. K0 = connector tube,
  POSTCLOSE-2 = blade orientation.
- **POSTCLOSE-3** (secondary leaflet 복원) — K0의 `sub-vein 0.0`은 secondary
  disabled와 _일관_. secondary 활성 phase 진입 시 LEAF-TUBE-VISIBILITY-01의
  sub-vein 조항 갱신.

## ★ Snapshot Reference

`docs/screenshots/k0-tube/`:
- `k0-before-axis0-n13.png` — baseline (lateral-vein 0.0 / petiolule 0.30)
- `k0-3a-axis0-n13.png` — K0-3A 채택 (0.65 / 0.50)
- `k0-3b-axis0-n13.png` — 미생성 (K0-3A 채택, K0-3B reserve)

acceptance 결정은 LEAF-TUBE-AUDIT + LEAF-TUBE-VISIBILITY invariant (active 원칙
#21). snapshot은 reference (history).

## ★ K0 신규 Active 원칙 (33-34)

기존 1-32 ([SKELETON_SSOT.md](SKELETON_SSOT.md)) +

33. **Skeleton-Render 책임 분리 + Visual implicit assumption 보호** —
    Skeleton geometry 불변 (SKELETON-EDGE-01) + RenderPolicy로만 visual control
    (Phase H4 원칙). 단 _visual implicit assumption_ (blade-tube connector
    가시성) 위반 시 RenderPolicy 즉시 보정. "skin SDF가 무엇을 그리는가"는
    _visual fail_을 catch하는 보조 invariant 필요.

34. **Render policy 갱신은 _design intent_와 _visual fail_의 trade-off** —
    `lateral-vein = 0.0` 같은 explicit skip은 design intent (vein = surface
    feature). 그러나 _blade-tube connector_ 같은 visual implicit assumption
    위반 시 fraction _0.0이 절대 안 됨_ — 0.5+ floor 필수. upper bound도
    필요 (가지 인상 차단). docs에 trade-off 명시.

35. **End-Anchored Truncation (mesh anchor 보존)** — K1 신규.
    Connector edge (lateral-vein / petiolule / leaf-rachis 등)에서
    `skinVisibleFraction < 1.0` 시 `truncateBonePathByArcLength`는
    _mesh-anchor end (endNode.pos)_ 쪽 full 보존, start (attach) 쪽 자름.
    attach 쪽 cut는 parent tube embed (≥0.2mm)와 겹쳐 visible gap 덜 위험.
    mesh-anchor end는 blade base와 정확 연결되어야 (visual implicit assumption).
    threshold (LEAF-TUBE-ANCHOR-01): `distance(lastP1, endNode.pos) ≤
    max(2 × renderRadius, 1mm)`. 명칭: 내부 "Reverse Truncate" 구현, _문서
    외부_는 "End-Anchored" / "Anchor-Preserving".

## ★ K1 — End-Anchored Truncation (Iter 39 Phase K1)

### 왜 K1이 필요했나

K0-3A 적용 (lateral-vein 0.65 / petiolule 0.50) 후 사용자 close-up 재검토:
잎이 _여전히_ 끊긴 인상. 진단:

```text
edge.bonePath:   attachNode → archMid → leafletNode  (cp1 → cp2 → cp3)

K0 forward truncate (fraction 0.65):
attach ----- visible 65% ----- (35% cut) -----  leafletNode
            [tube end here]                    [blade base]
                                              ↑ gap

K1 end-anchored truncate (fraction 0.65 그대로):
attach (35% cut) ----- visible 65% ----- leafletNode
                  [parent rachis        [tube end == blade base]
                   embed에 묻힘]        ↑ no gap
```

`skinVisibleFraction`이 0.0이 아닌 한 forward truncate에선 _항상_ leaflet 쪽
일부가 잘림 → blade base와 visible gap. K0-3B (0.85/0.60)는 _완화_뿐 (35→40%만
줄임). K1 end-anchored는 _근본_ — gap 0 (LEAF-TUBE-ANCHOR-01 측정 dist ≈ 10⁻¹⁶m
= floating point noise).

### 4가지 보완 (사용자 v K1 검토)

1. **Empty fallback**: `out.length === 0` 시 마지막 segment 보존.
2. **Threshold = `max(2 × renderRadius, 1mm)`**: 매우 얇은 edge에서 r1 < 0.5mm일
   때 floor.
3. **`truncateBonePathByArcLength` export**: spec에서 unit-test 가능.
4. **명칭**: 내부 "Reverse Truncate" 구현, 문서 "End-Anchored Truncation".

### LEAF-TUBE-ANCHOR-01

`tests/architecture/leaf-tube-anchor.spec.ts`:
```text
∀ edge ∈ {petiolule, lateral-vein, leaf-rachis} with fraction < 1.0:
  truncated = truncateBonePathByArcLength(edge.bonePath, fraction)
  distance(truncated[last].p1, edge.endNode.pos) ≤ max(2 × r1, 1mm)
```

### K0-3A 값 유지

K1과 직교 변경. fraction 0.65/0.50 _자체_는 유지. end-anchored에서 K0-3A
값으로 gap 0. K0-3B (0.85/0.60) ladder _불필요_.

### Future Option (사용자 long-term 제안)

K1 후 만약 _가지 인상_이 실측 발견되면, "thick tube + thin connector 분리"
phase 추가:
- thick tube `skinVisibleFraction 0.6~0.8` (지금 attach 쪽 절반만 굵게)
- thin connector `connectorVisibleFraction 1.0` (얇게 끝까지)
이는 `renderPolicy` 구조 변경 — K1 범위 밖, 후속 phase.

## ★ K2 — Connector Visibility 1.0 (Iter 39 Phase K2, gap-free)

### 왜 K2가 필요했나

K1 (End-Anchored Truncation) 적용 후 사용자 close-up 재검토:
- **왼쪽 잎들 완벽 연결** (K1 정확 작동)
- **오른쪽 일부 leaflet 여전히 미세 틀어짐**

진단 (read-only):
1. **가설 A (attach 쪽 visible gap) 확정** — K0-3A `petiolule 0.5` × ~2cm
   edge = **attach 쪽 10mm cut**. embed depth는 **0.2~0.6mm**. cut(10mm) ≫
   embed(0.6mm) = 17배 차이. K1 plan의 "embed로 occluded" 가정 약점.
2. **가설 B (mesh anchor) 기각** — Iter 24 `normalizeLeafMeshVertices` +
   ANCHOR-05 (≤1mm) 정상.
3. **가설 C (stale worldMatrix) 기각** — Iter 28 fix 완료.

→ **사용자 첫 비판 ("attach 쪽 노출 ~30mm")이 측정으로 입증**. K1 reverse
truncate는 _gap 위치_를 attach 쪽으로 옮길 뿐, 양쪽 gap 모두 해소 불가.

### 핵심 통찰

`skinVisibleFraction < 1.0`인 한 _어느 쪽이든_ gap이 존재:
- K0 forward → leaflet 쪽 35~50% gap
- K1 end-anchored → attach 쪽 35~50% gap (~10mm, embed 0.6mm로 occlude 불가)

**완전 정확 = `fraction = 1.0`만 유일**. 산식:
```text
Skeleton bonePath:   attachNode.pos → leafletNode.pos (full SSOT)
Parent tube weld:    attach 쪽 SDF union + embed depth (보장)
Mesh anchor:         leaflet 쪽 normalizeLeafMeshVertices ANCHOR-05 (보장)
fraction = 1.0:      어떤 cut도 없음 → gap = 0 (수학적)
```

K0 historical decision (F2/H4 "vein = surface feature, SDF skip")가 visual
implicit assumption 위반. 0.65 같은 "절반 양보"는 _두 종류 gap_ 중 하나로만
이동 가능, 둘 다 해소 불가.

### K2 변경

`populator/populateEdgePolicies.ts` SKIN_VISIBLE_FRACTION_BY_TYPE:
```ts
'leaf-rachis':  1.0,   // 유지
petiolule:      1.0,   // K2: 0.50 → 1.0 (gap-free)
'lateral-vein': 1.0,   // K2: 0.65 → 1.0 (gap-free)
'sub-vein':     0.0,   // 유지 (secondary disabled 한정)
```

### K1 산식 = guardrail (회귀 보호)

K1 `truncateBonePathByArcLength` end-anchored 산식은 _현재 사용 중 핵심 로직_
아님 (K2에서 fraction 1.0 강제 → early-return). **미래 회귀 보호 장치**:
- 누군가 _다른 edge type_에 `skinVisibleFraction < 1.0`을 도입 → 자동 작동.
- LEAF-TUBE-ANCHOR-01 invariant (mode A graph + mode B synthetic) 산식 보호.

### sub-vein = 0.0 — 조건부 (v2 보완 #2)

**조건**: `ENABLE_SECONDARY_LEAFLETS = false` 전제.

POSTCLOSE-3 (secondary 활성) 진입 시 LEAF-TUBE-VISIBILITY-01의 sub-vein
조항을 _재검토_해야 함. sub-vein이 계속 0.0이면 secondary leaflet floating
문제가 _재발_ — K0/K1/K2에서 풀었던 것과 동일 메커니즘.

### K2-5 (가지 인상 발생 시) — Radius 조정 우선순위 (v2 보완 #1)

K2 적용 후 _가지 인상_이 실측 발견되면 시각 조정. 우선순위:

1. **1순위 `renderPolicy.skinRadiusScale`** ([PlantSkeletonGraph.ts:584](../../src/plant/skeleton/PlantSkeletonGraph.ts#L584)
   에 이미 정의, H4 도입). `populateEdgePolicies`에서 type dict로 0.7
   (lateral-vein, petiolule) 적용.
   - `StemFamilyTubeNetworkBuilder`가 `skinRadiusScale`을 _실제 consume_하는지
     확인 필요. 미consume 시 2순위.
2. **2순위 tube builder visual radius clamp** — skeleton bone radius 보존,
   _렌더 시점_에서만 시각 radius 별도.
3. **3순위 (최후) skeleton bone radius 직접 변경** — `buildTomatoSkeletonGraph.ts`
   `bonesFromCurve` r0/r1 수정. _위험_: bone radius는 SDF 계산 등 다른 영역에
   영향. docs에 명시.

bone radius 직접 변경은 _SSOT 영향 영역_ — 책임 분리 위반 가능. 1순위 우선.

### LEAF-TUBE-VISIBILITY-01 revised (K2)

```text
leaf-rachis  | value - 1.0 | ≤ 1e-6
lateral-vein | value - 1.0 | ≤ 1e-6     ← K2 강제 (was K0 [0.5, 0.9])
petiolule    | value - 1.0 | ≤ 1e-6     ← K2 강제 (was K0 [0.45, 0.75])
sub-vein     | value - 0.0 | ≤ 1e-6     ← secondary disabled 전제
```

tolerance 1e-6 = floating-point 안전 (v2 보완 #3).

### K2 신규 active 원칙 #36

**Connector edge는 visibility 자르지 않음** — lateral-vein / petiolule /
leaf-rachis는 leaf blade mesh와 _구조 연결_ 역할. fraction < 1.0은 어느 쪽이든
visible gap 야기:
- forward truncate → leaflet 쪽 gap (blade base 떠 보임)
- end-anchored truncate (K1) → attach 쪽 gap (parent embed 0.6mm로 occlude
  불가, cut 10mm)

시각 조정은 _radius_ (skinRadiusScale) 또는 _별도 thin connector 정책_으로만.
length 보존. (#34 K0 "design intent vs visual fail trade-off"는 _radius
영역_에 한정 — fraction 영역 폐기.)
