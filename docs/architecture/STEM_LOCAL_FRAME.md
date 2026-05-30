# Leaf Rotation Contract — petioleCurve tangent (★ R26 final)

> Iter 31 R26 (commit 4029b6b) 산출물. Plan SSOT: [`sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md)
>
> ★ 이 문서는 _Iter 30 Phase 0.D `composeLeafRotationLocal` contract_을 _완전 대체_.
> Iter 30 historic record는 `tests/architecture/_archive/iter30-local-frame.spec.ts.deprecated`에 보존.

---

## Contract (R26 final)

```ts
// populateAnchorMorphology.ts:fillLeafAnchor (R26)
if (edge.bonePath.length > 0) {
  const lastBone = edge.bonePath[edge.bonePath.length - 1];
  const petioleTipTangent = {
    x: lastBone.p1.x - lastBone.p0.x,
    y: lastBone.p1.y - lastBone.p0.y,
    z: lastBone.p1.z - lastBone.p0.z,
  };
  anchor.rotation = makeLeafQuaternion(petioleTipTangent, { x: 0, y: 1, z: 0 });
} else {
  anchor.rotation = IDENTITY_QUAT;  // degenerate safety net
}
```

★ leaf rotation = _PlantBase가 만든 `petioleCurve`_의 마지막 segment tangent _그대로_.
산수 _추가 0_ — populator는 _curve 데이터를 읽고 quaternion으로 변환만_.

---

## 왜 단순한가

### PlantBase가 _이미_ curve로 표현

`PlantBase.AxisBase.leaves[*].petioleCurve` (Bezier-like control points)는 다음
요인을 _이미_ 반영한 곡선:

1. **방향** — 줄기에서 leaf까지의 attachment → tip 경로
2. **droop** — gravity, senescence, water stress 누적 후 control point 위치
3. **petiole 굴곡** — control point들이 곡률 표현 (catmullRomPath bone 생성)

R26 이전엔 PlantBase가 _curve를 만들고_ + populator가 _별도로_ azimuth/droop/twist 계산.
이 _double work_가 R11~R25 7번의 잘못된 fix 원인. R26은 _curve 자체_가 이미 답이라는
사용자 통찰.

### 마지막 segment tangent = 잎이 자라는 방향

`edge.bonePath` = `catmullRomPath(petioleCurve, ...)` 결과의 bone sequence.
- `bonePath[0]` = attachment 부근
- `bonePath[last]` = leaf tip 부근 (★ leaf 본체가 _달리는_ 방향)

사용자 ASCII 통찰:
```
줄기 → ╲     ← attachment (4)
        ╲
         ╲    ← curve 중간 (2, 3)
          ╲
           ●  ← leaf tip — 마지막 segment의 방향이 _leaf vector_
```

마지막 bone의 `p1 - p0` = 마지막 segment의 tangent = ★ leaf vector.

### `makeLeafQuaternion(petiole, bladeUp)` = lookRotation

```ts
// AnchorTransform.ts (단순)
f = normalize(petiole)               // forward = +x (mesh 길이 축)
u = normalize(bladeUp - f·dot(f, bladeUp))  // up = +y (Gram-Schmidt)
r = cross(f, u)                       // right = +z
return matrixToQuat([f | u | r])     // Shepperd's method
```

orthonormal 3축을 quaternion으로. bladeUp 기본값 = `(0, 1, 0)` (world up) — leaf
blade plane이 _horizontal_ 향함 (정상 토마토 햇빛 자세).

---

## SkeletonNode.frame (parallel-transport)

`SkeletonNode.frame = { tangent, normal }`는 Iter 31 Phase 3 parallel-transport
frame로 _stem 경로_를 따라 부드럽게 회전. R26 contract에서 leaf rotation에는
_직접 사용 안 함_, 다만 **petioleCurve 자체**가 frame을 _간접 활용_해 만들어짐
(PlantBase 산식이 stem normal 방향으로 leaf attachment 위치 결정).

즉:
- Phase 3 parallel-transport frame → PlantBase petioleCurve control points
- → edge.bonePath (catmullRomPath)
- → R26 fillLeafAnchor가 _마지막 segment tangent_ 추출

leaf rotation에서 frame은 _전이적으로_ 영향. R4 (Iter 30) 결함 (frame 미사용)은
parallel-transport 도입 + R26 contract 도입으로 _2단계 해결_.

---

## Invariants (R26)

신규 spec `tests/architecture/iter31-r26-leaf-rotation-contract.spec.ts`:

- **R26-CONTRACT-PETIOLE-CURVE-TANGENT-01**: populator가 `edge.bonePath[last].p1 - p0` 추출
- **R26-CONTRACT-MAKE-LEAF-QUATERNION-01**: `makeLeafQuaternion` 단위 quaternion 출력 (non-degenerate)
- **R26-CONTRACT-NO-LEGACY-COMPOSE-01**: populator에서 legacy `composeLeafRotation*` 호출 0건
- **R26-CONTRACT-WORLD-UP-DEFAULT-01**: bladeUp 기본 `(0, 1, 0)` 사용
- **R26-CONTRACT-IDENTITY-FALLBACK-01**: empty `bonePath` → `IDENTITY_QUAT` safety
- **R26-CONTRACT-MAKE-LEAF-QUATERNION-EXISTS-01**: `AnchorTransform`에서 export

기존 Iter 30 invariant 갱신:
- `SKELETON-ANCHOR-POSTURE-01` — populator는 `edge.bonePath` + `makeLeafQuaternion` 사용
  검증. `composeLeafRotation` import 0건 검증.
- `SKELETON-ANCHOR-TRANSFORM-01` — `composeLeafRotation` 단위 검증은 _보존_ (Iter 30
  contract 호환). 함수는 orphan이지만 spec에서 _legacy 비교 기준_.

---

## R11~R26 이력 (audit)

`docs/audit/iter31-r11-r26-leaf-rotation-iterations.md` 참조.

요약:
- **R11~R18** (Phase 9.x): stem-local frame composition + baseAlign + droop axis 변형
- **R19~R21** (Phase 10.x 진단): mesh axes convention 진단
- **R22~R24**: 각도 측정 + 직선성 측정 spec
- **R25**: stemFrame.tangent 적용 (★ 잘못된 가정)
- **R26**: petioleCurve 마지막 segment tangent (★ 정답)

★ 교훈: PlantBase가 _이미 표현한_ 것을 populator가 _다시 계산_하면 실수 누적.
populator는 _PlantBase 출력을 읽는 thin layer_여야.

---

## Why now (Iter 31)

`PlantBase.petioleCurve`는 Iter 26 이전부터 존재. `edge.bonePath`도 Iter 26 PR 1-2
부터 존재. R26 contract은 _이미 있는 데이터를 다른 방식으로 읽는_ 것 — 새 인프라 0.

R26 이전 7번의 잘못된 fix는 _populator가 자체 산식으로 합성_했기 때문. _curve 자체를
신뢰_하는 사고 전환이 결정적.

---

## 향후 (Iter 32+)

- **POSTURE-FIELD-CLEANUP-01**: `LeafPostureState`의 azimuth/petioleElevation/droop/twist
  4 필드 (@deprecated marker만 추가됨, 제거는 Iter 32) — `docs/iter32-candidates.md`
- **ANCHOR-TRANSFORM-COMPOSE-LEAF-ROTATION-REMOVAL-01**: `composeLeafRotation` 함수
  자체 + `quatY`/`X`/`Z`/`Mul` 제거 — `docs/iter32-candidates.md`
- **Wind sway interaction**: skinTreeSwayAnimation이 petioleCurve를 _수정_해 흔들기 —
  R26 contract 그대로 작동 (populator 변경 없음)
- **Phototropism**: PlantBase가 petioleCurve의 control points를 일조 vector 따라
  조정 — populator 변경 없음
