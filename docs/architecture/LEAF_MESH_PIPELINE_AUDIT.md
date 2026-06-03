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
  └─ buildLeafletMeshes (src/scene/leaf/buildLeafletMeshes.ts:90)
     ├─ buildShapeProfile  (leaf/shapeProfile.ts)
     ├─ lobeNoise          (leaf/lobeNoise.ts)
     ├─ serrationNoise     (leaf/serrationNoise.ts)
     ├─ AGE_PRESETS        (leaf/agePresets.ts)
     ├─ applyCorrelation   (leaf/correlationRules.ts)
     ├─ buildLeafletPlaneChunk (@farmsim/tomato-geometry/LeafletPlaneChunk.ts)
     └─ normalizeLeafMeshVertices (anchors/leafAnchor.ts, L1-B centroid)
```

**의존 11 imports** (Babylon 4 + leaf 6 + tomato-geometry 1):
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

## ★ L2-2 deprecate 후보 + 진행 상태

| 대상 | sub-phase | 상태 |
|---|---|---|
| `LeafGenerator.createLeafMesh` | L2-2c (S11) safe removal | ✓ @deprecated (S9) |
| `LeafGenerator.buildLeafMeshFromPhytomer` | L2-2c (S11) 또는 L2-2d (S12) | ✓ @deprecated (S9) |
| `tomato-geometry/leafChunk.buildLeafChunkSkin` | L2-2c/d | ✓ @deprecated (S9) |
| `tomato-geometry/leafChunk.buildLeafChunkLegacy` | L2-2c/d | ✓ @deprecated (S9) |
| `tomato-geometry/LeafletPlaneChunk.buildLeafletPlaneChunk` | _NOT deprecated_ | production canonical 의존 |

## ★ L2-2b: usage 0 confirm (S10)

L2-2a (`S9`) JSDoc `@deprecated` 적용 후 정적 + 동적 검증:

### 정적 (grep 재확인)
```
grep "createLeafMesh\b" → LeafGenerator.ts:99 (정의) only
grep "buildLeafChunkLegacy" → LeafGenerator.ts:111 (createLeafMesh 내부) only
grep "buildLeafChunkSkin" → LeafGenerator.ts:275 (buildLeafMeshFromPhytomer 내부) only
grep "buildLeafMeshFromPhytomer" → SkinMeshPlant.ts:825 (else fallback) only
```

→ **외부 호출처 0**. dead code chain 완전 보장.

### 동적 (existing spec)
- `LEAF-LIVE-FALLBACK-NEVER-01` (iter33-leaf-render-live.spec.ts): production
  fallback 진입 시 즉시 fail. 현재 _PASS_ → fallback 0% live.
- `REFACTOR-PARITY-01` (L2-1): L2-2a `@deprecated` 추가 후에도 metrics 동일
  (118 leaves × 144 verts). visual change 0.

## ★ L2-2c: Next — import migration / safe removal (S11)

- `LeafGenerator.createLeafMesh` + `buildLeafChunkLegacy` chain — 호출처 0 이므로
  _바로 제거 안전_.
- `LeafGenerator.buildLeafMeshFromPhytomer` + `buildLeafChunkSkin` chain —
  fallback path 0% live 보장이지만 _보존_ (안전 catch용).
- 단계: S11 = createLeafMesh + buildLeafChunkLegacy 제거 only. fallback path는
  L2-2d (`S12`)에서 별도 결정.

## ★ L2 Phase 완료 (S7~S17)

L2 commits 10개 (S12 skip). 첫 단계 SSOT — canonical entry _이름_ + position
차별화 + cap taper + resolution flag + variation. **그러나 산식 통합은 미달성**:

- LeafMeshBuilder.ts 44줄 (thin wrapper, `return buildLeafletMeshes(input)` 한 줄)
- 산식 _여전히_ 13 파일 흩어짐
- buildLeafletMeshes가 Babylon Mesh[] 반환 (pure algorithm에 Babylon 의존 섞임)
- fallback path 보존 (S12 skipped)

→ L3 (True Consolidation) 진입.

## ★ L3-0 Audit — L2 후 현재 의존 그래프 (S18)

### Production canonical path (현재)

```
SkinMeshPlant.ts:799
  └─ buildLeafMeshFromSkeleton(ctx)             [LeafMeshBuilder.ts:54 ★ thin wrapper]
     └─ buildLeafletMeshes(ctx)                  [buildLeafletMeshes.ts:90]
        ├─ AGE_PRESETS[bladeRef.agePreset]       [agePresets.ts]
        ├─ applyCorrelation(...)                 [correlationRules.ts]
        ├─ for each leaflet:
        │  ├─ applyPositionProfile(...)          [LeafletProfile.ts]
        │  ├─ buildShapeProfile({samples})       [shapeProfile.ts]
        │  ├─ for each row:
        │  │  ├─ lobeNoise(...) * endpointTaperWeight(t)  [lobeNoise.ts + LeafletProfile.ts]
        │  │  └─ serrationNoise(...) * endpointTaperWeight(t)  [serrationNoise.ts]
        │  ├─ buildLeafletPlaneChunk(profile)    [packages/tomato-geometry/LeafletPlaneChunk.ts]
        │  ├─ normalizeLeafMeshVertices(chunk)   [anchors/leafAnchor.ts]
        │  └─ new Mesh + position + rotation     ★ Babylon API
        └─ return Mesh[]                          ★ Babylon Mesh, pure algorithm 아님

