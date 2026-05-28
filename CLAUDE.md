# FarmSim — Claude/AI Coding Guide

토마토 시뮬레이션 (Babylon.js + React). 본 문서는 AI 코딩 시 따라야 할
시스템 룰 SSOT.

## 좌표 / Mesh Anchor 작업 시 (필수)

**다음 docs 먼저 읽기**:
- [`docs/architecture/COORDINATE_SYSTEMS.md`](docs/architecture/COORDINATE_SYSTEMS.md) — 4 좌표계 정의 + 변환 규칙
- [`docs/architecture/MESH_ANCHORS.md`](docs/architecture/MESH_ANCHORS.md) — 각 mesh의 anchor 계약

**작업 rule**:

1. **좌표 변수 = 좌표계 suffix 필수**
   - `worldPos`, `worldX`, `worldY` (world)
   - `plantPos`, `plantLocalX` (plant-local = lushGroup 자식)
   - `meshPos`, `meshLocalX` (mesh 내부 vertex)
   - `graphPos` (= plant-local 별칭, SkeletonNode/Edge에서)
   - 모호한 `pos`, `tip`, `attachPos` 금지

2. **좌표 변환 = utility 사용**
   - `src/plant/coordinates/transforms.ts` 의 `worldToPlantLocal`,
     `plantLocalToWorld`, `meshLocalToWorld`, `meshLocalToPlantLocal` 등
   - inline `Vector3.TransformCoordinates(...)` 직접 호출 금지
     (utility 미존재 시 utility에 추가 후 호출)

3. **Mesh anchor = helper 사용**
   - `src/plant/anchors/leafAnchor.ts` 의 `normalizeLeafMeshVertices`,
     `makeLeafAnchor`, `assertLeafAnchorInvariant`
   - 새 mesh type 추가 시 `docs/architecture/MESH_ANCHORS.md`에 contract
     명시 + `src/plant/anchors/`에 helper 추가 + invariant test 추가

4. **Branded types compile-time 안전**
   - `WorldV3`, `PlantLocalV3`, `MeshLocalV3` 타입 사용
   - 좌표계 brand가 다른 타입을 직접 비교하지 말 것 (변환 후 비교)

5. **Babylon API 함정 주의**
   - `mesh.position`은 parent-local (plant-local 우리 경우, world 아님)
   - `mesh.absolutePosition`이 world
   - `boundingBox.minimum`은 가상 corner — 실제 vertex 아님 (Iter 20 발견)
     → 의미 점은 `getVerticesData('position')` 직접 query
   - 회전 origin = mesh-local `(0, 0, 0)` — vertex shift 의무

## 재발 방지

Iter 18~24에 "잎이 줄기에 안 붙어보임" 단일 버그를 **7번 잘못된 fix 후에야
해결**. 본 룰 부재가 원인. strict 적용.

자동 검증 (CI에서 실행):
- `tests/architecture/coordinate-contracts.spec.ts` — INV-01~05 좌표 contract
- `tests/architecture/mesh-anchor-contracts.spec.ts` — mesh anchor contract
- `tests/architecture/leaf-attach-visual-regression.spec.ts` — leaf 위치 pixel diff

위반 시 작업 멈추고 SSOT 문서 재확인.

## History

Iter 18~24 leaf disconnect 7번 실패 audit:
[`docs/calibration-checkpoint-reports/v0.13-iter24-leaf-anchor-fix-comprehensive.md`](docs/calibration-checkpoint-reports/v0.13-iter24-leaf-anchor-fix-comprehensive.md)
