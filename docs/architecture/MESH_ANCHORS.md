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

### 2. Leaf blade mesh — _per-leaflet_ since Iter 39 (`buildLeafletMeshes`)

★ **Iter 39 Phase A/B contract 개정**: 잎 1장 = N개 leaflet mesh (terminal +
primary + intercalary + secondary 각각 1장씩). 이전 contract (1 잎 = 1 통합
mesh, mesh-local origin = "첫 leaflet stem-side")는 _historic archive_.

| 항목 | 값 |
|---|---|
| `mesh.position` | **`leafletSkeletonNode.pos`** (plant-local, graph SSOT) |
| mesh-local origin 의미 | _개별 leaflet base_의 가장 proximal vertex |
| 회전 origin | mesh-local `(0, 0, 0)` = leaflet base |
| graph anchor node | leaflet-node (terminal/primary/intercalary/secondary) |
| vertex 분포 | 단일 leaflet plane — `normalizeLeafMeshVertices` 적용 후 |
| mesh name | `skinplant_leaf_{seed}_a{ax}_n{n}_l{idx}_{position}` |

**Entry function**: `src/scene/leaf-engine/buildLeafletMeshes.ts:buildLeafletMeshes()`.
mandatory path — `bladeRef`/`leafletSkeletonNodes` 누락 시 throw (Phase K
silent fallback 함정 방지).

**petiolule connector** (Iter 39 Phase F2): petiolule edge bonePath는 leafletNode
까지 가지 않고 _attach 쪽 20%_만 SDF tube로 생성. leaflet plane이 나머지를
시각적으로 덮음. leafletNode.pos는 _그대로_ — ANCHOR-05 contract.

**SDF skip** (Iter 39 Phase F2): `lateral-vein`, `sub-vein`은 SDF tube 생성
안 함 — F2.5의 vertex color + normal perturbation으로 surface feature.

★ **Iter 39 Phase G2 (Skeleton SSOT 강화)**:
- `LeafletNodeRef.attachNodeId` 필드 명시 저장 — helper lookup 의존 0.
- `LeafletNodeRef.bladeDir` 필드 명시 저장 — leaflet 장축 방향 (plant-local 단위벡터).
- bladeDir 산출 (skeleton 수준):
  - **terminal**: pure distal rachis tangent (rachis 연속).
  - **lateral (primary/intercalary/secondary)**: `normalize(lateral × 0.75 + distal × 0.25)`.
- skin은 `rotation = makeLeafQuaternion(bladeDir, WORLD_UP)` — _read만_, 자체 계산 0.
- 참조: `docs/architecture/SKELETON_SSOT.md`.

★ **Iter 39 Phase H0 (petiolule truncation revert)**:
- G2의 `PETIOLULE_VISIBLE_RATIO_BY_POSITION` (skeleton bonePath 단축)이 SSOT
  위반 (bonePath endpoint ≠ endNode.pos) → SkeletonOverlay에서 leaflet 노드
  공중에 떠 있는 것처럼 보임.
- H0가 petiolule/lateral-vein bonePath를 _full path_ (attachPos → leafletPos)로
  복원. 시각적 truncation 의도는 H4의 `EdgeRenderPolicy.skinVisibleFraction`로
  이동 (`docs/architecture/EDGE_RENDER_POLICY.md`).
- SKELETON-EDGE-01 / NODE-EDGE-INCIDENCE-01 / LEAFLET-REF-01 신규 invariants가
  graph SSOT 강제 (`tests/architecture/skeleton-edge-consistency.spec.ts`).

**Iter 24 contract** (commit acfad71, _x만 shift_) — **Iter 39 K3에서 3D
확장**:
- `buildLeafBladeOnly` 출력 chunk의 vertex.x range는 `[petioleLen + rachisLen·0.15, petioleLen + rachisLen]` 정도 (mesh-local).
- Iter 24 acfad71: `chunk.positions`의 `x_min`만 측정해 모든 vertex.x에서 빼기.
- 결과 (Iter 24): 첫 leaflet의 stem-side vertex가 mesh-local `(0, y₀, z₀)` —
  **y, z 임의 offset 잔존**.

**Iter 39 K3 확장 — 3D anchor**:
- `normalizeLeafMeshVertices`가 x_min vertex의 `(x, y, z)` _모두_ shift.
- 결과: stem-side vertex = mesh-local `(0, 0, 0)`.

**K3 진단 (probe)**:
- yzOffset 분포: p50 **8.2mm**, p95 **35mm**, max **91mm** (Iter 24 산식 기준).
- mesh.position = leafletNode.pos로 set해도 _실제 base vertex_ world position
  = node.pos + rotation × (0, y₀, z₀) → **시각상 leaflet이 공중에 떠 보임**.
- K3로 yzOffset = 0 강제 → leaflet base의 _첫_ vertex가 leafletNode.pos에 anchor.

**Iter 39 L1-B 확장 — Centroid anchor (사용자 close-up 진단 정확)**:

