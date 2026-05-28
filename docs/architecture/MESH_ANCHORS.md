# Mesh Anchors — SSOT

> SSOT #186
> 이 문서는 FarmSim의 각 mesh anchor 계약의 단일 진실 출처(SSOT)이다.
> 새 mesh type 추가 / mesh.position 변경 / mesh-local vertex shift 작업 시
> 반드시 본 문서 참조.

## Mesh anchor란?

각 mesh의 **anchor** = mesh-local `(0, 0, 0)`이 가리키는 의미. 두 가지 역할:

1. **Position anchor**: `mesh.position` (parent-local) → 부착 위치
2. **Rotation origin**: mesh-local `(0, 0, 0)` = 회전 중심

`mesh.rotationQuaternion`은 mesh-local origin을 중심으로 회전. 따라서
**mesh-local origin이 anchor와 일치해야** 회전 적용 후 anchor가 위치
유지된다.

---

## 각 mesh의 anchor contract

### 1. StemFamily tube mesh (`StemFamilyTubeNetworkBuilder`)

| 항목 | 값 |
|---|---|
| `mesh.position` | `(0, 0, 0)` (plant-local, lushGroup 자식) |
| mesh-local origin 의미 | stem 시작점 (= ground 부근 plant root) |
| 회전 origin | mesh-local `(0, 0, 0)` |
| graph anchor node | mainStem edge의 startNode |
| vertex 분포 | mesh-local 좌표가 PlantBase의 stem centerline과 일치 |

**검증**: `mesh.absolutePosition == graph mainStem.startNode.pos`.

### 2. Leaf blade mesh (`createLeafBladeOnlyMesh`)

| 항목 | 값 |
|---|---|
| `mesh.position` | `leafBase.petioleCurve[length-1]` (= petiole tip, plant-local) |
| mesh-local origin 의미 | **첫 leaflet의 가장 stem-side vertex** ⚠ |
| 회전 origin | mesh-local `(0, 0, 0)` = 첫 leaflet stem-side |
| graph anchor node | petiole edge endNode (petiole tip) |
| vertex 분포 | rachis + leaflets — `normalizeLeafMeshVertices` 적용 후 |

**Iter 24 contract** (commit acfad71):
- `buildLeafBladeOnly` 출력 chunk의 vertex.x range는 `[petioleLen + rachisLen·0.15, petioleLen + rachisLen]` 정도 (mesh-local).
- **`normalizeLeafMeshVertices` 적용 필수** — `chunk.positions`의 `x_min`을 측정해 모든 vertex.x에서 빼기.
- 결과: 첫 leaflet의 stem-side vertex가 mesh-local `(0, ?, ?)`.
- `mesh.position = tip` 설정 시 첫 leaflet이 정확히 SDF petiole tip 위치.

**위반 시 증상**: leaflets가 petiole tip에서 `petioleLen + rachisLen·0.15`
만큼 떨어진 곳에 그려짐 → 사용자가 본 "잎이 줄기에 안 붙어보임" (Iter 18~24
disconnect bug).

**utility**: `src/plant/anchors/leafAnchor.ts:normalizeLeafMeshVertices()`.
Iter 24 acfad71 로직을 함수로 분리 (byte-identical).

**검증**: `tests/architecture/mesh-anchor-contracts.spec.ts`에서 모든 leaf
mesh의 첫 vertex가 mesh-local `(0, 0, 0)` 근처 (≤1mm).

### 3. Fruit mesh (`createTrussFruitOrgansOnly`)

| 항목 | 값 |
|---|---|
| `mesh.position` | pedicel tip (plant-local) |
| mesh-local origin 의미 | fruit attach point (pedicel 끝) |
| 회전 origin | mesh-local `(0, 0, 0)` |
| graph anchor node | pedicel edge endNode |
| vertex 분포 | fruit body sphere, mesh-local origin이 stem-side |

**현재 상태**: Iter 18~24 disconnect bug와 무관 — fruit는 leaf와 다른 mesh
경로. 동일 contract pattern 적용 권장 (Iter 26+).

### 4. Flower mesh

(현재 코드 구조에서 fruit와 통합 — `createTrussFruitOrgansOnly`의 일부.)

