# Coordinate Systems — SSOT

> SSOT #185
> 이 문서는 FarmSim의 좌표계 정의 + 변환 규칙의 단일 진실 출처(SSOT)이다.
> 좌표 변수 / 좌표 변환 작업 시 반드시 본 문서 참조.

## 4 좌표계 정의

### 1. **world** — Babylon scene 절대 좌표

- **단위**: 미터 (m)
- **원점**: Babylon scene origin `(0, 0, 0)` (Greenhouse 바닥 기준)
- **축**: Babylon convention — Y up, X right, Z forward
- **사용처**:
  - `PlantBase` 출력 (stem centerline, leaf attachPos, truss curves)
  - `mesh.absolutePosition` (= world)
  - `boundingBox.minimumWorld` (= world)

### 2. **plant-local** — lushGroup-relative

- **단위**: 미터
- **원점**: 식물의 `lushGroup` (Babylon TransformNode)
- **scene-world 관계**: `world = lushGroup.absolutePosition + plant-local`
  - `lushGroup.absolutePosition.y ≈ 1.062m` (SUBSTRATE_TOP_Y for greenhouse plants)
- **사용처**:
  - `SkeletonGraph.nodes[id].pos` 모든 node
  - `SkeletonEdge.bonePath[i].p0/p1` 모든 bone
  - `mesh.position` (parent가 lushGroup일 때 — leafMesh, stem mesh 등)
  - `PetioleJunctionPair`의 모든 V3 필드

### 3. **mesh-local** — mesh 내부 vertex 좌표

- **단위**: 미터
- **원점**: 각 mesh의 `(0, 0, 0)` (rotation origin)
- **world 관계**: `world = mesh.getWorldMatrix() × mesh-local`
  - mesh.position(plant-local 위치) + mesh.rotationQuaternion(azimuth + droop) 적용
- **사용처**:
  - `chunk.positions` (geometry build 결과 Float32Array)
  - `mesh.getVerticesData('position')`
  - `boundingBox.minimum` (가상 corner — 실제 vertex 아님)

### 4. **graph** — plant-local의 별칭

- SkeletonGraph 컨텍스트에서 plant-local을 가리키는 용어.
- 의미: PlantBase(world) → buildTomatoSkeletonGraph 안에서 lushGroup
  parent를 거치며 plant-local로 변환됨.

---

## 변환 chain — PlantState → Babylon render

```text
┌──────────────────────────────────────────┐
│  PlantState (NodeState, TrussState, ...)  │ ← biology snapshot
└───────────────────┬──────────────────────┘
                    │ computePlantGeometry(state, opts)
                    ▼
┌──────────────────────────────────────────┐
│  PlantBase                                │
│  - mainAxis.stemCenterline (world)        │ ← world coords
│  - leaves[i].attachPosition (world)       │
│  - leaves[i].petioleCurve (world)         │
│  - trusses[i].peduncleCurve (world)       │
└───────────────────┬──────────────────────┘
                    │ buildPlantSkeleton(plantBase)
                    │ (좌표 그대로 — graph parent transform 적용 없음)
                    ▼
┌──────────────────────────────────────────┐
│  SemanticSkeletonGraph                    │
│  - nodes[id].pos (graph = plant-local)    │ ← Babylon lushGroup 기준
│  - edges[id].bonePath (plant-local)       │
└────────┬───────────────┬─────────────────┘
         │               │
         │ StemFamily    │ createLeafBladeOnlyMesh
         │ TubeNetwork   │ + leaf vertex shift
         │ Builder       │ + normalizeLeafMeshVertices
         ▼               ▼
┌─────────────────┐ ┌────────────────────────┐
│  Stem tube mesh │ │  Leaf blade mesh        │
│  (mesh-local)   │ │  (mesh-local)           │
│  parent: lush   │ │  parent: lush           │
│  position: 0    │ │  position: tip          │ ← plant-local
└────────┬────────┘ └───────┬────────────────┘
         │                  │
         └────────┬─────────┘
                  ▼
         ┌────────────────┐
         │  lushGroup     │ ← position = (0,0,0) plant root in world
         │  parent: root  │
         └────────┬───────┘
                  ▼
         ┌────────────────┐
         │  root (plant)  │ ← position = showcasePos (world)
         │  parent: scene │
         └────────┬───────┘
                  ▼
            Babylon scene (world)
```

