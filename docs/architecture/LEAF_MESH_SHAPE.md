# Leaf Mesh Shape — Phase L0 (Iter 39)

> **Status L0-D-1 (current)**: per-leaflet pose envelope 약화. mature 30° tilt
> → 10° tilt (sub-pose). 사용자 close-up "안쪽 cup" 인상 해소.
>
> **Out of scope**: K0~K3 (connector tube, mesh anchor) — [LEAF_TUBE_RENDERING.md](LEAF_TUBE_RENDERING.md).

## ★ L0 — 잎이 안쪽으로 말려 보이는 문제

K3 (mesh anchor 3D) 완료 후 사용자 close-up:

> "잎이 안쪽으로 말려 있어. 끝쪽으로 갈수록 중력에 의해 쳐지는게 자연스러울꺼야."

### 진단 — 가설 변천

| 단계 | 가설 | 결과 |
|---|---|---|
| L0 v1 Track A | `transverseCup` 산식이 droop보다 dominant — cup 약화 + droop 강화 | **반박** — baseline 측정: cupMax avg -1.57mm (음수), droopMax avg 21mm (이미 충분) |
| L0 v2 Mesh 구조 | per-leaflet vs compound leaf 구조 재검토 | per-leaflet OK (118 mesh = 118 leaflet) |
| L0 v3 **Pose Layer** | `mesh.rotationQuaternion` 합성이 root cause | **확정** ✓ |

### Root cause — `foldDroopDeg` per-leaflet pitch

[buildLeafletMeshes.ts:133-134](../../src/scene/leaf-engine/buildLeafletMeshes.ts#L133):
```ts
// L0 이전: foldDroopDeg = -10 + 40 × maturity   → mature +30°
// L0-D-1:  foldDroopDeg = -5 + 15 × maturity    → mature +10°
```

산식 효과 (mature leaflet):
```text
pitchRad = foldDroopDeg × π/180 × opennessFactor (1.0 mature)
         = 30° × 1.0 = 30°  (이전)
         = 10° × 1.0 = 10°  (L0-D-1)

mesh.rotationQuaternion = baseQ × localQ
  baseQ: bladeDir → mesh +X, WORLD_UP → mesh +Y
  localQ: RotationYawPitchRoll(twist, pitch, roll)   ← pitch around mesh-local X

→ pitch around bladeDir = leaflet plane이 width 방향으로 _기울어짐_
→ 모든 leaflet이 _같은 방향_ tilt (probe widthVerticalTilt 분포 109/118 negative)
→ 전체 잎이 _감싸는 cup_ 인상 (사용자 close-up)
```

### 측정 (probe `_archive/probes/_probe-l0-leaflet-pose.mjs`)

```text
                      | before (mature 30°) | after L0-D-1 (mature 10°)
─────────────────────|─────────────────────|──────────────────────────
normalDotUp p50      | 0.854 (= 31° tilt)  | 0.951 (= 18° tilt)  ✓
normalDotUp mean     | 0.865 (= 30°)       | 0.936 (= 21°)       ✓
normalDotUp min      | 0.669 (= 48°)       | 0.790 (= 38°)       개선
widthVerticalTilt p50| -0.396 (23° down)   | -0.103 (5.9° down)  ✓
widthVerticalTilt 분포| 109 neg / 9 nearZero| (distribution 평탄화)
```

mature leaflet 평균 기울기 30° → 18° (사용자 명시 목표 10~18° 달성).

## ★ Why Track A 폐기 (mesh-local vertex 산식)

원래 L0 plan v1은 [leafletPlaneChunk.ts](../../packages/tomato-geometry/src/leafletPlaneChunk.ts)의
`transverseCup` / `ageComponent` 산식 보정 — Cup 약화 + Droop 강화. 그러나:

1. **Baseline 측정이 가설 반박** — cupMax는 _negative_ (가장자리가 아래로),
   droopMax는 _이미 21mm avg, 85mm max_ (강함). vertex deformation _cup_은
   사용자 본 현상이 _아님_.
2. **Track A 적용 시 위험** — droop 이미 강한데 더 강화 → 잎 _과처짐_,
   형태 더 무너짐.
3. **사용자 의심 정확** — root cause = mesh 자체가 아닌 _per-leaflet rotation_.

**판단 원칙**: vertex 산식 변경 전에 _측정값으로 가설 검증_. measurement-first.

## ★ LEAF-LEAFLET-PITCH-01 (회귀 보호)

[tests/architecture/leaf-leaflet-pitch.spec.ts](../../tests/architecture/leaf-leaflet-pitch.spec.ts):

```text
∀ leaflet mesh in scene:
  planeNormalDotUp = mesh.rotationQuaternion · (0,1,0)

분포 검증:
  p50  ≥ 0.93   (= cos(22°); foldDroopDeg 30° 회귀 시 0.854 → fail)
  p90  ≥ 0.85   (= cos(31°); outliers 차단)
  mean ≥ 0.90
```

미래 누군가 `foldDroopDeg` 산식을 _과도 증가_시키면 즉시 catch.

## ★ Track A/B/C/D 정리

| Track | 영역 | 상태 | 비고 |
|---|---|---|---|
| **A — Vertex cup/droop** | `leafletPlaneChunk.ts` 산식 | **폐기** | baseline 반박 |
| **B — Variation** | `buildLeafletMeshes.ts` jitter, `correlationRules.ts` | **대기** | L0-D-1 후 시각 부족 시 |
| **C — Mesh quality** | amplitude range scale | **대기** | 후순위 |
| **D-1 — Per-leaflet pitch** | `foldDroopDeg = -10 + 40×m → -5 + 15×m` | **적용** ✓ | LEAF-LEAFLET-PITCH-01 |
| D-2 — opennessFactor | mature scaling | **대기** | D-1 부족 시만, 변수 분리 |

## ★ Active 원칙 (L0 신규 #37)

기존 1-36 +

37. **Per-leaflet pose는 micro variation만, macro pose는 leaf-level rachis로**
    — 각 leaflet의 `foldDroopDeg`는 micro tilt (±5°~+10°) 영역. 30°+ 같은
    macro pose는 _모든 leaflet에 일률 적용_ 시 잎 전체 cup/감싸기 인상.
    macro pose는 leaf-level rachis curvature (`leafInstanceProfile.rachisCurvature`)
    에 두고, leaflet은 subtle variation만. measurement principle: vertex
    산식 변경 전 _측정값으로 가설 검증_ — cup/droop probe → foldDroopDeg 진단.

## ★ History

### L0-D-1 (current)
- `foldDroopDeg = -5 + 15 × maturity` (was `-10 + 40 × maturity`)
- Track A 폐기, opennessFactor 변경 _없음_ (변수 분리)
- LEAF-LEAFLET-PITCH-01 신규 spec (회귀 보호)

### L0-D-2 (대기, 조건부)
- D-1 후 사용자 시각상 _여전히_ 기울기 인상이면.
- `opennessFactor` mature scaling 약화 (0.2→1.0 → 0.2→0.6).
- 변수 분리 위해 D-1 결과 commit 후 별도.

### Track A (폐기, 잠재 future)
- vertex cup/droop 산식 변경.
- 사용자 의도가 _더 droop 강화_라면 future option. 현재 droop은 충분 (21mm avg).
