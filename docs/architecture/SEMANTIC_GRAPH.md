# Semantic Skeleton Graph (SSOT #187)

> Iter 26 이후 FarmSim의 식물 시각 단일 진실 출처(SSOT)는
> `SemanticSkeletonGraph`이다. 시뮬레이션 데이터(PlantState, PlantBase,
> cultivar JSONC)는 이 graph로 매핑된 뒤, 모든 시각 소비자(Skin, Overlay,
> Acceptance)는 graph만 본다.

본 문서는 graph schema · 데이터 흐름 · 4 원칙 · 새 organ/mesh 추가 절차를
한 곳에서 정의한다.

관련 SSOT:
- [SSOT #185 COORDINATE_SYSTEMS](./COORDINATE_SYSTEMS.md) — 좌표계
- [SSOT #186 MESH_ANCHORS](./MESH_ANCHORS.md) — mesh-local origin 계약
- [SSOT 4.4 / 8 / 180] — `src/plant/skeleton/PlantSkeletonGraph.ts` 헤더 주석

---

## 0. 핵심 4 원칙

> 1. **Skeleton node는 명확한 데이터를 담는다** — 좌표·형태·상태·시각힌트.
> 2. **노드 자체로 시각화될 수 있다** — `node.visualHint`를 그대로 직렬화하면
>    Overlay. 색·shape·label 결정은 graph populator에서 하고, Overlay는
>    그것을 읽기만 한다.
> 3. **시뮬레이션 데이터는 모두 skeleton으로 들어온다** — `PlantState`,
>    `PlantBase`, cultivar JSONC는 `SkeletonPopulator`의 입력일 뿐이며, 그
>    이후 graph가 single source of truth.
> 4. **Skin engine은 단순 시각화만** — graph + style → mesh. biology 모름.
>    `SkinEngineRenderOpts`에서 `plantBase` · `state` 인자가 자체 제거된다
>    (fallback도 없음).

이 4 원칙이 깨지면 **Iter 18~24 leaf disconnect 7번 실패와 동급 위험**.
SSOT #185(좌표계) + #186(mesh anchor) + 본 #187(graph 의미)이 모두 묶여
하나의 안전망이다.

---

## 1. 데이터 흐름 (one-way)

```text
[PlantState · PlantBase · cultivar JSONC]   ← simulation truth (biology)
            │
            ▼  ─────────────── 유일한 simulation → graph 매핑 지점
   SkeletonPopulator
   (src/plant/skeleton/buildTomatoSkeletonGraph.ts)
            │
            ▼
   SemanticSkeletonGraph        ← visual single source of truth
   (nodes + edges + organAnchors + visualHints)
            │
            ├─→ SkinEngine       (graph + style → 3D mesh; biology 모름)
            ├─→ SkeletonOverlay  (node.visualHint 직렬화)
            └─→ AcceptanceProbe  (graph 자체 invariant 검증)
```

규칙:
- `PlantState` / `PlantBase` / cultivar JSONC 직접 참조는 `SkeletonPopulator`
  **단 한 곳에서만** 일어난다. 그 외 모든 시각 경로는 graph를 읽는다.
- 시뮬레이션 tick → populator 재호출 → graph 갱신 → 시각 재렌더. 시각이
  중간에서 biology를 다시 보지 않는다.

이 흐름이 만족되는지는 invariant test로 자동 검증한다
(`tests/architecture/skeleton-populator-isolation.spec.ts` — PR 2-0).

---

## 2. Graph schema

상세 정의는 `src/plant/skeleton/PlantSkeletonGraph.ts`. 본 절은 의미·출처·
사용처를 요약한다.

### 2.1 SkeletonNode

| 필드 | 타입 | 의미 | 출처 | 사용처 |
|---|---|---|---|---|
| `id` | `string` | unique within graph | populator | 모든 참조 |
| `pos` | `V3` (plant-local) | 노드 위치. SSOT #185 INV-01에서 검증 | populator | Skin, Overlay |
| `radius` | `number` | 줄기 표면 반지름 | populator | Skin tube builder |
| `edgeIds` | `string[]` | incident edges | populator | graph traversal |
| `type` | `SkeletonNodeType?` | 식물학적 역할 (13종) | populator (PR 2-1) | Skin, Overlay |
| `frame` | `LocalFrame?` | tangent/normal orthonormal frame | populator (PR 2-1) | mesh orientation |
| `visualHint` | `NodeVisualHint?` | 자기 표현 (color/shape/size/label) | populator (PR 2-1) | Overlay 단독 |

**SkeletonNodeType 13종** (`main-stem-node` · `side-shoot-node` ·
`petiole-root` · `petiole-tip` · `leaf-blade-root` · `truss-root` ·
`peduncle-node` · `rachis-node` · `pedicel-root` · `pedicel-tip` ·
`fruit-root` · `flower-root` · `calyx-root`) — crop-agnostic 출발점. 다른
crop은 union을 확장.

### 2.2 SkeletonEdge

| 필드 | 타입 | 의미 | 출처 | 사용처 |
|---|---|---|---|---|
| `id` / `type` / `startNodeId` / `endNodeId` | (기존) | edge 식별 + 토폴로지 | populator | 모든 참조 |
| `bonePath` | `SkeletonBone[]` | densified centerline capsules | populator | SDF + 마칭큐브 |
| `parentEdgeId` | `string \| null` | cut hierarchy | populator | Phase 5 cut |
| `cuttable` / `semanticLabel` / `attachedOrganIds` | (기존) | UI/legacy | populator | UI |
| `organAnchors` | `OrganAnchor[]?` | non-edge organ 앵커 | populator (PR 2-2) | Skin leaf/fruit |
| `renderPolicy` | `EdgeRenderPolicy?` | 렌더 정책 (radius, junction, material, visual) | populator (PR 2-3) | Skin tube + Overlay |

### 2.3 OrganAnchor (Iter 26 확장)

| 필드 | 타입 | 의미 |
|---|---|---|
| `id` / `kind` / `anchorNodeId` | (기존) | 앵커 식별 |
| `morphology` | `AnchorMorphologyHint?` | static 형태 (sizeFactor, maturity, leafletCount, droopFactor, targetDiameterM, ripeness) — cultivar에서 1회 복사 |
| `state` | `OrganState?` | per-tick simulation 상태 (growthStage, visibility, vigor) — 원칙 3 |
| `chain` | `OrganChain?` | rootNodeId → attachmentNodeId 노드/엣지 chain |
| `visualHint` | `AnchorVisualHint?` | 자기 표현 (markerColor, label, showAttachmentLine) — 원칙 2 |

### 2.4 EdgeRenderPolicy

| 필드 | 의미 |
|---|---|
| `radius.{biological, render, min}` | biology truth + render floor (mm 0.8 등) |
| `junction.{embedDepthM, radialDir, parentContext}` | 부모 줄기 표면 정합 정보. `parentContext`는 `StemFamilyTubeNetworkBuilder.stats.parentContextByEdgeId`와 동일 schema |
| `material.role` | 셰이더/텍스처 선택 (`main-stem`, `petiole`, …) |
| `visualHint.{color, lineWidth}` | overlay line 표현 — 원칙 2 |

---

## 3. SkeletonPopulator 책임

`buildTomatoSkeletonGraph(plantBase, opts)` 가 유일한 simulation → graph
매핑 지점. 다음을 모두 수행:

1. node 생성 + `pos`(plant-local) · `radius` · `edgeIds` 채움.
2. node `type` 부여 (식물학적 역할).
3. node `frame` 계산 (tangent + normal).
4. node `visualHint` 매핑 (type별 default — main stem 갈색 sphere 6mm 등).
5. edge 생성 + bonePath · parentEdgeId · semanticLabel.
6. edge `renderPolicy` 채움 (`radius`, `junction.parentContext`,
   `material.role`, `visualHint`).
7. `organAnchor`의 `morphology` · `state` · `chain` · `visualHint` 채움
   (PlantBase / PlantState에서 복사).

이후 Skin/Overlay/Acceptance는 graph만 본다. populator 외 simulation
참조는 자동 isolation test가 catch (PR 2-0).

---

## 4. Skin 계약 (원칙 4)

`SkinEngineRenderOpts` 시그니처:

```ts
interface SkinEngineRenderOpts {
  graph: PlantSkeletonGraph;
  style: SkinStyle;
  scene: Scene;
  // plantBase / state 인자 없음 — biology 모름.
}
```

`SkinMeshPlant`에서 `defaultSkinEngine.render({ graph, style, scene })`
하나만 호출. 디버그용 dock probe 등 PlantBase가 필요한 코드는 별도 함수
(`createDockingDebugProbe(graph, plantBase)`)로 분리하며 Skin 본 경로에
없다.

invariant:
- `src/twin/SkinMeshPlant.ts`에서 SkinEngine 호출 인자에 `plantBase` 0건.
- `src/plant/skin/**` 전역에서 PlantBase / PlantState import 0건.

`tests/architecture/skin-engine-graph-only.spec.ts` (PR 5-1)에서 자동 검증.

---

## 5. Overlay 계약 (원칙 2)

`SkeletonOverlay`는 graph를 받아 다음을 그릴 뿐:

```ts
for (const node of graph.nodes) {
  if (!node.visualHint) continue;
  drawMarker(node.pos, node.visualHint);
}
for (const edge of graph.edges) {
  drawLine(edge.bonePath, edge.renderPolicy?.visualHint);
}
for (const anchor of allAnchors(graph)) {
  drawCircle(anchor.anchorNodeId, anchor.visualHint);
}
```

invariant:
- `src/twin/SkeletonOverlay.ts`에서 hex color 리터럴 0건 (모두 visualHint에서 옴).
- marker shape · label · arrow 표시 여부도 visualHint 기반.

색·라벨 변경 = populator에서 visualHint를 다른 값으로 채우면 끝.

---

## 6. 새 organ / mesh 추가 절차

기존 mesh anchor 절차(SSOT #186)에 더해 graph 표현 작성이 필요하다.

1. **SkeletonNodeType union 확장** (`PlantSkeletonGraph.ts`).
2. **node.visualHint default 매핑** 추가 (populator).
3. **organ anchor kind 추가** (필요 시) — `OrganAnchorKind` union + populator.
4. **`AnchorMorphologyHint` 확장** — 새 organ-specific 필드.
5. **`material.role` 추가** (edge 동반 시).
6. **Populator에서 morphology · state · chain · visualHint populate**.
7. **Skin consumer에 분기 추가** — graph만 보고 render.
8. **invariant test 갱신**:
   - `semantic-graph-population.spec.ts` — 신규 type 채워짐 확인
   - `anchor-completeness.spec.ts` — 신규 anchor 완성도
9. **본 문서의 schema 표 갱신**.

---

## 7. History

- Iter 26 PR 1-1 — `SkeletonNode.type/frame/visualHint` schema 도입.
- Iter 26 PR 1-2 — `OrganAnchor.morphology/state/chain/visualHint` schema.
- Iter 26 PR 1-3 — `EdgeRenderPolicy` schema.
- Iter 26 PR 1-4 — 본 문서 (SSOT #187).
- Iter 26 PR 2-0 — `SkeletonPopulator` isolation test.
- Iter 26 PR 2-1~2-3 — populate.
- Iter 26 PR 3-1~3-2 — Skin read path 전환.
- Iter 26 PR 4-1~4-2 — Overlay = visualHint 직렬화.
- Iter 26 PR 5-1 — SkinEngine API 정화 + graph-only acceptance.

---

## 8. 검증

자동 invariant tests (`tests/architecture/`):

| Test | 검증 대상 | 도입 PR |
|---|---|---|
| `coordinate-contracts.spec.ts` (#185) | 좌표계 invariant | Iter 25 |
| `mesh-anchor-contracts.spec.ts` (#186) | mesh-local origin | Iter 25 |
| `skeleton-populator-isolation.spec.ts` (#187) | populator 외 sim 참조 0 | PR 2-0 |
| `semantic-graph-population.spec.ts` (#187) | 모든 node type+frame+visualHint | PR 2-1 |
| `anchor-completeness.spec.ts` (#187) | 모든 anchor morphology+state+chain+visualHint | PR 2-2 |
| `skin-engine-graph-only.spec.ts` (#187) | Skin에서 plantBase 0 참조 | PR 5-1 |

총 6 hard invariant — 4 원칙이 깨지면 즉시 적색.