| 항목 | 값 |
|---|---|
| `mesh.position` | floral site (plant-local) |
| mesh-local origin 의미 | flower 시작점 |
| 회전 origin | mesh-local `(0, 0, 0)` |
| graph anchor node | floral site node |

### 5. Calyx mesh

(현재 코드 구조에서 fruit와 통합.)

| 항목 | 값 |
|---|---|
| `mesh.position` | fruit base (plant-local) |
| mesh-local origin 의미 | calyx 시작점 |

### 6. Cotyledon mesh

| 항목 | 값 |
|---|---|
| `mesh.position` | cotyledon attach point (plant-local) |
| mesh-local origin 의미 | cotyledon stem-side |

---

## Mesh anchor utility — `src/plant/anchors/`

### `MeshAnchor` interface (`anchors/types.ts`)

```ts
export interface MeshAnchor {
  /** mesh.position (plant-local) — Babylon parent (lushGroup) 기준 */
  meshPosition: PlantLocalV3;
  /** mesh-local origin이 어떤 vertex/위치를 가리키는가 (semantic key) */
  meshLocalOriginRole:
    | 'stem-root'                     // StemFamily tube
    | 'first-leaflet-stem-side'       // Leaf blade (Iter 24 contract)
    | 'fruit-attach-pedicel-side'     // Fruit mesh
    | 'flower-attach'                 // Flower mesh
    | 'calyx-attach'                  // Calyx mesh
    | 'cotyledon-attach';             // Cotyledon mesh
  /** anchor가 graph 어느 node를 가리키는가 */
  graphAnchorNodeId: string;
  /** 회전 origin (= mesh-local (0,0,0)) */
  rotationOrigin: 'mesh-local-origin';
}
```

### `LeafAnchor` 특화 (`anchors/types.ts`)

```ts
export interface LeafAnchor extends MeshAnchor {
  meshLocalOriginRole: 'first-leaflet-stem-side';
  /** mesh-local (0,0,0)에서 가장 가까운 leaflet의 nodeIdx */
  firstLeafletNodeIdx?: number;
}
```

### `normalizeLeafMeshVertices` (`anchors/leafAnchor.ts`)

```ts
/** Iter 24 acfad71 — leaf chunk의 vertex.x_min을 0으로 shift.
 *  buildLeafBladeOnly 호출 후 반드시 적용.
 *  - chunk.positions의 첫 leaflet stem-side vertex가 mesh-local (0,?,?)에 위치.
 *  - SkinMeshPlant에서 leafMesh.position = petiole tip 설정 시 자동 정합.
 *
 *  byte-identical to LeafGenerator.ts acfad71 inline code. */
export function normalizeLeafMeshVertices(chunkPositions: Float32Array | number[]): void;
```

### `makeLeafAnchor` (`anchors/leafAnchor.ts`)

```ts
/** Leaf anchor 생성 + invariant 검증 helper. */
export function makeLeafAnchor(
  petioleTipPlantPos: PlantLocalV3,
  graphTipNodeId: string,
  firstLeafletNodeIdx?: number,
): LeafAnchor;
```

### `assertLeafAnchorInvariant` (`anchors/leafAnchor.ts`)

```ts
/** Invariant 검증: mesh의 vertex.x_min이 mesh-local (0,0,0) 근처에 있는지.
 *  ≤epsilon (기본 0.001m = 1mm). 위반 시 throw — normalizeLeafMeshVertices
 *  호출 누락 catch. */
export function assertLeafAnchorInvariant(mesh: Mesh, epsilon?: number): void;
```

---

## 새 mesh type 추가 시 절차

1. **anchor contract 결정**: mesh-local origin이 무엇을 가리키는지.
2. **`MeshAnchor.meshLocalOriginRole` enum에 추가**.
3. **본 문서의 "각 mesh의 anchor contract" 표에 row 추가**.
4. **`makeXxxAnchor` helper 작성** (`anchors/xxxAnchor.ts`).
5. **vertex shift / normalize 필요 시 `normalizeXxxMeshVertices` 작성**.
6. **invariant test 추가** (`tests/architecture/mesh-anchor-contracts.spec.ts`).
7. **CLAUDE.md에 새 mesh type 사용 시 helper 참조 룰 추가**.

