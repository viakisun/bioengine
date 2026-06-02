# Skeleton SSOT — Single Source of Truth Principle

> **사용자 핵심 원칙**: "Skeleton graph가 단일 진실 출처이고, skin은 그
> 시각화일 뿐이다."

## ★ 절대 원칙 (Iter 39 Phase H0)

**모든 edge**:
```
edge.bonePath.first.p0 ≈ startNode.pos   (≤1mm)
edge.bonePath.last.p1  ≈ endNode.pos     (≤1mm)
```

이 invariant는 **SKELETON-EDGE-01**로 강제 검증. 위반 시 overlay/skin/mesh가
서로 다른 위치를 가리키므로 일관 동작 불가. skeleton geometry는 _절대_ visual
control 도구로 사용 금지. 시각 truncation은 `EdgeRenderPolicy.skinVisibleFraction`
(`docs/architecture/EDGE_RENDER_POLICY.md`)로 분리.

## ★ Skeleton Closure 원칙 (Iter 39 Phase J0)

복엽-읽힘은 _구조 정합성_ (Phase H/I)과 _다른 문제_. J0가 _skeleton 자체가
토마토 복엽으로 읽히는가_를 닫음. 핵심 원칙:

1. **Acceptance 결정은 _graph-native 정량 metrics_** — 3D 시각 판단은 _참고만_
   (camera/perspective/mesh/조명 착시 위험).
2. **Rachis curvature는 단순/단조 + 인접 smooth** — sinusoidal/zigzag 금지.
3. **Petiolule은 거의 안 보일 정도로 짧음** (rachisLen의 10% 이하).
4. **Hierarchy는 _수치 ratio_로 검증** — absolute size는 J1 책임.
5. **Skeleton node.pos는 deterministic** — `rollOffset/twistOffset` 등 seed
   기반 noise가 node 위치 자체에 들어가면 안 됨. noise는 visual pose에서만.
6. **Invariant threshold는 _case별_ 차등 허용** — young/mature/complex는
   botanical 자체가 다름. minReadable clamp 영역에서는 ratio 검증 제외.

추가 J0-7 원칙 (rhythm restoration):

7. **Structural variation vs Random noise** — leaf-level deterministic
   rhythm은 OK, seed-based per-build random noise는 금지
   (LEAFLET-DETERMINISM-01 위반).
8. **metrics는 _금지_ + _부재_ 모두 catch** — strict ceiling만 두면 0 → ∞
   approach 가능. floor 필요 (예: PETIOLULE-LEN min, RACHIS-CURVATURE-PRESENCE).
9. **Grammar 부재는 grammar 위반과 동등** — 단조 직선 + 등간격 + 동일 weight
   는 정합 통과지만 _grammar 부재_. 별도 invariant: RACHIS-CURVATURE-PRESENCE,
   ATTACH-SPACING-CV, BRANCH-DIR-VARIATION.

자세한 metrics 모델: `docs/architecture/LEAFLET_LAYOUT.md` (J0 섹션).

## ★ Layout-first 원칙 (Iter 39 Phase I)

**모든 leaflet의 최종 (position, side, rachisU, sizeFactor)는 _먼저_ 확정** →
attachUs는 layout 결과에서 산출 → strict exact match만 사용.

**금지**:
- `attachUs` 생성 후 leaflet U를 별도 stagger/jitter로 이동 (mismatch 위험)
- `findAttachNodeForU` nearest fallback (truss/fishbone 인상의 원인)
- skeleton `rachisU`에 `profile.spacingBias` 또는 per-leaflet jitter 적용

**필수**:
- 모든 attach U map key는 `uKey(u): string` 으로 단일화 (`Map<string, ...>`)
- `getExactAttachNodeId` strict — miss 시 hard error
- `materializeLeafletSpec(item)` wrapper로 layout item이 source of truth임을 명시

자세한 내용: `docs/architecture/LEAFLET_LAYOUT.md`.

## 원칙

모든 botanical 결정 — _부착점, 회전, 크기, 방향, 곡선_ — 은 **skeleton (graph)**
에서 산출. **Skin은 graph 데이터를 _그대로 읽고_ 시각화만**.

