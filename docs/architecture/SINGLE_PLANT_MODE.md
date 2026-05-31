# Single-Plant Mode (★ Default)

Iter 35 이후 FarmSim의 _유일한 mode_. 추후 multi-plant 확장 가능 (Iter 36 slider).

## 진입

URL 빈 경우 (또는 `#lobby` / `#greenhouse` 등 legacy hash 시도 시 모두) 자동
single-plant 진입. `AppMode` union = `'single-plant'` only.

```ts
// src/store/twinStore.ts:10
export type AppMode = 'single-plant';

function readModeFromHash(): AppMode {
  return 'single-plant';
}
```

## 흐름

```
App.tsx
  → BootOverlay (사용자 결정: 부팅 검은 화면 회피)
  → NotificationCenter + ErrorModal
  → GreenhouseLayout (★ Phase G에서 SinglePlantApp.tsx로 rename 예정)
    → SceneCanvas → BabylonEngine
      → buildSceneInfrastructure (D layer)
        → GrowthEngine (B layer, 1 plant)
        → ShowcasePlant + SkinMeshPlant (D layer)
        → ground mesh
      → runRenderLoop (60Hz)
  → SinglePlantOverlay
    → FloatingTopBar / PARGauge / MetricsTray / BottomPlaybackBar / ...
    → useEffect [minute, useImplicitMesh]:
      engine.simulatePlantToMinute(SHOWCASE_SEED, minute)
      → showcase.update(day, physiology)
      → skinMesh.update(day, physiology) (useImplicitMesh on 시만)
```

## 잎 mesh canonical pipeline

`docs/architecture/LEAF_RENDER_FLOW.md` 참조. 요약:

```
PlantBase.tick (Pass 3 in B layer)
  → PhytomerNode.leaf : LeafOrganState
  → SkeletonGraph populator → OrganAnchor (leaf_blade)
    R26 contract: anchor.rotation = makeLeafQuaternion(edge.bonePath[last] tangent, WORLD_UP)
  → SkinMeshPlant per-leaf loop:
      buildLeafMeshFromPhytomer(phytomer.leaf, ...)
      mesh.position = anchor.position
      mesh.rotationQuaternion = anchor.rotation
  → Babylon Mesh
```

## Multi-plant 확장 (Iter 36)

Iter 35에서 _API만_ 추가:

```ts
// src/ui/single-plant/useSinglePlantState.ts
let showcasePlants: ShowcasePlantHandle[] = [];

export function setSinglePlantShowcaseRef(ref: ShowcasePlantHandle | null, index = 0): void
export function getSinglePlantShowcase(index = 0): ShowcasePlantHandle | null
export function getSinglePlantCount(): number

// src/store/twinStore.ts
singlePlantCount: number;  // 1, Iter 36 slider 1~64
setSinglePlantCount(n: number): void;
```

Iter 36 작업:
- slider UI 추가 (1~N)
- SinglePlantApp 다중 mount + grid layout
- 각 plant 독립 ShowcasePlant + SkinMeshPlant instance
- seed 자동 분배

## Loading

사용자 결정 (Iter 35 plan AskUserQuestion):
- **BootOverlay 보존** — 부팅 검은 화면 회피
- **ProgressiveLoad 제거** — 즉시 quality 적용 (freeze 허용)
- **BusyIndicator 제거** — corner spinner 부재 (300ms+ scrub freeze)

## Archived (Iter 35 제거)

`src/_archive/`:
- `ui/` — ModeLobby, BusyIndicator, ComingSoonPanel (3 files)
- `twin/` — GreenhouseContent, SupportingPlant, Heatmap, Robot, PathTrail,
  PlantLODManager, CocopeatBags, CocopeatBagTexture, GroundTexture, BedStands,
  TubeRail, ZonePicker, SemanticOverlay (12 files) + GreenhouseScene + ProgressiveLoad
- `components/` — TopBar, LabelOverlay, LayerDock, AnalysisPanel, TimelinePanel,
  PatrolMap, CaptureThumbs, PointCloudPreview (8 files)

총 **24 files**. 복원: `git mv src/_archive/<path> src/<path>` + tsconfig exclude 갱신.

## 관련 docs

- [`LAYER_STRUCTURE.md`](./LAYER_STRUCTURE.md) — 5 layer 정의
- [`LEAF_RENDER_FLOW.md`](./LEAF_RENDER_FLOW.md) — leaf mesh build flow
- [`../iter35-candidates.md`](../iter35-candidates.md) — Iter 36+ 후보
- [`../../src/_archive/README.md`](../../src/_archive/README.md) — archive 카테고리
