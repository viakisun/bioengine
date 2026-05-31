# Iter 31 R11~R26 Leaf Rotation Iterations — Audit

> 7번의 잘못된 fix 후 R26 정답. 단일 시각 결함 (leaf 회전이 _자연 토마토_답지 않음)
> 을 해결하는 과정에서 _populator가 자체 산식으로 합성_하는 잘못된 abstraction이
> 7번 반복. R26은 산식 자체를 _제거_하고 _PlantBase curve 출력을 그대로 사용_.

---

## 0. Context

**Iter 30 종료** (commit `92aeff6`): Quality Gate H 시각 검증에서 사용자가 3 결함 지목:
1. R4 fern stack (모든 잎이 동일 평면 누적)
2. R5 leaf size (mature small leaf이 full size)
3. R6 horizontal stem (apex가 옆으로)

Iter 31 v3 plan은 Phase 0~8에서 R4/R5/R6 해결. 그러나 **leaf rotation** (R4 의
근본 원인)이 Phase 9 R11부터 _7회_ 시도되어도 시각상 안 맞음. R26에서야 정답.

---

## 1. R11~R26 Timeline

### R11 (Phase 9.1, commit `9f12f66`): baseAlignmentQuat 추가

**가설**: mesh-local axes (+x=petiole, +y=blade normal, +z=width)와 stem-local
target axes가 정렬 안 됨. base alignment quaternion 도입.

```ts
qY(azimuth) ⊗ qX(-droop) ⊗ qZ(twist) ⊗ baseAlignmentQuat(stemFrame.normal)
```

**결과**: 부분 — 44% blade up. _blade plane이 정해지지 않음_.

### R12 (Phase 9.2, commit `bf90104`): azimuth around world Y

**가설**: stem-local frame은 _이미_ phyllotaxy를 표현 — azimuth를 world Y에 적용
(stem-local _아닌_).

**결과**: _겉_으로 100% blade up. 다른 결함을 가림.

### R13 (Phase 9.3 진단): H1~H8 variant 비교

**진단**: 8개 hypothesis (azimuth multiplier, droop axis 변형 등) 동시 비교.

### R14 (Phase 9.3, commit `397a316`): azimuth 제거

**가설**: parallel-transport `frame.normal`이 _스스로_ phyllotaxy spiral 표현
(petiole std 100.8°). 추가 azimuth는 _double counting_ → cancel.

**결과**: 부분. world azimuth lock 해소.

### R15~R18 (Phase 9.4~9.5): droop axis 변형

**시도**:
- R15~R17: droop around binormal (`cross(tangent, normal)`)
- R18 (commit `456f147`): droop axis = `WORLD_UP × (stemNormal projected horizontal)`
  — 사용자 사진 #4 D=30 top-down "일관된 30° tilt" 해소 시도.

**결과**: 부분. blade가 _slight tilt_ 잔존.

### R19~R21 (Phase 10.0~10.1): mesh axes convention 진단

**시도**:
- R19: `composeLeafRotationLocal` 산식 trace
- R20: stem trajectory 진단
- R21: mesh axes (mesh-local +x/+y/+z) 정확성 검증

★ 사용자: "잎의 벡터 하나를 결정하는데 왜 이렇게 복잡한거야?"

### R22 (commit `89fdb95`): 각도 측정 + 산식 정확성

**진단**: 6개 angle invariant 측정:
- stem.tangent ~ leaf.petiole = 90° (정상)
- WORLD_UP ~ leaf.bladeUp = 0° (정상)
- 기타

**결과**: 모든 각도 _정상_. **산식은 정확하지만 시각 결함 잔존** → fundamental misalignment.

### R23 (commit `89fdb95`): mesh build trace

**발견**: leafChunk.ts에 `0.025m` _hardcoded_ lateral offset + `leafletBladeScale =
projection.linearAreaScale` (length gate _missing_) → `a0_n13` simple_leaf anomaly.

**Fix**: hardcoded → `side * leafletSize * 0.2`; `leafletBladeScale = leafAxisLengthScale`.

**결과**: 8/9 leaf 정상. 1개 (`a0_n13`) 잔존.

### R24 (commit `89fdb95`): 자라는 방향 vs body 방향

**가설**: leaf rotation의 +x axis (자라는 방향)와 leaf body 방향 (anchor → farthest
vertex)이 _일치_해야.

**결과**: angle = 0° (직선). _이미 정상_. → rotation _계산은 맞음_, 다만 _기준 vector_가 틀림.

### R25 (Phase 10.3, commit `e1cac02`): `stemFrame.tangent` 적용

**가설**: 사용자 "줄기가 만약에 아래로 좀 꺽여있다고 하면, 그걸 그대로 mesh 방향에
적용되어야 하는거잖아?"

**시도**: `makeLeafQuaternion(stemFrame.normal, stemFrame.tangent)`. WORLD_UP을
stemFrame.tangent로 교체.

