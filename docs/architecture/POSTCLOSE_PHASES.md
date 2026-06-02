# Post-Skeleton-Close Phases — 후속 작업 티켓 (Iter 39 J0 종료 후)

> **Status**: J0 Skeleton Close 완료 ([SKELETON_CLOSE.md](SKELETON_CLOSE.md)).
> 이 문서는 3가지 후속 phase 티켓.

## ★ 우선순위 정리

```
POSTCLOSE-1 (HIGH):  engine sizeFactor inflation 수정
POSTCLOSE-2 (mid):   J1 visual scale + roll/twist mesh pose
POSTCLOSE-3 (low):   secondary leaflet 복원
```

J0 종료 후 _POSTCLOSE-1 first_. inflation이 절대 scale에 직접 영향.

---

## POSTCLOSE-1 — Engine sizeFactor Inflation 수정 (HIGH)

**Status**: J0-8B audit FAIL 62.5%. **Skeleton grammar OK 여도 절대 scale
inflated → 시각적 위화감 잔존**.

### 현황 (J0-8B audit, day 45, 8 visible leaves)
```
rachisLenM:
  min  0.062m  (6.2cm — 정상 young apex)
  p50  0.763m  (76cm — INFLATED 2.5×)
  p95  1.257m  (1.26m — INFLATED 4×)
  max  1.257m
  avg  0.652m

inflated (> 0.40m): 5/8 = 62.5%

Botanical mature 토마토 rachis: 25-30cm
```

### 원인 추정
`src/plant/skeleton/buildTomatoSkeletonGraph.ts:computeLeafBladeRef`:
```ts
const refRachis  = cultivar?.growthProfile?.referenceRachisLengthM  ?? 0.30;
const sfClamped = Math.max(0.05, sf);
const rachisLengthM  = refRachis  * sfClamped * nodePositionScale;
```

- `refRachis 0.30m` × `sfClamped 3.6` (petiole-droop audit에서 관찰) = `1.08m`
- engine sizeFactor가 1을 초과 _수 배_ → rachisLen inflated

### 권장 해결

**옵션 A — skeleton-side clamp** (간단, 안전):
```ts
const sfClamped = Math.max(0.05, Math.min(1.5, sf));  // upper bound 1.5
```
- 빠른 픽스
- engine sizeFactor 산식 _변경 X_
- mature 토마토 botanical 비율 (sf 0.6-1.0) 보존

**옵션 B — engine-side 산식 검토** (근본):
- `packages/tomato-engine/` 내 sizeFactor 산출 로직 audit
- mature 잎 sizeFactor = 1.0 normalize 산식 확인
- inflated가 _bug인지 design인지_ 결정

권장: A를 _즉시_ 적용 + B를 후속 분석.

### Spec
신규 `tests/architecture/sizefactor-bound.spec.ts`:
- visible leaves의 sf ≤ 1.5
- inflated 비율 ≤ 10% (이전 62.5% → 목표 < 10%)

### Verification
- audit 재실행 (`node _probe-j0-rachis-len.mjs`)
- expected: inflation 비율 _대폭_ 감소
- 모든 J0 21 invariants 회귀 PASS

---

## POSTCLOSE-2 — J1 Visual Scale + Roll/Twist Mesh Pose (mid)

**Status**: J0 out of scope. mesh quaternion에서 leaf plane orientation + 작은
roll/twist random.

### 현재 상태
- `roll/twist offset` skeleton node.pos에서 _제거_ (J0-2C). LEAFLET-DETERMINISM-01.
- mesh `makeLeafQuaternion`이 leaflet `bladeDir` 직접 사용
- visual variation 부재 → 모든 leaflet 평면 평행

### 작업 (예상)
1. `LeafChunk` mesh 생성에서 ±5° random rotation
   (seed: leaflet id, deterministic per build)
2. roll (X 축) + twist (Y 축) 분리 적용
3. leaf-level _공통_ orientation은 `leafBladeRef.droopDeg` 적용

### Spec
- `tests/architecture/leaf-mesh-pose.spec.ts`:
  - 같은 leafletId → 같은 quaternion (deterministic)
  - mesh +X 축 · bladeDir ≥ 0.95 (이미 ANCHOR-06 보장)
  - roll variance > 0 (deterministic noise 존재)

### Verification
J0-9 Mode A에서 leaflet plane들이 _완전 평면 평행 X_ 확인. metric 기반 결정.

---

## POSTCLOSE-3 — Secondary Leaflet 복원 (low)

**Status**: I3에서 `ENABLE_SECONDARY_LEAFLETS = false`. J0-9 closure 후
acceptance 확인 → conditional 활성.

### 권장 활성 조건
```ts
const enableSecondary =
  bladeRef.agePreset === 'complex' && maturity > 0.75;
```

complex 잎 + 거의 mature한 경우만. young/mature 일반 잎은 _계속 disabled_.

### 신규 invariant `SECONDARY-ATTACH-01`
이미 docs 명세 ([LEAFLET_LAYOUT.md](LEAFLET_LAYOUT.md)):
```text
secondary.attachNodeId == parentPrimary.lid
secondary edge.startNodeId == parentPrimary.lid
secondary edge.parentEdgeId == parentPrimary.edgeId
```

### Verification
- secondary 활성 시 21 invariants + SECONDARY-ATTACH-01 모두 PASS
- HIERARCHY-VISIBLE에 secondary 포함 (secondary < primary × 0.7)

---

## 참고

- [SKELETON_CLOSE.md](SKELETON_CLOSE.md) — J0 baseline + 21 invariants
- [SKELETON_SSOT.md](SKELETON_SSOT.md) — active 원칙 1-32
- [LEAFLET_LAYOUT.md](LEAFLET_LAYOUT.md) — layout/rhythm/closure model