LeafGenerator.ts (별도)
  └─ getLeafMaterial (PBR + texture + WebGPU/WebGL fallback)
  └─ @deprecated buildLeafMeshFromPhytomer (fallback, 0% live)
```

### L3 sub-phase 별 제거/이동 대상

#### L3-A (S19) — Dead Code 제거

| 대상 | 위치 | 줄 |
|---|---|---|
| `buildLeafMeshFromPhytomer` 함수 | LeafGenerator.ts:163 | ~120 |
| `leafStageInfoFromOrganState` helper | LeafGenerator.ts:285 | ~50 |
| `bakeLeafVertexColors` (fallback 의존) | LeafGenerator.ts:66 | ~30 |
| `MATURE_R/G/B` constants | LeafGenerator.ts:79 | ~5 |
| `buildLeafChunkSkin` 함수 | packages/tomato-geometry/leafChunk.ts:303 | ~3 |
| `buildLeafChunkLegacy` 함수 | leafChunk.ts:113 | ~190 |
| `createOvateLeaflet` 함수 | leafChunk.ts:473 | ~150 |
| `buildLeafBladeOnly` 함수 | leafChunk.ts:280 | ~120 |
| leafChunk.ts 의존 imports/types | leafChunk.ts:1-105 | ~110 |
| SkinMeshPlant.ts:822-835 else branch | SkinMeshPlant.ts | ~15 |

**총 ~793줄 제거**. 위험 낮음 — LEAF-LIVE-FALLBACK-NEVER-01이 0% live 보장.

#### L3-B (S20) — LeafletPlaneChunk 이동

`packages/tomato-geometry/src/LeafletPlaneChunk.ts` (~200줄) → `src/scene/leaf/`:
- import paths: `@farmsim/tomato-geometry` → `./LeafletPlaneChunk` (1 callsite buildLeafletMeshes.ts)
- packages/tomato-geometry/src/index.ts export 제거

**0줄 변동** (이동만). tomato-geometry는 cotyledon/stem/truss만 보유.

#### L3-C (S21~S24) — 산식 inline to LeafMeshBuilder

순서 (간단 → 복잡):

| commit | 대상 | 줄 | dep |
|---|---|---|---|
| **S21** | `lobeNoise.ts` (34) + `serrationNoise.ts` (31) | 65 | 의존 없음 |
| **S22** | `shapeProfile.ts` (79) | 79 | 의존 없음 |
| **S23** | `agePresets.ts` (139) + `correlationRules.ts` (158) | 297 | resolved 산출 의존 |
| **S24** | `leafInstanceProfile.ts` (99) + `poseVariation.ts` (68) | 167 | macro variation |

각 commit:
- 함수 _이동_ + 원본 파일 _삭제_
- buildLeafletMeshes import migration
- index.ts re-export 제거
- REFACTOR-PARITY-01 strict PASS

#### L3-D (S25) — LeafletPlaneChunk + buildLeafletMeshes inline

L3-B 후 LeafletPlaneChunk.ts (~200줄) + buildLeafletMeshes.ts (~250줄) 모두
LeafMeshBuilder.ts inline.

이 시점 LeafMeshBuilder.ts = ~700-900줄 monolithic 진입점.

#### L3-E (S26) — 사용자 v3 sketch 함수 분해

```ts
export function buildLeafMeshFromSkeleton(input): GeoChunk {
  const descriptor = buildLeafMeshDescriptor(input);
  const patches = descriptor.leaflets.map(buildLeafletMeshPatch);
  return mergeLeafletPatches(patches);
}

function buildLeafMeshDescriptor(input): MeshDescriptor;
function buildLeafletMeshPatch(leaflet): GeoChunk;
function buildLeafletOutline(profile): OutlinePoints;
function buildLeafletPlaneChunkInternal(outline): GeoChunk;
function applyLeafletPose(chunk, pose): GeoChunk;
function mergeLeafletPatches(patches): GeoChunk;
```

각 함수 50-150줄, 단일 책임. _분해만_, visual change 0.

#### L3-F (S27) — GeoChunk 분리

`buildLeafMeshFromSkeleton` 반환 타입: `Mesh[]` → `GeoChunk[]`.

Babylon Mesh 변환은 `LeafGenerator.wrapLeafChunksAsMeshes(chunks)` 신규 함수에서:
- new Mesh + VertexData + material + rotation + computeWorldMatrix
- 기존 `buildLeafletMeshes`의 Babylon 부분 이동

이후:
- LeafMeshBuilder.ts: `import { Mesh } from '@babylonjs/core'` _제거_
- LeafGenerator.ts: `wrapLeafChunksAsMeshes` + getLeafMaterial

**원칙 #39 완전 달성** — pure mesh algorithm vs Babylon wrapper 분리.

## ★ L3 후 예상 디렉터리

```
src/scene/leaf/
  LeafMeshBuilder.ts             ~700-900줄  ← SSOT
  LeafletProfile.ts      ~150줄
  index.ts                       ~30줄

