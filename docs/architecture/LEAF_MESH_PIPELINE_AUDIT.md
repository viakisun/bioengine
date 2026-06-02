# Leaf Mesh Pipeline Audit — Phase L2-0 (Iter 39)

> **Status**: audit complete. L2-1 LeafMeshBuilder refactor 진입 정당화.
> 산출: 4 sections (production / fallback / dead code / L2-3 진입 근거).

## ★ Why this audit

L1-B (`S6` centroid anchor) 완료 후 사용자 close-up 재검토:
> "잎 메시 complexity가 너무 부족, 단조롭다기보다 멍청하고 못생김."
> "이 모든 파일이 다 그런 역할? 통합 잘하는게 좋지 않나?"

진단 전제: 현재 _하나의 leaflet mesh_ 생성에 _13 파일이 협력_. 변경 시
_4-5 파일 추적_. L2 refactor의 _명분_을 audit으로 확정.

## ★ Section 1 — Production canonical path

`SkinMeshPlant.ts:799` — **유일 호출처** (grep 확인).

```
SkinMeshPlant.ts:799
  └─ buildLeafletMeshes (src/scene/leaf-engine/buildLeafletMeshes.ts:90)
     ├─ buildShapeProfile  (leaf-engine/shapeProfile.ts)
     ├─ lobeNoise          (leaf-engine/lobeNoise.ts)
     ├─ serrationNoise     (leaf-engine/serrationNoise.ts)
     ├─ AGE_PRESETS        (leaf-engine/agePresets.ts)
     ├─ applyCorrelation   (leaf-engine/correlationRules.ts)
     ├─ buildLeafletPlaneChunk (@farmsim/tomato-geometry/leafletPlaneChunk.ts)
     └─ normalizeLeafMeshVertices (anchors/leafAnchor.ts, L1-B centroid)
```

**의존 11 imports** (Babylon 4 + leaf-engine 6 + tomato-geometry 1):
- `@babylonjs/core/{scene, Meshes/mesh, Meshes/mesh.vertexData, Maths/math.vector}`
- `@farmsim/tomato-engine` (SeededRandom type)
- `@farmsim/tomato-geometry` (buildLeafletPlaneChunk)
- `../../plant/skeleton/AnchorTransform` (makeLeafQuaternion)
- `../../plant/anchors` (normalizeLeafMeshVertices)
- `./{shapeProfile, lobeNoise, serrationNoise, agePresets, correlationRules}`

## ★ Section 2 — Fallback / legacy path (0% 보장)

`SkinMeshPlant.ts:825` (else branch, `bladeRef || leafletSkeletonNodes.length > 0`
false 시):

```
SkinMeshPlant.ts:825 (else branch)
  └─ LeafGenerator.buildLeafMeshFromPhytomer (LeafGenerator.ts:160)
     └─ buildLeafChunkSkin (@farmsim/tomato-geometry/leafChunk.ts:303)
        └─ createOvateLeaflet (leafChunk.ts:473)
```

**0% live usage 보장**:
- `tests/architecture/iter33-leaf-render-live.spec.ts:LEAF-LIVE-FALLBACK-NEVER-01`
- Iter 33 V1 contract: populator가 100% phytomer-bind → else branch _진입 불가_.

**L2-2 deprecate 후보**.

## ★ Section 3 — Dead code candidate

`LeafGenerator.createLeafMesh` (line 99): **호출처 0** (grep 확인).

- 주석 (line 95): "Legacy positional-args wrapper — 29 static neighbor
  plants in GreenhouseScene where there's no NodeState. Group 3 replaces
  those with GrowthEngine-driven Light LOD plants."
- 실제 grep:
  - `createLeafMesh\b`: LeafGenerator.ts:99 (정의) + 0 호출처
  - `ShowcasePlant` 검색: TrussGenerator/LeafGenerator/PlantBase 주석만 — `createLeafMesh` 호출 _없음_
  - 외부 import `createLeafMesh`: 0

**L2-2에서 safe removal 또는 `@deprecated`**.

## ★ Section 4 — L2-3 진입 근거 ★ (L2 명분 핵심)

`leafletRef` fields 실제 mesh 산식 활용 (`buildLeafletMeshes.ts`):

| field | line | 활용 | 영역 |
|---|---|---|---|
| `targetSizeM` | 146 | `lengthM` 직접 사용 | shape 크기 ✓ |
| `bladeDir` | 212 | `makeLeafQuaternion` base rotation | pose ✓ |
| `position` | **187, 197** | `isTerminal = position === 'terminal'` flag + mesh name suffix | shape **차별화 거의 없음** ⚠ |
| `parentLeafNodeId` | (SkinMeshPlant) | leafletNodes 그룹화 | grouping ✓ |

**결론**: skeleton은 terminal / primary / intercalary를 _알고 있다_. 그러나
mesh 산식은 _terminal flag 하나만_ 사용. primary와 intercalary가 _같은_ ovate
profile + 같은 lobe/serration 산식 적용 → 모든 leaflet이 _같은 인상_ →
사용자 본 "단조롭고 못생긴 잎".

### L2 정당화

L2의 _구조적_ 명분:
> Skeleton-Render 책임 분리에서, _shape differentiation_이 빠진 구조.
> 모든 leaflet이 같은 ovate profile에 같은 lobe/serration 산식 적용.

L2-3 PROFILE_BY_POSITION이 _구조적 fix_ — terminal/primary/intercalary/secondary
각각 widthRatio, lobeDepth, serrationAmp, tipSharpness, baseTaper가 _달라지는_
shape profile. skeleton의 position 정보를 _실제로 활용_.

## ★ L2-1 LeafMeshBuilder refactor basis

audit 결과 기반 L2-1 산식 통합 대상:

```
LeafMeshBuilder.ts (신규)
  └─ buildLeafMeshFromSkeleton(input): GeoChunk
     └─ buildLeafMeshDescriptorFromSkeleton(input)  ← leaf-level
     └─ for each leaflet:
        └─ buildLeafletMeshPatch(leaflet)
           └─ buildLeafletOutlineProfile(leaflet)   ← L2-3 진입점
           └─ buildLeafletOutline(profile)
           └─ buildLeafletPlaneChunk(outline)
           └─ applyLeafletPose(chunk, leaflet.pose)
     └─ mergeLeafletPatches(patches)
```

책임 분리 (active 원칙 #39 도입):
- `LeafMeshBuilder` = 잎 생김새 결정 (pure mesh algorithm)
- `LeafGenerator` = Babylon Mesh / Material / Texture wrapper

## ★ L2-2 deprecate 후보

- `LeafGenerator.createLeafMesh` — 호출처 0 → safe removal
- `LeafGenerator.buildLeafMeshFromPhytomer` — fallback path → `@deprecated` (Section 2)
- `@farmsim/tomato-geometry/leafChunk.ts` (buildLeafChunkSkin + createOvateLeaflet)
  → `@deprecated` (fallback 의존만)
- `@farmsim/tomato-geometry/leafletPlaneChunk.ts` (buildLeafletPlaneChunk) — production
  의존 → L2-2c import migration 시점 inline 또는 LeafMeshBuilder 내부 흡수

## ★ Next

→ L2-1 LeafMeshBuilder.ts 신규 (`S8`). REFACTOR-PARITY-01 tolerance 기반
검증.
