# Skeleton → Node 정보 → Rendering 알고리즘 — 3-tier 데이터 흐름 (Iter 36 v5)

> 사용자 architectural model 직접 인용:
> > "skeleton → node 정보 → rendering 알고리즘. 이렇게 명확하게 구분되어 진행할꺼지?
> > 결과적으로는, skeleton에 잎자루, 소엽, 곁순, 그리고 소엽 각각까지 그래서 그 노드까지
> > 그려져야 하고, 소엽 노드 끝에 잎의 렌더링 정보가 이미 구축되어 있고,
> > 잎을 렌더링하는 엔진이 별도로 이를 수행해야 하는거야."

본 문서는 FarmSim의 plant rendering 3-tier 책임 분리를 정의합니다.

---

## 3-Tier 구조

```
┌──────────────────────────────────────────────────────────────┐
│  Tier 1: Skeleton (src/plant/skeleton/PlantSkeletonGraph.ts)  │
│                                                                │
│  SkeletonNode types (15):                                      │
│    main-stem-node, side-shoot-node, petiole-root, petiole-tip,│
│    leaf-blade-root, truss-root, peduncle-node, rachis-node,   │
│    pedicel-root, pedicel-tip, fruit-root, flower-root,         │
│    calyx-root,                                                 │
│    ★ leaflet-node (Iter 36 v5 — 4 position types),             │
│    ★ bud-node (Iter 36 v5 — axillary bud)                      │
│                                                                │
│  각 node: pos + radius + edgeIds + (type-specific ref)         │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼ (populator: buildTomatoSkeletonGraph)
┌──────────────────────────────────────────────────────────────┐
│  Tier 2: Node 정보 (per-node typed refs)                       │
│                                                                │
│  - SkeletonNode.phytomer (PhytomerNodeRef)                     │
│      → leaf.{leafletCount, currentAreaCm2, senescence, ...}    │
│                                                                │
│  - SkeletonNode.leafBladeRef (LeafBladeRef) ★ Iter 36 v5       │
│      → leafLengthM, primaryPairs, intercalaryCount,            │
│        agePreset, complexity, droopDeg, twistDeg               │
│                                                                │
│  - SkeletonNode.leafletRef (LeafletNodeRef) ★ Iter 36 v5       │
│      → parentLeafNodeId, position (terminal/primary/secondary/ │
│        intercalary), rachisU, sizeFactor, targetSizeM          │
│                                                                │
│  - SkeletonNode.budRef (BudNodeRef) ★ Iter 36 v5               │
│      → parentNodeId, state, activatedAxisId (link to sideShoot)│
│                                                                │
│  - OrganAnchor (Iter 18B PR 8) — mesh attach metadata          │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼ (rendering engines)
┌──────────────────────────────────────────────────────────────┐
│  Tier 3: Rendering 알고리즘                                    │
│                                                                │
│  - src/plant/LeafGenerator.ts                                  │
│      → buildLeafMeshFromPhytomer(leafOrganState, bladeRef,     │
│        leafletNodes[], ...)                                    │
│      → leaf 호출 (procedural variation)                  │
│                                                                │
│  - src/scene/leaf/ ★ Iter 36 v5                         │
│      → buildCompoundLeaf(bladeRef, leafletNodes[], seed)       │
│      → CompoundLeafDescriptor (shape + lobe + serration + pose)│
│                                                                │
│  - src/scene/SkinMeshPlant.ts                                  │
│      → graph 순회 + 각 leaf-blade-root에서 leaf mesh build      │
│      → SDF + marching cubes (stem family mesh)                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Conservative 분리 원칙 (사용자 결정)

| 영역 | Skeleton | Rendering engine |
|---|---|---|
| 좌표 (pos, rachisU) | ✓ | (read only) |
| Type (4 position) | ✓ | (read only) |
| Sizing (sizeFactor, targetSizeM, leafLengthM) | ✓ | (read only) |
| Preset key (agePreset) | ✓ | (read only) |
| **shape outline** (aspectRatio, baseShape, tipSharpness) | ✗ | ✓ (procedural) |
| **lobe noise** | ✗ | ✓ (procedural) |
| **serration noise** | ✗ | ✓ (procedural) |
| **asymmetry noise** | ✗ | ✓ (procedural) |
| **pose variation** (pitch/roll/twist) | ✗ | ✓ (procedural) |
| Vertex 좌표 | ✗ | ✓ (buildLeafChunkSkin) |

★ Skeleton에 _shape parameter 추가 금지_ — 사용자 Conservative 결정.
★ 모든 procedural variation은 _deterministic seed_ (leaf instance ID) 기반.

---

## Node Type Reference

### Iter 36 v5 신규

#### leaflet-node

각 leaf-blade-root 아래 _per-leaflet_ 위치 표현. 4 position types:

| position | 수 | sizeFactor | botanical 의미 |
|---|---|---|---|
| `terminal` | 1 | 1.0-1.35 | 끝소엽 (가장 크게 눈에 띔) |
| `primary` | 2-8 (1-4 pairs × 좌우) | 0.85-0.55 | 좌우 큰 소엽 (위쪽 더 큼) |
| `secondary` | 0-8 | 0.30-0.40 | primary 근처 작은 소엽 |
| `intercalary` | 0-10 | 0.10-0.34 | 큰 소엽 사이 작은 소엽 |

ID 형식: `n:leaflet:axis{N}:n{leafIdx}:{position}:{counter}`

#### bud-node

겨드랑이 곁순 표현. 4 states (BudState):

| state | activatedAxisId | 의미 |
|---|---|---|
| `dormant` | undefined | 휴면 (시각 marker 표시) |
| `growing` | `e:sideShoot:{N}` | 활성 (sideShoot edge link) |
| `pruned` | undefined | 적심 (시각 marker 다른 색) |

ID 형식: `n:bud:axis{N}:n{nodeIdx}:{counter}`

---

## Helper API

```ts
import { getLeafletNodesByParentLeaf } from '@/plant/skeleton/PlantSkeletonGraph';

// 한 leaf 의 4 position leaflet nodes 조회
const leaflets = getLeafletNodesByParentLeaf(graph, leafBladeRootNodeId);
// → ReadonlyArray<LeafletNodeRef>
```

---

## Related Documentation

- [LEAF_ONTOGENY.md](./LEAF_ONTOGENY.md) — 6단계 botanical model + 코드 매핑
- [LEAF_PRESETS.md](./LEAF_PRESETS.md) — 5 age presets (사용자 §7 reference)
- [LEAF_VARIATION_RULES.md](./LEAF_VARIATION_RULES.md) — correlation rules (사용자 §8)
- [SEMANTIC_GRAPH.md](./SEMANTIC_GRAPH.md) — SSOT #187 skeleton SSOT 원칙
- [MESH_ANCHORS.md](./MESH_ANCHORS.md) — Mesh anchor contract