K3 (`strict less-than`)은 row=0의 _첫 만나는 vertex_ 선택. leafletPlaneChunk
산식상 row=0 (stem-side)에 col 0~8 9 vertices가 모두 x = x_min:
- col=0 → z = -halfWidthLeft (**leftmost edge**)
- col=4 → z = 0 (center)
- col=8 → z = +halfWidthRight (**rightmost edge**)

K3 산식이 col=0 (left edge)를 anchor로 선택 → leaflet base의 _왼쪽 가장자리_
가 leafletNode.pos에 매달림 (probe `firstMinXOffset` avg **7.8mm**).

**L1-B fix** (Option B — Centroid):
```ts
// row=0 (x ≈ x_min) vertex들의 y, z 평균을 anchor로 사용.
const EPS = 1e-5;
let sumY = 0, sumZ = 0, count = 0;
for each vertex with |x - minX| < EPS:
  sumY += y, sumZ += z, count++
yCenter = sumY / count;  zCenter = sumZ / count;
// (minX, yCenter, zCenter) → mesh-local (0, 0, 0).
```

**결과**: `centroidOffset = 0.000mm` (avg over 118 leaflets). leaflet base
중심이 정확히 leafletNode.pos. 사용자 #2 "센터가 아닌 끄트머리에 연결" 해소.

**v2 보완** (사용자):
1. EPS = **1e-5** (= 0.01mm tolerance, Float32 safe).
2. needShift tolerance 비교 (`Math.abs(x) > 1e-9`).
3. ANCHOR-01 invariant = row centroid 기준 (x_min vertex 단일 기준 폐기).
4. Probe diagnostic: centroidOffset + firstMinXOffset 둘 다 출력 (차이 visualize).
5. assertLeafAnchorInvariant 산식 동기 갱신.

**위반 시 증상**: K0/K1/K2 (skinVisibleFraction 정책 조정)로 connector tube
gap을 해소했음에도, _mesh anchor 자체_에 잔존 offset (~수십 mm)이 있어 leaflet
이 떠 보임 (사용자 close-up 증상). K3 fix로 _수학적으로_ 0.

**utility**: `src/plant/anchors/leafAnchor.ts:normalizeLeafMeshVertices()` (K3
확장 후 3D).

**검증**: `tests/architecture/mesh-anchor-contracts.spec.ts`:
- ANCHOR-01: 모든 leaf mesh의 x_min vertex가 mesh-local x ≤1mm.
- ANCHOR-04 (K3 3D revised): synthetic fixture로 stem-side vertex = (0, 0, 0)
  byte-identical 검증 (x, y, z 모두).
- `assertLeafAnchorInvariant`: runtime invariant — stem-side vertex의
  `sqrt(x² + y² + z²) ≤ 1mm`.

#### ★ Iter 31 R26 contract — `OrganAnchor.rotation` 산출 (commit 4029b6b)

`leaf_blade` `OrganAnchor`의 rotation은 _PlantBase petioleCurve의 마지막 segment
tangent_ 그대로 사용:

```ts
// populateAnchorMorphology.ts:fillLeafAnchor
const lastBone = edge.bonePath[edge.bonePath.length - 1];
const petioleTipTangent = {
  x: lastBone.p1.x - lastBone.p0.x,
  y: lastBone.p1.y - lastBone.p0.y,
  z: lastBone.p1.z - lastBone.p0.z,
};
anchor.rotation = makeLeafQuaternion(petioleTipTangent, { x: 0, y: 1, z: 0 });
```

- `petioleTipTangent` = leaf가 _자라는 방향_ (마지막 segment의 곡선 기울기)
- `bladeUp` 기본값 `(0, 1, 0)` = world up — blade plane horizontal (햇빛 자세)
- `makeLeafQuaternion` (AnchorTransform.ts) = lookRotation (Gram-Schmidt + Shepperd's)
- `posture.azimuth/droop/twist` 등 _별도 산식 0_ — PlantBase curve가 _이미_ 표현

자세한 contract은 [`STEM_LOCAL_FRAME.md`](./STEM_LOCAL_FRAME.md) (R26 final).
Iter 30 Phase 0.D `composeLeafRotationLocal` contract은 _historic_ (archived).

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
| ANCHOR-01 | 모든 `skinplant_leaf_*` mesh의 vertex.x_min이 mesh-local (0, 0, 0) 근처 (≤1mm). Iter 39부터 per-leaflet — 각 leaflet base = mesh-local origin. |
| ANCHOR-02 | leafMesh.absolutePosition (world)이 graph petiole endNode.pos (world 변환 후) ≤1mm 일치 |
| ANCHOR-03 | 모든 organ mesh의 anchor가 contract와 일치 |
| ANCHOR-04 | `normalizeLeafMeshVertices` byte-identical to acfad71 inline 로직 |
| **ANCHOR-05** (Iter 39 Phase F6) | `skinplant_leaf_*_l\d+_*` mesh의 `mesh.position == graph.nodes[matchingLeafletNodeId].pos` (≤1mm). Phase K(09def1d) index-mismatch 함정을 catch. |

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
