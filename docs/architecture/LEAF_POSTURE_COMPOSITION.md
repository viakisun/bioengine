# Leaf Posture Composition — 9-field decomposition

> Iter 30 Phase 5 산출물.
> Plan SSOT: [`/Users/adminvia/.claude/plans/sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md) §7

---

## ★ Iter 31 R26 Update (commit 4029b6b)

R26 이후 **leaf anchor rotation은 posture 필드와 무관**. populator (`fillLeafAnchor`)는
`edge.bonePath[last]` tangent (PlantBase petioleCurve의 마지막 segment)를
`makeLeafQuaternion`에 전달 — 산수 추가 0. 자세한 R26 contract은
[`STEM_LOCAL_FRAME.md`](./STEM_LOCAL_FRAME.md) 참조.

posture 필드의 _R26 이후 역할_:
- **`azimuthDeg`**, **`petioleElevationDeg`**, **`droopDeg`**, **`twistDeg`** —
  ★ @deprecated (LeafGrowthModel.ts JSDoc). leaf rotation에 미사용.
  `docs/iter32-candidates.md` `POSTURE-FIELD-CLEANUP-01`에서 제거 검토.
- **`curl`** — ★ 보존. `leafChunk.ts`의 mesh deformation (transverseCup +
  z-twist)이 사용. R26 이후에도 _mesh 변형_은 anchor rotation과 별개 layer.
- **`gravity/senescence/waterStressDroopDeg`** 등 9-필드는 _droop이 petioleCurve에
  반영되는 _PlantBase 내부 산식 입력_으로_ 살아있음. populator에서 _직접_ 안 읽음.

PlantBase가 9-필드로 droop을 계산 → petioleCurve control points에 반영 → catmullRomPath
bone 생성 → populator가 마지막 bone tangent 추출. _composition은 PlantBase 내부_, populator는
_curve 출력만_.

---

## 동기 (R5)

**Before (Iter 29까지)**:
```ts
posture.droopDeg = droopExtra
  = weightDroop + ageDroop + waterStressDroop + senescenceDroop  // 합산 스칼라
```

자연 토마토 잎의 두 _독립_ 메커니즘이 한 필드로 합쳐져 있었음:
1. **상부광 향함** — leaf blade plane이 ground-parallel (수평) 으로 _배향_
2. **무게/노화로 처짐** — gravity / senescence / waterStress가 _누적_

이 둘을 분리하지 않으면:
- "왜 잎이 위 보고 있는지" 산식 trace 불가
- droop을 줄여도 blade plane이 회전 안 됨 (혹은 그 반대)
- calibration band가 _혼합 결과_ 만 검증 → 어느 한 쪽 회귀가 다른 쪽에서 가려짐

## 9-field schema

```ts
// LeafGrowthModel.ts (extended)
interface LeafPostureState {
  azimuthDeg: number;                          // (1) phyllotaxy 회전
  lightSeekingBladePlaneTiltDeg: number;       // (2) 상부광 = 0° (수평)
  lightSeekingNormal: { x; y; z };             // (3) 상부광이면 (0, 1, 0)
  petioleBaseElevationDeg: number;             // (4) primordium 35° → mature 12°
  gravityDroopDeg: number;                     // (5) f(area, rachisLen, age)
  senescenceDroopDeg: number;                  // (6) f(senescence.progress)
  waterStressDroopDeg: number;                 // (7) f(waterStress)
  finalBladePlaneTiltDeg: number;              // (8) lightSeek + finalDroop
  finalDroopDeg: number;                       // (9) gravity + senescence + water
  twistDeg: number;                            // (legacy 보존)
  curl: number;                                // (legacy 보존)

  // legacy alias
  droopDeg?: number;                           // = finalDroopDeg
}
```

## 항등식 (composition law)

```
finalDroopDeg = gravityDroopDeg + senescenceDroopDeg + waterStressDroopDeg
finalBladePlaneTiltDeg = lightSeekingBladePlaneTiltDeg + finalDroopDeg
```

**부호 일관성** (Plan review 7번):
- droop은 _양수_ 로 누적 (blade가 아래로 처짐 = +)
- lightSeekingBladePlaneTiltDeg = 0° (상부광) 가정 시:
  finalBladePlaneTiltDeg = 0 + finalDroopDeg = finalDroopDeg
- droop이 증가하면 finalBladePlaneTiltDeg가 _증가_ (반대 부호 X)

## 산식 (LeafPostureModel.ts)

### computeGravityDroopDeg

```ts
computeGravityDroopDeg({
  currentAreaCm2,
  rachisLengthM,
  referenceAreaCm2 = 700,
  referenceRachisLengthM = 0.30,
  ageFactor = 1.0,            // (1 + ageTT / 1000), clamp [1.0, 1.5]
  droopSensitivity = 1.0,     // cultivar
}) → clamp(0, 45,
  sqrt(currentArea / refArea)
    × (rachisLen / refRachisLen)^0.8
    × ageFactor
    × droopSensitivity
    × 20
)
```

- 면적 → linear dim 변환 시 `sqrt` (Plan §9.5.3 GEOMETRY-AREA-TO-LENGTH-SQRT-01)
- rachis 길이 power 0.8 — 길수록 leverage ↑ 하지만 sublinear (실측 fit)
- ageFactor — 같은 area라도 ageTT ↑ → droop ↑
- 최대 45° clamp — 더 처지면 비현실적 (잎이 떨어짐)

### computePetioleBaseElevationDeg

```ts
computePetioleBaseElevationDeg({ expansionProgress })
  → lerp(35°, 12°, expansionProgress)
```

primordium은 35° (위로 비스듬), 성숙 12° (거의 수평). _petiole 축의 elevation_ —
blade plane tilt와 별개.

### computeWaterStressDroopDeg

```ts
computeWaterStressDroopDeg(waterStress)  // 0~1
  → waterStress × 30°
```

심각 수분 부족 시 추가 30°.

### composePosture

```ts
composePosture({
  azimuthDeg, twistDeg,
  lightSeekingBladePlaneTiltDeg,   // 보통 0
  petioleBaseElevationDeg,
  gravityDroopDeg,
  senescenceDroopDeg,
  waterStressDroopDeg,
  curl,
}) → LeafPostureState (9 + legacy alias)
```

- 두 항등식 _자동 적용_
- `lightSeekingNormal` 은 lightSeekingTilt 기반 회전 vector (현재 (0,1,0) 단순화)
- `droopDeg` (legacy) = `finalDroopDeg`

### assertPostureCompositionValid (dev)

두 항등식 1e-6 tolerance 검증. 위반 시 throw — `composePosture`의 결과만 통과.

## 사용 (GrowthModel.ts Phase 5)

```ts
// main-axis Pass 3 후 leaf 마다:
const petioleBase = computePetioleBaseElevationDeg({ expansionProgress: leafExpansion });
const gravity = computeGravityDroopDeg({
  currentAreaCm2, rachisLengthM,
  referenceAreaCm2: cultivar.maxLeafAreaCm2,
  referenceRachisLengthM: cultivar.referenceRachisLengthM,
  ageFactor: clamp(1 + ageTT/1000, 1.0, 1.5),
  droopSensitivity: cultivar.droopSensitivity,
});
const senDroop = senescence.progress * 25;       // 0 → 25° at full senescence
const waterDroop = computeWaterStressDroopDeg(waterStress);

leaf.posture = composePosture({
  azimuthDeg: nodeAzimuthDeg,
  twistDeg: 0,
  lightSeekingBladePlaneTiltDeg: 0,              // 상부광
  petioleBaseElevationDeg: petioleBase,
  gravityDroopDeg: gravity,
  senescenceDroopDeg: senDroop,
  waterStressDroopDeg: waterDroop,
  curl: senescence.curl,
});

// Legacy field — populator는 droopExtra 계속 read 가능
node.droopExtra = leaf.posture.finalDroopDeg;
```

## Calibration band (Phase 6)

`tomato-growth-targets.jsonc` `posture` 섹션:
```jsonc
"posture": {
  "finalBladePlaneTiltDeg": {
    ageTT: [
      {tt: 0,    min: 0, max: 5},
      {tt: 400,  min: 0, max: 15},
      {tt: 800,  min: 0, max: 30},
      {tt: 1200, min: 5, max: 45},
    ]
  },
  "finalDroopDeg": {
    ageTT: [
      {tt: 0,    min: 0,  max: 5},
      {tt: 400,  min: 5,  max: 25},
      {tt: 800,  min: 10, max: 35},
      {tt: 1200, min: 20, max: 50},
    ]
  }
}
```

## Skeleton 적용

`composeLeafRotationLocal` (AnchorTransform.ts) — stem-local frame + posture 합성:
```ts
composeLeafRotationLocal(stemFrame, azimuthDeg, finalBladePlaneTiltDeg, twistDeg)
```

상세는 [`STEM_LOCAL_FRAME.md`](./STEM_LOCAL_FRAME.md).

## Phase 7+ 확장 candidate

- `lightSeekingBladePlaneTiltDeg ≠ 0` — 하부광 / 측광 시나리오
- `lightSeekingNormal` — Phototropism response (실제 light vector 계산)
- `nyctinasty` (밤 처짐) — 일주기 droop oscillation
- `apicalDominanceCurl` — 측지 정단의 강한 curl
