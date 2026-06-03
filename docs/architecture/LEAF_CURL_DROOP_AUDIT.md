# Leaf Curl + Droop Audit (L9-A v3 S78b)

토마토 잎의 _가운데 V자 fold_ 문제 + _자연 droop_ 시스템을 _정량적_으로
분리 진단. 사용자 캡처에서 잎이 _중심선 기준 V자_로 접혀있는 현상을
**curl 산식 정확값** + **runtime 4 source 곱셈** + **droop 산식 정확값**으로
설명.

원칙 #55 (Geometry deformation 구분):
- (a) **curl** — transverse cup, V자 (leaflet 가장자리 위로)
- (b) **longitudinal droop** — cantilever tip-sag (leaflet 끝 아래로)
- (c) **foldDroopDeg** — leaflet attach pitch (maturity별)
- (d) **rachis curvature** — compound leaf 전체 (현재 **dead**)

각각 _다른 산식 + 다른 spec source_. 진단 시 분리 측정, 조정 시 서로
가리지 않도록 balance.

## §1. 산식 Location + `preset.curl` Mesh Path 확정 ★

### Curl 적용 3곳 (모두 [`LeafletPlaneChunk.ts`](../../src/scene/leaf/LeafletPlaneChunk.ts))

```text
LeafletPlaneChunk.ts:94 (transverseCup, Y축 가장자리 cup)
  curl × pow(absCol, 2) × max(0, 1 - ageFrac × 0.5) × size × 0.9
  → absCol=1(가장자리)에서 _제곱_ 곡선으로 급격히 올라감.
  → 사용자 캡처 "가운데 V자 fold" **주범**.

LeafletPlaneChunk.ts:131 (z-twist, apex 비틀림)
  curl × pow(t, 2) × sign(colNorm) × |colNorm| × size × 0.4
  → t=1(apex)에서 최대.
  → 사용자 "잎 말단 명확" 인상 **주범**.

LeafletPlaneChunk.ts:140 (cupSlope, normal modifier)
  curl × absCol
```

### Curl 값 출처 ([`LeafMeshBuilder.ts:564-567`](../../src/scene/leaf/LeafMeshBuilder.ts#L564-L567))

```ts
const curl = (
  ctx.leafOrganState.posture.curl                                    // ★ runtime
  + ctx.leafOrganState.senescence.curl * spec.shapeProfileRules.senescenceCurlWeight  // ★ runtime × spec
) * curlMultiplier;                                                  // ★ leafMacro
```

### ★ `preset.curl` Mesh Path 추적 결과 — **DEAD** (보완 #7)

```text
agePresets.old.curl (tomato.json, 0.4)
  → applyCorrelation (LeafMeshBuilder.ts:413 `curl: preset.curl`)
  → ResolvedLeafParams.curl (resolved.curl)
  → buildLeafShapeDescriptor (line 535)
  → desc.resolved.curl  ✗ — 이후 mesh path에서 _사용 안 됨_

LeafMeshBuilder.ts:564-567에서 `curl` 변수 산출 시 _resolved.curl 누락_:
  - posture.curl ← runtime LeafOrganState
  - senescence.curl × senescenceCurlWeight ← runtime × spec
  - curlMultiplier ← leafMacro
  → resolved.curl 무시!
```

**결론**: `agePresets.*.curl` field는 **mesh 산식 미연결 (dead)**. tomato.json
에서 `old.curl: 0.4 → 0.05` 변경해도 **mesh에 영향 0**. `rachisCurvatureBias`
와 동일 패턴 (L6-A-7 step 2/3 미완).

→ **S80 후보 a (`agePresets.old.curl: 0.4 → 0.05`) _효과 없음_, 제거**.
→ S80 후보 b (`senescenceCurlWeight: 0.5 → 0.1`)만 유효.

### Droop 시스템 4종 (관련 line)