| 결정 사항 | Skeleton 산출 | Skin 사용 |
|---|---|---|
| Leaflet 부착 node | `LeafletNodeRef.attachNodeId` (필드 명시 저장) | mesh.position lookup |
| Leaflet 위치 | `SkeletonNode.pos` (plant-local) | `mesh.position = node.pos` |
| Leaflet 장축 방향 | `LeafletNodeRef.bladeDir` (vec3) | `rotation = makeLeafQuaternion(bladeDir, WORLD_UP)` |
| Leaflet 크기 | `LeafletNodeRef.targetSizeM` (clamp 적용 후) | `lengthM = targetSizeM` |
| Rachis 곡선 | sub-edge `bonePath` (smooth Catmull-Rom + attach point 불변) | SDF tube vertex 그대로 |
| Leaf-level 편향 | `LeafInstanceProfile` (rachisCurvature, imbalance 등) | per-leaflet jitter는 _보완_만 |

## Skin이 위반하면 안 되는 것

1. **mesh.position을 _임의_로 변경하지 않음**
   - `mesh.position = leafletSkeletonNode.pos` _고정_.
   - 시각상 _밀거나_ 다른 anchor로 바꾸지 않음.
   - "visual base"를 표현해야 하면 _mesh-local geometry offset_으로만 (rotation 적용 후 plant-local 변환된 값으로 검증).

2. **bladeDir을 _임의_로 계산하지 않음**
   - skin은 `leafletRef.bladeDir`을 _read만_.
   - 새 방향 산식이 필요하면 _skeleton에 산식 추가_.

3. **size를 _임의_로 변경하지 않음**
   - skin은 `node.leafletRef.targetSizeM`을 그대로 사용.
   - debris-skip / min-readable threshold는 _skeleton의 computeLeafletTargetSize에서_ clamp.
   - skin의 `if (lengthM < X) continue;` _금지_.

4. **attach 정보를 _임의로 재추정_하지 않음**
   - `LeafletNodeRef.attachNodeId` 명시 저장 활용.
   - helper로 역추적해서 다른 node에 부착하지 않음 (edge structure 변경 시 위험).

## Skeleton이 결정해야 하는 것

1. **bladeDir 산출** (`buildTomatoSkeletonGraph.ts:addRachisChild`):
   ```ts
   // lateral = (leafletPos - attachPos) 정규화
   // distal = rachis tangent at attach
   // bladeDir = normalize(lateral × 0.75 + distal × 0.25)
   //   ★ terminal은 pure distal (lateral 없음)
   ```

2. **attachNodeId 명시** (`buildTomatoSkeletonGraph.ts`):
   - terminal: `parentLeafNodeId` (= petiole tip)
   - primary/intercalary: rachis-attach node
   - secondary: parent primary leaflet

3. **targetSizeM clamp** (`computeLeafletTargetSize`):
   - maturity-dependent min (6mm apex young ~ 18mm mature)
   - intercalary ≤ primary × 0.55
   - secondary ≤ primary × 0.70

4. **Rachis bonePath** (`addLeafletNodesForLeaf`):
   - 4-cp Catmull-Rom + intermediate dense
   - sub-edge endpoint == attach point (≤ 1mm strict — RACHIS-ATTACH-01)

5. **LeafInstanceProfile** (`leafInstanceProfile.ts`):
   - rachisCurvature, leftRightImbalance, spacingBias 등 _per-leaf_
   - 같은 잎 안의 모든 leaflet은 _공유_

## Invariants 검증 (자동)

**Iter 39 Phase J0-7 신규 3 invariants** (skeleton rhythm restoration):
- `tests/architecture/rachis-curvature.spec.ts`:
  - **RACHIS-CURVATURE-PRESENCE-01**: midpoint sag / rachisLen ≥ 0.5% +
    linearity ratio ≥ 1.001. 직선 rachis 금지 (단일 macro arc 필요).
- `tests/architecture/compound-layout.spec.ts`:
  - **ATTACH-SPACING-CV-01** (pair ≥ 3): primary 간격 CV ∈ [0.05, 0.30].
    등간격 금지.
  - **BRANCH-DIR-VARIATION-01** (pair ≥ 2): pair 단위 forward 성분 variance >
    0.0001. 모든 primary 동일 weight 금지.
- `tests/architecture/petiolule-length.spec.ts` (재정의 J0-7D):
  - **PETIOLULE-LEN-01**: primary avg ≤ 0.10 + max ≤ 0.12 + min ≥ 0.04.
    intercalary avg ≤ 0.06 + max ≤ 0.07 + min ≥ 0.015. ceiling + floor
    (구슬 꿰기 방지).

**Iter 39 Phase J0 신규 5 invariants** (skeleton closure):
- `tests/architecture/rachis-curvature.spec.ts`:
  - **RACHIS-MONOTONIC-01**: rachis attach 노드 polyline projection strict
    monotonic 증가 + 각 segment dot > 0.70 (단조).
  - **RACHIS-SMOOTH-01**: 인접 segment tangent dot > 0.85 (연속).