**핵심**: world → plant-local 변환은 `buildPlantSkeleton` 내부에서만 일어남
(이때 PlantBase의 world 좌표를 그대로 사용하나, parent transform이 lushGroup
이므로 결과적으로 plant-local로 해석됨).

**중요 invariant**: PlantBase.leaf.attachPosition (world) == SkeletonGraph
edge.bonePath[0].p0 (plant-local) **수치는 같음** — 같은 좌표 값이지만
해석되는 좌표계가 다름 (lushGroup 자식인 mesh.position에 set되면 plant-local).

이 invariant가 Iter 18~22에서 혼동 원인 — 좌표 값은 같으나 의미 좌표계가
다르다는 것을 명시하지 않음.

---

## 변환 함수 (`src/plant/coordinates/transforms.ts`)

### `worldToPlantLocal(world: WorldV3, lushWorldMatInv: Matrix): PlantLocalV3`

world → plant-local. lushGroup의 invert world matrix 필요.

```ts
// Example
const lushWorldMatInv = lushGroup.getWorldMatrix().clone().invert();
const plantPos = worldToPlantLocal(toWorld(bboxMinimumWorld), lushWorldMatInv);
```

### `plantLocalToWorld(plant: PlantLocalV3, lushWorldMat: Matrix): WorldV3`

plant-local → world.

### `meshLocalToWorld(meshLocal: MeshLocalV3, meshWorldMat: Matrix): WorldV3`

mesh-local vertex → world. mesh.getWorldMatrix() 사용 (rotation + parent
transform 모두 적용).

### `meshLocalToPlantLocal(meshLocal, meshWorldMat, lushWorldMatInv): PlantLocalV3`

mesh-local → plant-local. (mesh-local → world → plant-local 합성).

### `assertRoundTrip(v: WorldV3, lushMat: Matrix, epsilon=1e-5): void`

debug invariant — world → plant → world이 원본과 같은지.

---

## Babylon API 매핑

| Babylon API | 반환/처리 좌표계 | 비고 |
|---|---|---|
| `mesh.position` | parent-local | 우리 경우 plant-local (parent = lushGroup) |
| `mesh.absolutePosition` | world | parent transform 적용 |
| `mesh.getAbsolutePosition()` | world | same as above |
| `mesh.getWorldMatrix()` | matrix | world matrix (parent + rotation + scale) |
| `mesh.rotationQuaternion` | mesh-local 회전 | parent-local에서 적용 |
| `mesh.getVerticesData('position')` | mesh-local Float32Array | vertex 직접 query |
| `mesh.getBoundingInfo().boundingBox.minimum` | mesh-local 가상 corner | **실제 vertex 아님** |
| `mesh.getBoundingInfo().boundingBox.minimumWorld` | world 가상 corner | parent + rotation 적용 후 |
| `Vector3.TransformCoordinates(local, matrix)` | matrix 적용 | 변환 utility 사용 |

**중요 함정 (Iter 20 발견)**: `boundingBox.minimum` / `minimumWorld`는 (x_min,
y_min, z_min)의 가상 corner — **mesh에 그 위치 vertex가 없을 수 있음**.
"leaf의 가장 stem-side vertex"같은 의미 점은 `getVerticesData` 직접 query
필요.

**중요 함정 (Iter 28 발견) — Stale worldMatrix**:
`mesh.position` 또는 `mesh.rotationQuaternion` 설정 직후 같은 build cycle에서
`mesh.getWorldMatrix()`를 호출하면 **stale matrix** (= identity)를 반환한다.
Babylon은 worldMatrix를 _next frame_까지 자동 update하지 않는다.