```text
(a) longitudinalDroop — [LeafletPlaneChunk.ts:96-100]
    ageComponent     = (0.10 + ageFrac × 0.30) × pow(t, 2) × size
    gravityComponent = sin(gravityRad) × size × pow(t, 2)
    longitudinalDroop = ageComponent + gravityComponent
    y -= longitudinalDroop   ← _아래로_ (음의 Y)

(b) posture.gravityDroopDeg — [LeafMeshBuilder.ts:568]
    runtime field (LeafOrganState.posture, optional)
    → desc.gravityDroopDeg → buildLeafletPlaneChunk opts.gravityDroopDeg
    → LeafletPlaneChunk.ts:77 `gravityRad = deg × π / 180`

(c) foldDroopDeg — [LeafMeshBuilder.ts:582-583]
    foldDroopDegBase + foldDroopDegSlope × maturity (spec.poseRules)
    → desc.foldDroopDeg → applyLeafletPose pitch axis rotation

(d) rachisCurvatureBias — [LeafMeshBuilder.ts:222, 286]
    leafInstanceRules.rachisCurvatureBias = { baseline: 0, range: 0 } (현재 0)
    계산만 (line 286) → mesh path _미연결_ (**DEAD**, L6-A-7 step 2/3 미완)
```

## §2. 값 출처 요약표

| 시스템 | spec field | runtime field | live/dead | 영향 |
|---|---|---|---|---|
| curl (transverseCup + z-twist + cupSlope) | `shapeProfileRules.senescenceCurlWeight` (0.5) | `posture.curl`, `senescence.curl` | **live** | V자 cup (Y축 가장자리), apex 비틀림 |
| curl multiplier | `leafInstanceRules.curlMultiplier` (1.0±0.15) | — | live | curl_final 곱셈 |
| **`agePresets.*.curl`** | tomato.json (old: 0.4) | — | **DEAD** | _영향 0_ — mesh path 미연결 |
| longitudinalDroop ageComponent | _상수 (0.10 + 0.30)_ | — | live | tip cantilever sag (maturity 기반) |
| longitudinalDroop gravityComponent | — | `posture.gravityDroopDeg` (optional) | live | tip gravity sag (deg 기반) |
| foldDroopDeg | `poseRules.foldDroopDegBase/Slope` (-5/15) | — | live | leaflet attach pitch |
| **rachisCurvatureBias** | `leafInstanceRules.rachisCurvatureBias` (0/0) | — | **DEAD** | _영향 0_ — mesh path 미연결 |

★ **Dead field 2종 확정**: `agePresets.*.curl` + `rachisCurvatureBias`.

## §3. Runtime 실측 (S78a logger 결과)

`?debug=leaf` opt-in으로 [`LeafMeshBuilder.ts buildLeafletPatch`](../../src/scene/leaf/LeafMeshBuilder.ts)
가 leaflet마다 dump. **실측 입력 대기** — 현재는 **추정값**으로 §4 채움.
실측 후 본 § 보강.

추정 시나리오 (packages/tomato-engine LeafOrganState 산출 기반):

| Stage | posture.curl | senescence.curl | senescence.progress | gravityDroopDeg | curlMultiplier |
|---|---|---|---|---|---|
| Young (expansionProgress<0.5, yellowing 0) | 0.00 | 0.00 | 0 | 0 | 1.0 |
| Mature 새 잎 (yellowing 0) | 0.05 | 0.00 | 0 | 5 | 1.0 |
| Mature 약간 노화 (yellowing 0.2) | 0.10 | 0.20 | 0.2 | 10 | 1.0 |
| Old (yellowing 0.5) | 0.20 | 0.30 | 0.5 | 15 | 1.0 |
| Old senescent (yellowing 0.7) | 0.30 | 0.40 | 0.7 | 25 | 1.0 |

## §4. 정량 표 — 3 size × 3 maturity (★ 산식 정확값 + size scale)

### 산식 (line 명시)

```text
curl_final = (posture.curl + senescence.curl × 0.5) × curlMultiplier      [LeafMeshBuilder.ts:564-567]

edgeCupY (가장자리, absCol=1) [LeafletPlaneChunk.ts:94]:
  = curl_final × 1² × max(0, 1 - ageFrac × 0.5) × size × 0.9 × 1000 mm

tipDroopY (apex, t=1) [LeafletPlaneChunk.ts:96-98]:
  = ((0.10 + ageFrac × 0.30) × size + sin(gravityDroopDeg × π/180) × size) × 1000 mm
```

### 5cm leaflet (intercalary)