- `tests/architecture/leaflet-determinism.spec.ts`:
  - **LEAFLET-DETERMINISM-01**: 같은 시점 재빌드 시 모든 leaflet node.pos
    byte-identical (≤ 1e-9). roll/twist seed noise가 node 위치에 누락된 검증.
- `tests/architecture/petiolule-length.spec.ts`:
  - **PETIOLULE-LEN-01**: primary `petioluleLen / rachisLen ≤ 0.10`,
    intercalary ≤ 0.06.
- `tests/architecture/compound-layout.spec.ts`:
  - **COMPOUND-GAP-01** (case-aware): young/mature/complex 별 attachU gap.
  - **COMPOUND-SLOTS-01**: intercalary가 primary 영역 [-0.10, +0.10] 안.
  - **TERMINAL-CLEARANCE-01**: lastPrimaryU ≤ 0.82 + clearance ≥ 0.15.
- `tests/architecture/hierarchy-visible.spec.ts`:
  - **HIERARCHY-VISIBLE-01**: terminal ≥ primary × 1.15, primary ≥
    intercalary × 1.8 (case-aware: clamp 영역 skip).
- `tests/architecture/lr-stagger.spec.ts`:
  - **LR-STAGGER-01**: 좌우 primary 같은 U 0, minStagger ≥ 0.020,
    sizeFactor 차이 ≥ 0.05.

`tests/architecture/leaflet-attach-coherence.spec.ts` (Iter 39 Phase I5, 신규):
- **LEAFLET-ATTACH-COHERENCE-01**: primary/intercalary `leafletRef.attachNodeId`
  가 `rachis-attach` node를 가리키고, leaflet edge의 `startNodeId == attachNodeId`
  (terminal/secondary 제외 — 별도 의미). graph-native 합성: SKELETON-EDGE-01이
  보장하는 `edge.bonePath endpoint == node.pos` 위에서 incidence만 점검.

`tests/architecture/skeleton-edge-consistency.spec.ts` (Iter 39 Phase H0, 신규):
- **SKELETON-EDGE-01**: 모든 edge bonePath endpoint == startNode/endNode.pos (≤1mm).
  leaf-rachis/petiolule/lateral-vein/sub-vein focus (petiole/peduncle 등은
  PlantBase emerge offset이 있어 별도).
- **NODE-EDGE-INCIDENCE-01**: node.edgeIds 의 edge가 그 node를 endpoint로 가짐
  (leaf hierarchy + petiole/peduncle/pedicel; mainStem/sideShoot/rachis 등 multi-node
  subdivided edge는 design 제외).
- **LEAFLET-REF-01**: attachNodeId/parentLeafNodeId 존재 + bladeDir 정규화
  (|len| ≈ 1) + targetSizeM > 0.

`tests/architecture/mesh-anchor-contracts.spec.ts`:
- **ANCHOR-05**: per-leaflet `mesh.position == leafletNode.pos` (≤1mm)
- **ANCHOR-06**: mesh +X · `leafletRef.bladeDir` ≥ 0.95
- **ANCHOR-07**: vertex max X ≥ minReadableM (maturity-dependent)
- **RACHIS-ATTACH-01**: rachis sub-edge endpoint == attach point (≤1mm strict)
- **HIERARCHY-01**: intercalary_max ≤ primary_avg × 0.55 등
- **ATTACHMENT-GAP-01**: visible base ↔ attachNode 거리 ≤ targetSizeM × 0.08 (또는 5mm)

## History

이 원칙은 Iter 39 Phase G에서 _명시_됨. 이전 Phase F1-F6에서는 _암묵적_으로 위반:
- F2: petiolule SDF 일부 제거 → skin이 graph 정보 일부 무시
- F5: skin이 makeLeafQuaternion 산식을 _자체 계산_ (rachisDir 사용) — bladeDir이 skeleton에 없었음

Iter 39 Phase G2부터 `LeafletNodeRef.{attachNodeId, bladeDir}` 명시 필드 추가
→ skin은 read만, skeleton이 SSOT.

## 참고

- `docs/architecture/MESH_ANCHORS.md` — per-leaflet contract
- `docs/architecture/LEAF_INSTANCE_PROFILE.md` — leaf-level variation
- `docs/architecture/LEAF_COMPOUND_COHERENCE.md` — G1/G2/G3/G4 trade-off
