# FarmSim Layer Architecture (Iter 35+)

> ★ 코드 위치 결정 시 본 문서 _먼저_ 읽기.
> `tests/architecture/iter35-layer-boundary.spec.ts` 가 invariant 자동 검증.

## 5 Layer

### A. Algorithms (pure math/geometry)

`packages/tomato-geometry/src/`
- Vec3/Mat4/Quat 연산
- Bezier/Catmull-Rom
- GeoChunk algorithms (leafChunk, internodeChunk, ...)

★ **Babylon import 금지** — 순수 수학/기하만.

### B. Growth Engine (생장 + 생육 — state evolution)

`packages/tomato-engine/src/`
- `GrowthModel.ts` (Pass 1~4 daily step)
- `growth/LeafGrowthModel.ts`, `PhytomerModel.ts`, ...
- `Cultivar/Genome/ThermalTime`

★ **Babylon import 금지** — A layer import 허용 (type만).

생장 (growth, area/length 증가) + 생육 (development, lifecycle stage) 둘 다 본 layer에서 처리. 코드상 같은 `GrowthEngine`에서 Pass 3 main loop이 둘 다 진행.

### C. Plant Base (biology → geometry cache)

`src/plant/`
- `PlantBase.ts` (axes/leaves/trusses positions cache)
- `skeleton/` (graph, populator, R26 contract)
- `leaf/` (organ graph, schema)
- `coordinates/`, `anchors/` (math utilities)

★ **Babylon import 금지** — A + B layer import 허용.

#### Iter 36+ migration 후보 (현재 일부 Babylon import 잔존)

| File | 상태 | 처리 |
|---|---|---|
| `LeafTexture.ts` | Babylon Scene/RawTexture import | Iter 36에 `src/rendering/leaf/` 이동 |
| `LeafGenerator.ts` | Babylon Material/Mesh import | Iter 36에 `src/rendering/leaf/` 이동 |
| `TrussGenerator.ts` | Babylon TransformNode/Mesh | Iter 36에 `src/rendering/truss/` 이동 |
| `leaf/material/getLeafBladeMaterial.ts` | Babylon Material | Iter 36 이동 |
| `leaf/buildLeafBladeMesh.ts` | Babylon Mesh | Iter 36 이동 |
| `leaf/devHook.ts` | dev tool | 이동 |
| `skin/buildPlantSkinMesh.ts` | Babylon Scene | Iter 36 이동 |
| `skin/SkinEngine.ts` | Babylon | Iter 36 이동 |
| `skin/StemFamilyTubeNetworkBuilder.ts` | Babylon Mesh | Iter 36 이동 |
| `skeleton/buildTomatoSkeletonGraph.ts` | `catmullRomPath` import (path math만) | type-only 가능 검토 |
| `anchors/leafAnchor.ts` | `import type Mesh` (type only) | 허용 |
| `coordinates/` | `Vector3` value | 검토 |

Iter 35: **`StemGenerator` + `FruitGenerator`만** 이동 완료. 나머지 13 files는 Iter 36+ 일괄 migration.

### D. Rendering Engine (Babylon mesh output)

`src/rendering/`
- `BabylonEngine.ts` (engine init, render loop)
- `SceneInfrastructure.ts` (scene setup — ground + GrowthEngine + Showcase + SkinMesh)
- `SceneSetup.ts` (조명, IBL, SSAO)
- `ShowcasePlant.ts` (Babylon mesh of showcase plant)
- `SkinMeshPlant.ts` (canonical leaf mesh — SDF + marching cubes + per-leaf wrapper)
- `SkeletonOverlay.ts` (debug visualization)
- `CameraRig.ts`, `RenderQuality.ts`, `QualityProbe.ts`
- `dockingOverlay/` (petiole junction debug)
- `stem/StemGenerator.ts` (Iter 35 Phase E ← `src/plant/`)
- `fruit/FruitGenerator.ts` (Iter 35 Phase E ← `src/plant/`)

★ **Babylon 자유**. A + B + C layer import 허용.

### E. JSON Params (configuration)

`packages/tomato-engine/models/`
- `cultivars/*.jsonc` (5 cultivar files: tomimaru-muchoo, round-generic, cherry-generic, beef-generic, sansoo)
- `calibration/*.jsonc`

★ B layer가 _consume_. 코드 변경 없이 cultivar 추가/조정.

## Import 금지 규칙 (enforcement)

```
A → 없음 (pure)
B → A (types)
C → A, B (types)
D → A, B, C
E → 없음 (data)
```

위반 시 `tests/architecture/iter35-layer-boundary.spec.ts` `LAYER-*` invariant fail.

## Entry Point (single-plant)

```
App.tsx → SinglePlantApp (구 GreenhouseLayout)
       → SceneCanvas → BabylonEngine
       → buildSceneInfrastructure (D)
         → GrowthEngine (B)
         → ShowcasePlant + SkinMeshPlant (D)
       → SinglePlantOverlay (UI)
```

## 생장 vs 생육

- **생장 (growth)**: area/length 증가
  - `LeafGrowthModel.currentAreaCm2`
  - `InternodeGrowthModel.lengthM`
  - `FruitModel.diameter`
- **생육 (development)**: lifecycle stage 전환
  - `PhytomerModel` TT thresholds
  - `SenescenceModel` (잎 노화)
  - `FlowerModel` (anthesis)

같은 `GrowthEngine` 안에서 둘 다 처리 (B layer Pass 3 main loop).

## Archive (Iter 35 제거)

`src/_archive/` — 24 files. 복원 절차 + 카테고리는 `src/_archive/README.md` 참조.

## 관련 docs

- `LEAF_RENDER_FLOW.md` — leaf mesh build canonical pipeline
- `SINGLE_PLANT_MODE.md` — 기본 모드 진입/구조
- `COORDINATE_SYSTEMS.md` — 4 좌표계 정의
- `MESH_ANCHORS.md` — mesh anchor contract