---

## Babylon convention 함정

### 1. `mesh.position`은 parent-local

```ts
// 잘못 (Iter 18A 가정)
const tip = leafBase.petioleCurve[3];  // world
leafMesh.position = new Vector3(tip.x, tip.y, tip.z);  // parent-local 기대
// → 잘못 — tip(world) ≠ plant-local (lushGroup parent)
```

**정답**: PlantBase 좌표는 world이지만, mesh.parent = lushGroup이므로 결과
적으로 plant-local로 해석됨. lushGroup transform이 적용된 상태에서 mesh가
그려지므로 visual 결과는 정확. 그러나 `leafMesh.position`의 좌표계 정의는
**parent-local (= plant-local)**.

### 2. `boundingBox.minimum`은 가상 corner (Iter 20 발견)

```ts
// 잘못 (Iter 24 이전)
const visualStart = mesh.getBoundingInfo().boundingBox.minimum;  // 가상 corner
// → 실제 vertex 아님. (x_min, y_min, z_min)가 동시에 존재하는 vertex는 거의 없음.
```

**정답**: 실제 mesh vertex 위치는 `mesh.getVerticesData('position')`로 직접
query. 의미 점 (예: "leaf의 가장 stem-side vertex")이 필요하면 그에 맞는
조건으로 vertex array 검색.

```ts
// 정답
const verts = mesh.getVerticesData('position');
let minLx = Infinity, minLy = 0, minLz = 0;
for (let i = 0; i < verts.length; i += 3) {
  if (verts[i] < minLx) {
    minLx = verts[i];
    minLy = verts[i + 1];  // 같은 vertex의 y
    minLz = verts[i + 2];
  }
}
// (minLx, minLy, minLz) = 실제 vertex (mesh-local)
```

### 3. 회전 적용 시 anchor 보존 의무

`mesh.rotationQuaternion`이 mesh-local origin 중심 회전. anchor가 mesh-local
origin이면 회전 후 anchor 위치 유지.

leaf의 경우 azimuth(Y axis) + droop(Z axis) 회전. droop이 mesh-local Z 축
회전이므로 vertex가 mesh-local (1, 0, 0)이라면 회전 후 (cos·1, -sin·1, 0).
mesh.position이 anchor이므로 회전 후 world에서 anchor 유지, vertex는 그
회전된 방향으로 이동.

**중요**: vertex shift(normalize) 의무 — 그렇지 않으면 anchor가 가상 origin
이지 실제 vertex가 아니므로, 회전 후 anchor와 vertex가 다른 위치에 도달.

---

## Mesh anchor invariant 자동 검증

`tests/architecture/mesh-anchor-contracts.spec.ts`:

| Test | Invariant |
|---|---|
| ANCHOR-01 | LeafBladeOnly mesh의 vertex.x_min이 mesh-local (0, 0, 0) 근처 (≤1mm) — `normalizeLeafMeshVertices` 적용 검증 |
| ANCHOR-02 | leafMesh.absolutePosition (world)이 graph petiole endNode.pos (world 변환 후) ≤1mm 일치 |
| ANCHOR-03 | 모든 organ mesh의 anchor가 contract와 일치 |
| ANCHOR-04 | `normalizeLeafMeshVertices` byte-identical to acfad71 inline 로직 |

위반 시 test fail → mesh anchor 코드 버그.

---

## History — Iter 24 acfad71 (final fix)

```text
LeafGenerator.ts vertex shift (acfad71):
  // 첫 leaflet의 가장 stem-side vertex(min x)가 mesh-local (0, 0, 0)에
  // 오도록 정확히 정렬. 의도: mesh-local origin = leaf anchor = SDF
  // petiole tip 위치.
  let minX = Infinity;
  for (let i = 0; i < chunk.positions.length; i += 3) {
    if (chunk.positions[i] < minX) minX = chunk.positions[i];
  }
  if (Number.isFinite(minX) && minX !== 0) {
    for (let i = 0; i < chunk.positions.length; i += 3) {
      chunk.positions[i] -= minX;
    }
  }
```

이 로직이 `normalizeLeafMeshVertices` utility로 추출됨 (본 SSOT의 Iter 25
정리 작업).
