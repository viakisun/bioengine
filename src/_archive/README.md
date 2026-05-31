# src/_archive/

Iter 35에서 archive된 코드. 사용자 결정: single-plant 단일 mode + greenhouse mode
부속 코드 전부 제거 (lobby/loading/zone/heatmap/robot/path 등).

**TS compile에서 제외** — `tsconfig.json` `"exclude": ["src/_archive"]`.
**Bundle에서 제외** — Vite는 import되지 않은 파일을 dead code로 제외.

복원 방법:
1. `git mv src/_archive/<path> src/<path>`
2. `tsconfig.json` exclude 갱신
3. 호출처 (App.tsx / BabylonEngine.ts / GreenhouseLayout.tsx) import 복원
4. AppMode union (`src/store/twinStore.ts:9`)에 mode 추가

## 카테고리

### `twin/` — greenhouse 3D + loading (13 files)

| File | 역할 | 호출처 (archive 전) |
|---|---|---|
| `GreenhouseContent.ts` | 베드/zone/heatmap/robot/path orchestrator | BabylonEngine.applyMode('greenhouse') |
| `SupportingPlant.ts` | LOD-aware 배경 식물 | PlantLODManager |
| `Heatmap.ts` | zone-level 비료/습도 색상 mesh | GreenhouseContent |
| `Robot.ts` | UWB 추적 로봇 mesh + patrol | GreenhouseContent |
| `PathTrail.ts` | 로봇 이동 자취 ribbon | GreenhouseContent |
| `PlantLODManager.ts` | distance-based LOD swap | GreenhouseContent |
| `CocopeatBags.ts` | 베드 cocopeat 슬래브 | GreenhouseScene |
| `CocopeatBagTexture.ts` | cocopeat procedural texture | CocopeatBags |
| `GroundTexture.ts` | albedo/normal map | GreenhouseScene |
| `BedStands.ts` | 베드 다리 mesh | GreenhouseScene |
| `TubeRail.ts` | 천장 hot-water 파이프 | GreenhouseScene |
| `ZonePicker.ts` | zone hover/click ray | GreenhouseContent |
| `ProgressiveLoad.ts` | 4-stage quality ramp | BabylonEngine (single-plant 진입) |

### `components/` — greenhouse UI (8 files)

| File | 역할 | 호출처 |
|---|---|---|
| `TopBar.tsx` | greenhouse 상단 day/phase pill | GreenhouseLayout |
| `LabelOverlay.tsx` | 3D world → 2D screen 라벨 projector | GreenhouseLayout + BabylonEngine |
| `LayerDock.tsx` | heatmap/path/fov toggle dock | GreenhouseLayout |
| `AnalysisPanel.tsx` | 우측 sidebar (zone/event/env tabs) | GreenhouseLayout |
| `TimelinePanel.tsx` | 하단 console (sparkline + stages) | GreenhouseLayout |
| `PatrolMap.tsx` | 미니맵 (로봇 위치) | GreenhouseLayout |
| `CaptureThumbs.tsx` | 로봇 촬영 썸네일 | GreenhouseLayout |
| `PointCloudPreview.tsx` | 로봇 LiDAR preview | GreenhouseLayout |

### `ui/` — mode UI (3 files)

| File | 역할 |
|---|---|
| `ModeLobby.tsx` | mode 선택 lobby 화면 |
| `BusyIndicator.tsx` | 우하단 corner spinner (300ms+ 작업) |
| `ComingSoonPanel.tsx` | robot/sandbox mode placeholder |

## Baseline

`v0.18-iter34-stable` tag 시점 baseline. Archive 시 _시각 회귀 0_ 검증됨:
- Iter 33 V1 9 invariants 통과
- R26 contract 6 invariants 통과
- single-plant baseline 시각 동일

## 관련 commit chain

- **A. archive(modes)** — lobby + ModeLobby + ComingSoonPanel
- **B. archive(twin)** — ProgressiveLoad + BusyIndicator + greenhouseContent dead branches
- **C. archive(greenhouse)** — 본 README가 대상