```ts
// ❌ 잘못 — mesh.position 설정 직후 getWorldMatrix() = identity
mesh.position = new Vector3(x, y, z);
mesh.rotationQuaternion = Quaternion.RotationAxis(...);
const mat = mesh.getWorldMatrix();   // ← stale!
const world = Vector3.TransformCoordinates(local, mat);  // ← (0,0,0)

// ✅ 올바름 — computeWorldMatrix(true)로 즉시 update
mesh.position = new Vector3(x, y, z);
mesh.rotationQuaternion = Quaternion.RotationAxis(...);
mesh.computeWorldMatrix(true);       // ★ 강제 update
const mat = mesh.getWorldMatrix();   // ← 최신
```

Iter 28 사례: `SkinMeshPlant.ts` leaf loop에서 mesh 생성 직후 vertex world
변환 시 stale matrix → mesh-local (0,0,0) × identity = world (0,0,0) →
plant-local 변환이 `-lushGroup.world` 부호 반전 결과 (= `-1.062 m`) → docking
overlay의 `dock_l_leafstart_*` 라인이 plant top → world origin (바닥)으로
**3.28m 늘어남**. fix: `m.computeWorldMatrix(true)` 한 줄.

검증: `tests/architecture/leaf-vertex-world.spec.ts` LEAF-VWORLD-01/02.

---

## 변수 naming convention

좌표 변수에는 **항상 좌표계 suffix**:

```ts
// 좋음
const tipPlantPos: PlantLocalV3 = ...;
const attachWorldPos: WorldV3 = ...;
const vertexMeshPos: MeshLocalV3 = ...;
const stemNodeGraphPos = node.pos;  // graph는 plant-local 별칭

// 나쁨 — 좌표계 모호
const tip = ...;       // world? plant-local?
const pos = ...;       // 어디 좌표계?
const attachPos = ...; // (Iter 18~22에서 혼동의 원인)
```

**예외**: Babylon API 표준 (`mesh.position`, `mesh.absolutePosition`) — 이름
변경 X, 사용처에서 좌표계 주석.

---

## 좌표계 가설 검증 invariant

`tests/architecture/coordinate-contracts.spec.ts`의 INV-01~05:

| ID | Invariant |
|---|---|
| INV-01 | SkeletonGraph 모든 node.pos는 plant-local — leafMesh.position과 동일 좌표계 (직접 비교 시 의미) |
| INV-02 | PetioleJunctionPair 모든 V3 필드 plant-local |
| INV-03 | Leaf mesh의 mesh-local x_min vertex의 world → plant-local 변환 = leafMesh.position (≤1mm). **Iter 24 contract** |
| INV-04 | graph endNode.pos == PlantBase petioleCurve[3] (= tip) (≤0.5mm) |
| INV-05 | 좌표 변환 round trip: world → plant-local → world == 원본 (≤0.01mm) |

invariant 위반 시 spec fail → 좌표 변환 / mesh anchor 코드 버그.

---

## History — Iter 18~24 7번 실패의 좌표계 측면

| Iter | 잘못된 좌표 가정 |
|---|---|
| 18A | `mesh.position` = world (실제 parent-local) |
| 18B | PlantBase petioleLen vs leafChunk petioleLen 좌표 무관하나 multiplier 다름 |
| 19  | radialDir 계산 시 plant-local vs world 혼동 |
| 20  | docking overlay에서 두 좌표계 비교 (plant-local vs world) |
| 21  | petioleCurve c1/c2 계산을 world arc로 가정 |
| 22  | mesh.position을 attachPos vs tip 사이 flip-flop |
| 24  | `boundingBox.minimum`이 가상 corner라 vertex 아님 |

전체 상세: `docs/calibration-checkpoint-reports/v0.13-iter24-leaf-anchor-fix-comprehensive.md`.

각 실패는 본 SSOT 부재로 매번 다른 가정으로 작업한 결과. 본 SSOT + invariant
tests로 같은 실수 반복 방지.
