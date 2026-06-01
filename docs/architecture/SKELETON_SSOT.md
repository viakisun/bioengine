# Skeleton SSOT — Single Source of Truth Principle

> **사용자 핵심 원칙**: "Skeleton graph가 단일 진실 출처이고, skin은 그
> 시각화일 뿐이다."

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