src/plant/
  LeafGenerator.ts               ~200줄      ← Babylon wrapper
  anchors/leafAnchor.ts          ~130줄      ← L1-B centroid (이미 분리)

packages/tomato-geometry/
  leafChunk.ts                    삭제 (L3-A)
  LeafletPlaneChunk.ts            삭제 (L3-B/D)
  cotyledon/stem/truss만 보유
```

## ★ Next

→ L3-A (`S19`) dead code 제거 진행.



---

# L4 — Multi-Crop Data-Driven Engine (Iter 39 Phase L4 v4, commits S28~S37)

> L3 산식 SSOT 완성 후, _연구자 JSON 실험_ 요구로 진행. Engine purity +
> data layer 분리 + Zod + LeafEngine namespace + 5 신규 invariants.

## ★ L4 후 디렉터리 (최종)

```
src/scene/leaf/           ← Engine (plant-agnostic — 'tomato' 단어 0)
  LeafEngine.ts             ← createLeaf + wrapAsMeshes + materials (facade)
  LeafSpec.ts               ← Zod schema + parseLeafSpec + resolveCultivar
  LeafMeshBuilder.ts        ← mesh 산식 SSOT (spec parameter 주입)
  LeafletPlaneChunk.ts      ← vertex grid
  LeafletProfile.ts         ← position profile (signature change: profileByPosition param)
  LeafAnchor.ts             ← L1-B centroid (이동 from src/plant/anchors)
  LeafMaterial.ts           ← Babylon wrapper (이름 LeafGenerator → LeafMaterial)
  LeafTexture.ts            ← 이동 from src/plant + dead code -23줄
  index.ts                  ← barrel

src/data/leaf/            ← Data layer (botanical JSON + registry)
  index.ts                  ← getLeafSpec(name) + cache
  manifest.json             ← registry meta
  specs/
    tomato.json             ← Solanum lycopersicum + 5 agePresets + 4 profileByPosition + correlation/pose/cultivar
  README.md                 ← 연구자 가이드
```

## ★ L4 commit summary (S28~S37)

- **S28 L4-0** (`08a5e76`) folder rename + PascalCase + sed import migration
- **S29 L4-1** (`aeac01e`) LeafGenerator → LeafMaterial + LeafTexture 이동 (dead code -23줄)
- **S30 L4-2** (`1d20dbe`) leafAnchor.ts → LeafAnchor.ts (engine 폴더로)
- **S31 L4-3** (`023470a`) npm i zod + LeafSpec.ts (강화 schemas)
- **S32 L4-4** (`b84c90c`) src/data/leaf/specs/tomato.json + registry index.ts + README
- **S33 L4-5** (`5709eda`) ★ 산식 spec parameter — `applyCorrelation(rules, ...)`,
  `applyPositionProfile(profileByPosition, ...)`, `applyLeafletPose(poseRules, ...)`,
  buildLeafShapeDescriptor reads ctx.spec
- **S34 L4-6** (`807f4c5`) LeafEngine namespace facade (createLeaf/wrapAsMeshes/getMaterial)
- **S35 L4-7** (`b36b410`) Caller migration — SkinMeshPlant → LeafEngine.createLeaf API
- **S36 L4-8** (`eced824`) 5 신규 architecture invariants
- **S37 L4-9** docs (LEAF_ENGINE.md + manifest 갱신)

REFACTOR-PARITY-01 strict — 모든 commit. visual change 0.

## ★ L4 후 호출 그래프 (data-driven)

```
SkinMeshPlant.ts
  └─ const spec = getLeafSpec('tomato.json')          ← data layer (Zod 검증)
  └─ LeafEngine.createLeaf(spec, node, graph, options)
     └─ resolveCultivar(spec, options.cultivar)        ← spec.cultivars lookup
     └─ buildLeafMeshFromSkeleton({spec, ...ctx})      ← engine 진입
        └─ ctx.spec.agePresets[bladeRef.agePreset]
        └─ ctx.spec.correlationRules (intercalaryComplexityExponent, serrationFreqBase/Slope, asymmetryBase/Slope, jitter)
        └─ ctx.spec.profileByPosition (terminal/primary/intercalary/secondary)
        └─ ctx.spec.poseRules (foldDroopDeg{Base,Slope}, leafletJitterPercent, pitch/roll/twistNoiseRange)
        → pure LeafMeshPatch[] (Babylon 의존 0)
  └─ LeafEngine.wrapAsMeshes(patches, scene) → Babylon Mesh[]
```

→ 연구자가 `src/data/leaf/specs/tomato.json` 수정만으로 실험 가능. Engine 변경 0.
