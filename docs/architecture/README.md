# FarmSim — Architecture SSOT

Iter 18~24 동안 "잎이 줄기에 안 붙어보임" 단일 버그를 **7번 잘못된 fix
후에야 해결**했다. 한 줄 원인:

> 좌표계 (world / plant-local / mesh-local)와 mesh anchor 의미가 **코드
> 위치마다 다르게 정의됐으나 주석/타입으로 명시 안 됨** → 매번 다른 가정
> 으로 작업.

본 디렉토리는 **시스템적 재발 방지**를 위한 단일 진실 출처(SSOT)이다.

---

## 1-Page 요약

### 4 좌표계

| 좌표계 | 정의 | 사용처 |
|---|---|---|
| **world** | Babylon scene 절대 좌표 (m) | `PlantBase` 출력 |
| **plant-local** | lushGroup-relative — Babylon mesh.position 좌표계 | `SkeletonGraph`, `leafMesh.position` |
| **mesh-local** | 각 mesh 내부 vertex 좌표 | `chunk.positions`, leaf의 leaflet 위치 |
| **graph** | plant-local의 별칭 (SkeletonNode/Edge 사용) | `node.pos`, `edge.bonePath` |

### 변환 chain

```text
PlantState
  └── computePlantGeometry → PlantBase (world)
       └── buildTomatoSkeletonGraph → SkeletonGraph (plant-local)
            └── StemFamilyTubeNetworkBuilder → tube mesh (mesh-local)
            └── createLeafBladeOnlyMesh → leaf mesh (mesh-local)
                 └── leafMesh.position = tip (plant-local)
                      └── lushGroup.parent.position = world (Babylon)
```

### Babylon convention

| Babylon API | 좌표계 |
|---|---|
| `mesh.position` | parent-local (= plant-local 우리 경우) |
| `mesh.absolutePosition` | world |
| `mesh.getBoundingInfo().boundingBox.minimum` | mesh-local (vertex 가상 corner) |
| `mesh.getBoundingInfo().boundingBox.minimumWorld` | world (가상 corner) |
| `mesh.getVerticesData('position')` | mesh-local (Float32Array) |

### Mesh anchor

각 mesh의 **anchor** = mesh-local (0, 0, 0)이 가리키는 의미 (rotation
origin이기도 함).

| Mesh | mesh.position (plant-local) | mesh-local origin |
|---|---|---|
| StemFamily tube | stem root (ground) | stem 시작점 |
| Leaf blade | petiole tip | **첫 leaflet stem-side vertex** (Iter 24 contract) |
| Fruit | pedicel tip | fruit center 또는 attach point |
| Flower | floral site | flower 시작점 |
| Calyx | fruit base | calyx 시작점 |

자세한 contract는 [MESH_ANCHORS.md](./MESH_ANCHORS.md).

---

## 작업 시 rule

1. **좌표 변수는 항상 좌표계 suffix**: `worldPos`, `plantPos`, `meshPos`, `graphPos`
2. **좌표 변환은 utility 사용** — `src/plant/coordinates/transforms.ts`. inline 변환 금지.
3. **mesh anchor 생성은 helper 사용** — `src/plant/anchors/`. 새 mesh type 추가 시 `MESH_ANCHORS.md`에 contract 명시 + invariant test 추가.
4. **branded types** — `WorldV3`, `PlantLocalV3`, `MeshLocalV3` (compile-time 좌표계 안전).

---

## 자세히

- **[COORDINATE_SYSTEMS.md](./COORDINATE_SYSTEMS.md)** (SSOT #185) — 4 좌표계 상세 정의, 변환 함수, Babylon API 매핑.
- **[MESH_ANCHORS.md](./MESH_ANCHORS.md)** (SSOT #186) — 각 mesh의 anchor contract, 회전 origin, vertex 분포 의무.
- **[SEMANTIC_GRAPH.md](./SEMANTIC_GRAPH.md)** (SSOT #187) — SkeletonGraph 의미 + 4 원칙 + 데이터 흐름 + Skin/Overlay 계약.

## 재발 방지

- **Invariant tests** — `tests/architecture/`
  - `coordinate-contracts.spec.ts` — INV-01~05 좌표 contract 자동 검증
  - `mesh-anchor-contracts.spec.ts` — 모든 mesh anchor가 graph anchor와 일치
  - `leaf-attach-visual-regression.spec.ts` — D45/D99 leaf 위치 pixel diff
- **CLAUDE.md** (project root) — AI 코딩 시 본 docs 참조 강제

## History

- Iter 18~24 leaf disconnect 7번 실패 audit: `docs/calibration-checkpoint-reports/v0.13-iter24-leaf-anchor-fix-comprehensive.md`