| Maturity | curl_final | edgeCupY (mm) | tipDroopY (mm) | 목표 edge (scaled) | 목표 tip (scaled) |
|---|---|---|---|---|---|
| Young | 0.00 | 0.0 | 9.4 (age) | 0 | 0~1.7 |
| Mature 새 잎 | 0.05 | 2.2 | 9.4 (age) + 4.4 (grav) = 13.7 | ≤ 1 | 3.3~6.7 |
| Mature 약간 | 0.20 | 8.1 | 8.0 + 8.7 = 16.7 | 0.3~1 | 3.3~6.7 |
| Old | 0.35 | 11.4 | 12.3 + 12.9 = 25.2 | _curl_ 1.7~2.7 | _droop_ 6.7~13.3 |
| Old senescent | 0.50 | 14.6 | 15.5 + 21.1 = 36.6 | _curl_ 1.7~2.7 | _droop_ 6.7~13.3 |

### 15cm leaflet (primary)

| Maturity | curl_final | edgeCupY (mm) | tipDroopY (mm) | 목표 edge | 목표 tip |
|---|---|---|---|---|---|
| Young | 0.00 | 0.0 | 28.1 | 0 | 0~5 |
| Mature 새 잎 | 0.05 | 6.5 | 28.1 + 13.1 = 41.2 | ≤ 3 | 10~20 |
| Mature 약간 | 0.20 | 24.3 | 24.0 + 26.0 = 50.0 | 1~3 | 10~20 |
| Old | 0.35 | 34.1 | 36.8 + 38.8 = 75.7 | 5~8 | 20~40 |
| Old senescent | 0.50 | 43.7 | 46.5 + 63.4 = 109.9 | 5~8 | 20~40 |

### 25cm leaflet (terminal)

| Maturity | curl_final | edgeCupY (mm) | tipDroopY (mm) | 목표 edge | 목표 tip |
|---|---|---|---|---|---|
| Young | 0.00 | 0.0 | 46.8 | 0 | 0~8.3 |
| Mature 새 잎 | 0.05 | 10.8 | 46.8 + 21.8 = 68.6 | ≤ 5 | 16.7~33.3 |
| Mature 약간 | 0.20 | 40.5 | 40.0 + 43.4 = 83.4 | 1.7~5 | 16.7~33.3 |
| Old | 0.35 | 56.9 | 61.3 + 64.7 = 126.0 | 8.3~13.3 | 33.3~66.7 |
| Old senescent | 0.50 | 72.8 | 77.5 + 105.7 = 183.2 | 8.3~13.3 | 33.3~66.7 |

### 진단 요약

- **edgeCupY 모든 size에서 _목표의 5-15× 초과_**. curl이 dominant 시각 문제.
- **tipDroopY도 _목표의 2-3× 초과_** — droop _이미 강함_. curl이 가려서
  사용자 인상에서는 _droop이 부족_하게 보였을 가능성. _실제로는 droop 충분
  또는 과함_.
- **Mature 새 잎의 _tip droop 28mm_ (15cm)** — gravityDroopDeg=5°만으로도
  age component (0.10 × 0.15 = 15mm) + gravity (13mm) 합산 28mm. 자연 잎
  young은 _거의 평평_이어야 하는데, age component 산식의 _상수 0.10_이 _young
  에서도 droop 산출_ — 검토 필요.

## §5. 권고 조정안 (정량 기반)

### S80 (이 plan, spec-side curl 완화)

★ 후보 a 제거 (dead path 확정).

```jsonc
// tomato.json shapeProfileRules
"senescenceCurlWeight": 0.5 → 0.1   // senescence 기여 80% 감소
```

예상 정량 (Old senescent, 15cm):
- 변경 전: curl_final = (0.3 + 0.4×0.5)×1.0 = 0.5 → edgeCupY 43.7mm
- 변경 후: curl_final = (0.3 + 0.4×0.1)×1.0 = 0.34 → edgeCupY 29.7mm
- **여전히 목표 5-8mm의 3-5× 초과** — runtime `posture.curl` dominant.
- L9-B 진입 필요 시각 평가에서 catch.

### L9-B (curl geometry fix only, 별 plan)

후보 d: `transverseCup` 산식 자체 변경:
```ts
// 현재: curl × pow(absCol, 2) × max(0, 1-ageFrac×0.5) × size × 0.9
// 후보:  curl × pow(absCol, 3) × max(0, 1-ageFrac×0.5) × size × 0.3
```
효과:
- `pow(absCol, 3)`로 가장자리 _만_ 강조 (중심부 더 평평)
- `× 0.3` 계수 → 전체 3× 약화

