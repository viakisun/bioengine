# Stem-local frame Leaf Rotation (composeLeafRotationLocal)

> Iter 30 Phase 0.D 산출물 (R4 fix).
> Plan SSOT: [`/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md) §1.D

---

## 문제 (R4)

Iter 29 까지 `composeLeafRotation` (AnchorTransform.ts):

```ts
qY(azimuth) ⊗ qX(-droop) ⊗ qZ(twist)   // 모두 _world_ 축
```

- `qY` = world Y axis 회전 (azimuth)
- `qX` = world X axis 회전 (droop)

**증상**: stem이 휘어도 (예: 측지 또는 wind sway), 모든 leaf가 _world Y_ 기준으로
azimuth 회전됨 → stem orientation 무시. 사용자 사진 #2 evidence: D=30에서 위/아래
잎이 동일 평면에 누적, 회전 직각으로 시야 차단.

**SkeletonNode.frame**은 Iter 26 PR 1-1에서 populate되어 있었지만 _leaf rotation에
사용 안 됨_ — 정의만 있고 wire-in 누락 (Iter 28에서 dock_l_leafstart 측정에만 사용).

## 해법 — Stem-local frame 회전

```ts
composeLeafRotationLocal(
  stemFrame: { tangent, normal },
  azimuthDeg, droopDeg, twistDeg,
) → Quat4
```

3축 분해:

```
1. Azimuth: 회전축 = stemFrame.tangent (stem-up direction)
   → stem이 휘면 tangent 따라 azimuth 회전축도 변함

2. Droop: 회전축 = cross(tangent, normal) = binormal
   → blade plane이 stem-perpendicular plane 안에서 처짐

3. Twist: 회전축 = stemFrame.normal (petiole axis approximation)
   → petiole roll
```

순서: `qAzimuth ⊗ qDroop ⊗ qTwist` (twist innermost).

## frame 보장 (선결 조건)

`SkeletonNode.frame`은 Iter 26 PR 1-1에서 모든 main-axis node에 populate됨.
측지 node도 Phase 0.B `findNodeState` 수정 후 동일하게 populate.

frame이 _없는_ node에서는 `composeLeafRotation` (world axis) fallback 사용 —
backward compat. `populateAnchorMorphology.ts`:

```ts
if (meshNode.frame) {
  anchor.rotation = composeLeafRotationLocal(
    meshNode.frame, posture.azimuthDeg, posture.finalBladePlaneTiltDeg, posture.twistDeg,
  );
} else {
  // Legacy fallback
  anchor.rotation = composeLeafRotation(
    posture.azimuthDeg, posture.finalBladePlaneTiltDeg, posture.twistDeg,
  );
}
```

## 통합 with Phase 5 posture

`posture.finalBladePlaneTiltDeg` (Phase 5 9-필드의 최종 droop)을 droopDeg 인자로
전달 — gravity + senescence + waterStress 모두 누적된 한 값. lightSeeking은 보통 0°.

## Invariants

- **LEAF-LOCAL-FRAME-01**: `composeLeafRotationLocal` 시그니처 첫 인자가 `StemLocalFrame`
- **LEAF-WORLD-LOCK-01**: 동일 azimuth, 다른 stemFrame.tangent → 다른 Quat4 (world Y lock X)
- **LEAF-PHYLLOTAXY-LOCAL-01**: 연속 node azimuth divergence가 `GOLDEN_ANGLE_DEG` (137.5°) ± tolerance
- **LEAF-PHYLLOTAXY-WORLD-01**: D=30 mainAxis 연속 5개 leaf world-space azimuth (atan2 of major axis projection) 표준편차 > 30°
- **LEAF-OVERLAP-PATTERN-01**: D=45 5개 leaf bbox center가 동일 plane에 lock 안 됨

## Why now (Iter 30 vs 더 빨리)

- `SkeletonNode.frame` (Iter 26 PR 1-1) 정의 후 _2년_ 동안 leaf rotation에 wire-in
  안 됐던 이유: 시각 회귀가 측지/wind sway 시나리오에서만 발현되는데, Iter 18~28
  은 main-axis 직립 stem에 집중 (단일 평면 phyllotaxy가 우연히 합리적).
- Iter 30의 측지 phytomer binding (Phase 0.B) 활성화로 측지에 진짜 leaf가 생기면서
  R4가 _가시화_. Phase 0.B + 0.D는 _쌍_.

## 향후 (Phase 7+)

- **Wind sway interaction**: skinTreeSwayAnimation이 stem position을 흔들 때 leaf도
  따라 흔들리도록 — 현재 stemFrame은 _static_, sway 시 frame 재계산 필요
- **Apical curl**: 측지 정단 (apex)에서 강한 leaf curl (현재 단순 azimuth + droop)
- **Phototropism**: lightSeekingBladePlaneTiltDeg 가 일조 vector 따라 동적 변화