**결과**: ★ _잘못된 가정_. stemFrame.tangent는 _stem 위 방향_이지 _leaf 방향_이 아님.
사용자 "잎이 위로 향해 있고, 옆으로 꺾여있고. 정말 최악이다".

### ★ R26 (Phase 10.5, commit `4029b6b`): petioleCurve 마지막 tangent

**사용자 통찰** (★ 결정적):
> "줄기는 curve 함수가 적용되어 있는거일꺼 아니야 / 마지막 curve의 x,y,z 함수의
> 기울기값이라는게 존재할거고, 그거대로 마지막 vector값을 계산해서 전달해주면 되는거잖아?"

**발견**: `leaf_blade` anchor는 _petiole edge_의 organAnchor (buildTomatoSkeletonGraph.ts:268).
`edge.bonePath` = PlantBase `petioleCurve`의 bones (catmullRomPath).
`edge.bonePath[last].p1 - p0` = 마지막 segment tangent = ★ leaf vector.

이미 `buildTomatoLeafOrganGraph.ts:99-101`에서 _계산되어 있지만_ leaf rotation에
_전달 안 됨_. populator (`fillLeafAnchor`)에 _직접 추출_ 추가:

```ts
if (edge.bonePath.length > 0) {
  const lastBone = edge.bonePath[edge.bonePath.length - 1];
  anchor.rotation = makeLeafQuaternion(
    { x: lastBone.p1.x - lastBone.p0.x,
      y: lastBone.p1.y - lastBone.p0.y,
      z: lastBone.p1.z - lastBone.p0.z },
    { x: 0, y: 1, z: 0 },
  );
}
```

**결과**: ★ 시각 통과. 사용자 "아 완벽하다 수고했어. 이제 그간 불필요했던 코드들
다 삭제해줄래?"

---

## 2. 공통 패턴 (왜 R11~R25가 실패했나)

### 잘못된 abstraction: populator가 _자체 산식으로 합성_

R11~R25 모두 _공통_으로 다음 가정:
- `LeafPostureState`의 azimuth/droop/twist 등을 _populator가 받아서_
- _별도의 quaternion 산식_으로 _합성_

이 가정이 _잘못된 이유_:
- PlantBase는 _이미_ `petioleCurve` (Bezier-like control points)로 _leaf의 모든
  자세_를 표현
- gravity, senescence, water stress, droop은 _PlantBase가_ control points 위치에
  반영
- petiole 곡률은 `catmullRomPath`로 bone sequence가 됨
- 마지막 bone의 tangent = ★ _leaf가 자라는 방향_ — 이게 leaf rotation의 _전부_

★ populator가 _다시 계산_하면:
1. PlantBase 산식과 _분리_ — 두 곳이 어긋남
2. 산식 복잡도 누적 (R11~R25 7회 시도)
3. 사용자 review마다 "왜 이렇게 복잡한가?" 반복

### R26 contract: populator = thin layer

```
PlantBase (gravity/senescence/etc.) → petioleCurve control points
  → catmullRomPath → edge.bonePath
    → fillLeafAnchor: 마지막 bone tangent _그대로_ → makeLeafQuaternion
      → anchor.rotation
```

populator는 _PlantBase 출력을 읽는 thin layer_. 산수 추가 0.

---

## 3. 교훈

### 1. PlantBase가 _이미 표현한_ 것을 populator가 _다시 계산_하지 말 것

★ Iter 29 책임 분리 원칙 (`SKIN-NO-GROWTH-LOGIC-01`)을 _populator에도_ 적용.
populator/Skin은 PlantBase _출력만_ 읽고 _변환만_ 수행.

### 2. Curve가 있으면 _curve를 신뢰_

R26 이전엔 populator가 `azimuth/droop/twist` 4-tuple로 _재합성_. 이 4-tuple은
_curve 단순화_ — _curve 자체보다 정보 적음_.

★ Vector field (curve의 tangent)를 _직접_ 사용하는 게 _scalar parameter 합성_
보다 _자연스럽고 단순_.

### 3. 사용자 ASCII 통찰의 가치

R11~R25는 _측정/진단_으로 _해결책_을 찾으려 함. R26은 _사용자가 그린 ASCII_로
"마지막 segment tangent"라는 정확한 답을 가리킴. _도메인 직관_이 _측정_보다 빠를
때가 있음.

### 4. Phase Z numeric equivalence의 가치

리팩토링 _byte-level 정합_ (Phase Z 3-layer)을 처음부터 _기준_으로 잡으면
"리팩토링이 산출값 변경 0"을 _수치로_ 보장. 시각 검증 불필요. 이는 향후 cleanup
작업의 _standard practice_가 되어야.

---

## 4. 관련 commit chain

R11 시작 — `9f12f66`
R26 정답 — `4029b6b`
Phase A~Z cleanup — `db1280c` ~ `d799ad4`

자세한 commit 표: [`v0.17-iter31-r26-leaf-rotation-final.md`](../calibration-checkpoint-reports/v0.17-iter31-r26-leaf-rotation-final.md)