15cm Old senescent (curl_final 0.34) 재계산:
- 산식 변경 후: 0.34 × 1³ × 0.65 × 0.15 × 0.3 = **9.95mm**
- 목표 5-8mm 근접 ✓

후보 c (별 plan): packages/tomato-engine `posture.curl` 약화 (runtime path).

### L9-C (droop 강화 — 단, _이미 강하므로 balance_)

`rachisCurvatureBias` mesh path 연결 (현재 dead) — 단 baseline 0/range 0이
므로 _효과는 활성 후 값 조정_과 함께. 우선순위 _낮음_ (droop이 이미 강함).

오히려 _droop 약화_가 필요할 수도:
- age component 상수 `0.10` → `0.05`?
- young 잎이 _완전 평평_해야 자연.

## §6. Active 원칙 #55 적용 결과

> "잎이 평평" ≠ "잎이 자연". _droop은 보존/강화, curl은 약화_가 자연 목표.

이번 audit으로 _수정_: **droop도 _이미 강함_**. curl 약화 후 droop이 _드러나면_
적정 또는 _과함_으로 보일 수 있음. S80 시각 checkpoint에서 Q4/Q5 답 따라 _droop
조정 여부_ 결정. 무작정 droop 강화 X.

## §7. S80 Applied (적용 결과)

`tomato.json` `shapeProfileRules.senescenceCurlWeight: 0.5 → 0.1` 적용.

`agePresets.*.curl`은 **dead 확정** → 변경 안 함 (mesh 영향 0 — L8-5와
동일 패턴 — 향후 별 phase에서 deprecated JSDoc 추가 후보).

예상 정량 (15cm primary 기준 재계산):

| Maturity | 변경 전 curl_final | 변경 후 curl_final | 변경 후 edgeCupY (mm) | 변경 전 → 후 |
|---|---|---|---|---|
| Young | 0 | 0 | 0 | 적정 ✓ |
| Mature 새 잎 (posture=0.05, sen=0) | 0.05 | 0.05 | 6.5 | _변화 없음_ (senescence=0이라 weight 영향 0) |
| Mature 약간 (posture=0.10, sen=0.20) | 0.20 | (0.10 + 0.20×0.1)×1.0 = **0.12** | 14.6 | 24.3 → 14.6 (40% 감소) |
| Old (posture=0.20, sen=0.30) | 0.35 | (0.20 + 0.30×0.1)×1.0 = **0.23** | 22.4 | 34.1 → 22.4 (34% 감소) |
| Old senescent (posture=0.30, sen=0.40) | 0.50 | (0.30 + 0.40×0.1)×1.0 = **0.34** | 29.7 | 43.7 → 29.7 (32% 감소) |

**잔존 gap (시각 평가 입력 대기)**:
- runtime `posture.curl`이 dominant — senescenceCurlWeight 조정만으로
  young/mature 새 잎 영향 0 (senescence=0). 사용자 캡처가 _young 잎_의
  fold도 보였다면 _L9-B 필요_.
- mature/old는 30-40% 감소 — 시각적으로 _가시적 차이_ 있을 듯. 그러나
  목표 5-8mm까지는 _3-5× 거리 잔존_.

**Decision flow** (사용자 시각 checkpoint Q1~Q5 답에 따라):

| Outcome | 다음 |
|---|---|
| Q1/Q3 yes + Q2 no + Q4/Q5 yes | _L9-A 완료_, visual gap은 outline/surface 영역 (L9-D/E) |
| Q1 yes + Q2 yes | _L9-B 진입_ — `transverseCup pow(absCol,2)×0.9 → pow(absCol,3)×0.3` 또는 runtime curl path 약화 |
| Q4 yes (droop _과함_) | _L9-C 진입_ — age component 상수 `0.10` → `0.05` 약화 |
| Q5 no (droop _부족_) | 우선 _L9-B로 curl 더 약화_ → curl 가린 droop 드러나는지 재확인 |

## Related

- Plan: `/Users/adminvia/.claude/plans/smooth-prancing-starfish.md` (L9-A v3)
- S78a 로그 추가: 327baf9
- S78b audit doc: c3161f6
- S78c 로그 제거: 4910b1f
- S79 LeafletPlaneChunk inline: a60e79b
- S80 senescenceCurlWeight 0.5 → 0.1: (이 commit)
