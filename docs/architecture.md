# 아키텍처 — 스마트온실 디지털 트윈 (Babylon.js + React)

## 0. 문서 컨벤션

- 본 문서는 `feature/babylon-twin` 브랜치 기준 (Babylon.js 9 + React 19 + Vite).
- **모노레포** (npm workspaces): `packages/tomato-engine` + `packages/tomato-geometry` + apps/farmsim (현재 `src/`).
- 부위별 단계별 알고리즘 + 모델↔메시 매핑은 [stage-by-stage.md](./stage-by-stage.md) 가 단일 권위 문서.
- `_ref/smartfarm.mp4` (김제 스마트팜혁신밸리 UWB 시험 영상) 의 frame_07 모니터링 화면이 운영 화면 설계의 reference.

---

## 1. 레이어 구조 (모노레포)

```
┌──────────────────────────────────────────────────────┐
│  apps/farmsim (src/)                                  │
│                                                       │
│  Presentation (React UI)                              │
│  └ App / SceneCanvas / AnalysisPanel / Timeline /    │
│    Minimap / CameraPresets / EventList /             │
│    LabelOverlay / CaptureThumbs / PointCloudPreview  │
│                                                       │
│  State (zustand)  src/store/twinStore.ts             │
│                                                       │
│  Scene (Babylon.js)                                   │
│  └ BabylonEngine / SceneSetup / CameraRig /          │
│    GreenhouseScene / ShowcasePlant / SupportingPlant │
│    / Robot / Heatmap / PathTrail / UwbAnchors /      │
│    ZonePicker / GroundTexture                        │
│                                                       │
│  Plant wrappers (Babylon)                             │
│  └ LeafGenerator (Mesh + material) /                 │
│    StemGenerator / FruitGenerator / TrussGenerator / │
│    LeafTexture (RawTexture wrapper)                  │
│                                                       │
│  Data (mocks)  mockScenario (30 plants × 6 zones ×   │
│                120 days, robot route, sessions,      │
│                events)                                │
└──────────────────────────────────────────────────────┘
            │ depends on
            ▼
┌──────────────────────────────────────────────────────┐
│  packages/tomato-geometry  (zero Babylon/Three)       │
│  └ buildLeafChunk (stage-aware morphing) /           │
│    buildCotyledonChunk / buildLeafColorBytes (+      │
│    optional diseaseLoad overlay) /                   │
│    buildLeafNormalBytes / catmullRomPath /           │
│    GeoChunk + Mat4 primitives                        │
└──────────────────────────────────────────────────────┘
            │ depends on
            ▼
┌──────────────────────────────────────────────────────┐
│  packages/tomato-engine  (zero deps — pure TS)        │
│  └ GrowthEngine / GrowthModel / PhysicsModel /       │
│    PlantGenome / SunPosition / SeededRandom /        │
│    LeafStage (getLeafStage helper with smooth        │
│                blendT for renderers)                 │
└──────────────────────────────────────────────────────┘
```

**원칙**:
- `tomato-engine` 은 Node CLI / worker / CI 어디서나 그대로 import 가능. 30+ 게놈 파라미터, 6 환경 변수, PlantState + NodeState + TrussState 전체 출력. JSON 왕복 지원.
- `tomato-geometry` 는 `tomato-engine` 의 NodeState/PlantGenome/LeafStageInfo 만 import. 출력은 raw vertex array (`GeoChunk`) + texture bytes (`Uint8Array`). Babylon import 0.
- apps/farmsim 만 Babylon 의존. 두 패키지의 출력을 `Mesh` / `RawTexture` 로 wrap.
- 부위별 단계별 알고리즘 ↔ 코드 매핑은 [stage-by-stage.md](./stage-by-stage.md) 참조.

**핵심 설계 원칙**

- **Simulation Layer는 렌더링 엔진에 의존하지 않음** — `src/simulation/*` 와 `src/sim/SunPosition.ts` 는 Three.js / Babylon 모두 zero dependency. 별도 worker / Node CLI 로도 그대로 실행 가능.
- **PlantState 인터페이스가 두 레이어를 연결** — Simulation → `computeState(seed, day, env?) → PlantState` → Plant mesh generators.
- **State는 단방향** — React UI → zustand → BabylonEngine.subscribe → scene update. 씬에서 store 직접 수정 (zone 클릭 등) 은 `useTwinStore.getState()` 통해 명시적으로.

---

## 2. Simulation Layer (엔진 무관)

### 2.1 GrowthEngine — public façade

`src/simulation/GrowthEngine.ts` — 외부에서 생장 시뮬레이션을 다룰 단일 진입점.

```ts
const engine = new GrowthEngine();
engine.setEnvironment({
  temperatureC: 23, humidity: 0.7, lightHoursPerDay: 14,
  co2ppm: 800, nutrientEC: 3.0, substrateWater: 0.6,
});
engine.addPlant({
  seed: 42,
  genomeOverrides: { heightMaxCm: 220 },   // 게놈 일부 override
});
const state = engine.computeState(42, 75);
// state.nodes[i].droopExtra, leafMassG, stemRadiusMm, ...
```

**메서드**

| API | 용도 |
|-----|------|
| `addPlant({ seed, genomeOverrides? })` | 식물 등록 + 게놈 일부 override |
| `updateGenome(seed, overrides)` | 런타임 게놈 수정 (UI 슬라이더용) |
| `removePlant(seed)` / `clear()` | 등록 해제 |
| `setEnvironment({ ... })` / `getEnvironment()` | 6개 온실 환경 변수 |
| `computeState(seed, day, envOverride?)` | 특정 일의 PlantState 산출 (소수일 OK) |
| `computeAllStates(day)` | 모든 식물 일괄 |
| `getSnapshot(day)` | 직렬화 가능한 스냅샷 |
| `serialize()` / `fromSerialized(data)` | 엔진 상태 JSON 왕복 |

### 2.2 환경 → 생장 모듈레이션

`environmentStressFactor(env)` 가 6개 변수를 곱연산 band-pass로 결합하여 0.3–1.25 스트레스 계수 산출. `applyEnvironmentToGenome(genome, env)` 가 다음 파라미터를 스케일:

| 파라미터 | 영향 |
|---------|------|
| `heightSigmoidK` | 생장 속도 |
| `leafSizeMultiplier` | 잎 최대 크기 |
| `leafExpansionRate` | 잎 확장 시그모이드 가파름 |
| `fruitMaxDiameterMm` | 과실 최대 직경 |
| `nodeInterval` | 노드 생성 간격 (역수) |

### 2.3 GrowthModel — apex-driven biology

`src/simulation/GrowthModel.ts` (336 라인).

- **APEX-DRIVEN**: 줄기 정점(SAM)이 잎 원기 생성 → 잎 확장 → GA 생성 → GA 하향 이동 → 잎 아래 절간(internode) 신장. 결과: 초기 묘는 rosette(절간 짧음), 가시적 줄기는 ~20일 이후.
- **3-pass 알고리즘**:
  1. Pass 1: 각 노드의 잠재 절간 길이 + 현재 신장률 (지연된 sigmoid)
  2. Pass 2: 절간 길이 누적 → 노드 높이
  3. Pass 3: 노드별 상태 (잎 성숙도, 면적, 질량, 처짐, 화방/과실)
- **NodeState 출력** — 노드별:
  - `heightCm`, `phyllotaxisAngle` (golden angle spiral)
  - `leafMaturity` (0–1), `leafSizeFactor`, `leafletCount`, `leafAreaCm2`, `leafMassG`
  - `yellowing` (≥60일 노화)
  - `droopExtra` (0–120°, weight + age 모델)
  - `truss?` { flowers[], fruits[] } — 화방, 과실 (직경/숙도/색)
  - 물리: `massAboveKg`, `stemRadiusMm`, `deflectionRad`, `deflectionAzimuth`
- **잎 제거** — 가장 낮은 익은 과실 아래 잎은 `leafMaturity=0` (실제 농장 관행).

### 2.4 PhysicsModel — pipe model + cantilever

`src/simulation/PhysicsModel.ts`.

- **Pass 1 (top→bottom)**: 노드별 mass 누적 (잎 + 과실 + 줄기 segment)
- **Pass 2 (bottom→top)**: 줄기 반경 = √(mass × supportCoeff + minR²) — 파이프 모델. 2–12mm 범위 (실측 토마토 줄기 10–16mm 직경에 부합).
- **Pass 3**: 화방 무게 → 굽힘 모멘트 → 처짐 각도 (E × I 기반). 최대 8.5° lean. wireAttachmentHeight 위는 와이어가 지지하므로 굽힘 없음.
- **`computeTrussDroop(truss, genome)`** — 화방 페던컬을 캔틸레버 빔으로 모델링 (1–15cm 처짐).

### 2.5 PlantGenome — 30+ 게놈 파라미터

`src/simulation/PlantGenome.ts`. `generateGenome(seed)` 가 SeededRandom 기반 결정론적 게놈 생성. `addPlant({ seed, genomeOverrides })` 로 일부만 override 가능.

주요 카테고리:
- 생장 곡선 (heightMaxCm, heightSigmoidK/Mid)
- 노드 생성 (nodeStartDay, nodeInterval, phyllotaxisJitter)
- 잎 (leafSizeMultiplier, leafletCountBias, leafDroopMultiplier)
- 화방·과실 (trussStartNode, flowersPerTruss, fruitMaxDiameterMm, ripenStartAge)
- 잎 형태 (leafSerrationDepth/Freq, leafLobeDepth, leafWaviness, leafPetioleLength)
- 절간 (internodeLenCm, leafExpansionRate, internodeElongDelay/Mid)
- 물리 (stemStrengthFactor, stemYoungsModulusMPa, stemWoodDensity)
- 식재 오프셋 (plantingDayOffset)

### 2.6 SunPosition — 시간대별 태양

`src/sim/SunPosition.ts` (엔진 무관). `getSunState(hourOfDay)` 가 35°N 위도 기준 태양 방향·색온도·강도 산출. `dayToHour(dayFraction)` 가 simulation day 의 fractional part를 6AM–6PM 일조 시간으로 매핑.

---

## 3. Scene Layer (Babylon.js)

### 3.1 BabylonEngine

`src/twin/BabylonEngine.ts` — 엔진 부팅 + 렌더 루프.

- WebGPU 우선 → 실패 시 WebGL2 fallback
- HUD 텍스트 갱신 (fps · 백엔드 · day · UWB 좌표)
- `useTwinStore.subscribe(...)` 로 store 변화에 반응 (선택 zone, 카메라 프리셋, 분석 모드, 레이어 토글)
- 매 frame: day → sun 갱신, day delta > 0.05 → `greenhouse.update(day)`, 항상 `scene.render()`
- 라벨 오버레이 매 frame `Vector3.Project` 로 3D world → 2D screen

### 3.2 SceneSetup

`src/twin/SceneSetup.ts`.

- **라이트**: HemisphericLight + DirectionalLight (sun) + CascadedShadowGenerator 시도 → 기본 ShadowGenerator(2048) PCF
- **Sky**: `GradientMaterial` 스카이박스 (Hosek-Wilkie 대신 안정 그라데이션 — Babylon SkyMaterial 이 WebGPU 에서 silent fail)
- **IBL**: `public/hdri/environment.env` (Babylon 공식 CC0 .env, 약 270KB) — `CubeTexture.CreateFromPrefilteredData` 로 PMREM
- **포스트프로세싱 (`DefaultRenderingPipeline`)**: ACES 톤매핑, Bloom (threshold 0.85), Sharpen, FXAA, Vignette (1.6), Exposure 1.0, Contrast 1.1
- **SSAO2**: WebGL2 에서만 활성 (WebGPU + PrePassRenderer 비호환 — Babylon 9.x 알려진 이슈)
- **side-effect imports**: PostProcessRenderPipelineManagerSceneComponent, shadowGeneratorSceneComponent, geometryBufferRendererSceneComponent 등 명시 (트리쉐이킹 안전화)

### 3.3 GreenhouseScene

`src/twin/GreenhouseScene.ts` — 전체 씬 빌더.

| 구성 요소 | 메모 |
|----------|------|
| Ground (60×8m plane) | 절차적 콘크리트 PBR (`GroundTexture.ts`, RawTexture 512²) |
| Walking path (30×1.2m) | 통로 |
| Bed (30×0.35m, galvanized) | 행잉베드 |
| Greenhouse frame | A-frame ribs 4m 간격 + ridge / eave 빔 + side posts |
| Roof / wall panels | 반투명 폴리카보네이트 (alpha 0.18, IOR 1.49) |
| Training wires | 천장 수평 2 와이어 + 식물별 수직 string |
| Plants (30) | 가운데 1개 (`ShowcasePlant` — GrowthEngine 구동), 양쪽 ±5 풀 정적 foliage, 나머지 LOD 차등 |
| `Heatmap` | RawTexture 256×16, 6 zone 색 (정상/부진/병해/수분스트레스) |
| `Robot` | AGV + 6DOF cobot + FOV cone |
| `PathTrail` | 3일 슬라이딩 윈도우 |
| `UwbAnchors` | 4 코너 anchor + 거리선 |
| `ZonePicker` | PointerObservable → store |

### 3.4 ShowcasePlant — GrowthEngine 구동 라이브 식물

`src/twin/ShowcasePlant.ts`.

- 매 day-scrub (0.5일 임계) `engine.computeState(seed, day)` → `buildFromState(state)`
- `disposeAll()` 가 `getChildMeshes(false)` 로 truss 자식 mesh + material 재귀 dispose (메모리 누수 방지)
- 부위:
  - **Stem**: `createStemMesh` — Catmull-Rom 곡선 + Frenet 프레임 + 노드별 deflection 누적 + woodiness 정점 색 (밑 갈색 → 위 녹색)
  - **Leaves**: `createLeafMeshFromNode(node, genome, rng)` — 노드별 잎 메시. droopExtra → ageFrac, yellowing → curl, genome.leafSerration* 등 형태 파라미터
  - **Truss**: `createTrussNode(truss, genome, azimuth, rng)` — peduncle + 페디셀 + per-fruit `createFruitNode` + 꽃 (5 petal + 5 sepal). 화방 처짐은 `computeTrussDroop` 으로 계산
- **HighlightLayer** 분석 모드 oultine (leaf=초록 / fruit=노랑 / stem=파랑)
- 부위별 mesh 리스트로 노출 → segmentation overlay 토글에 사용

### 3.5 Plant generators

`src/plant/*.ts` — Babylon `VertexData` 기반 메시 생성. 모든 generator 는 PBR Material 캐시 (`WeakMap<Scene, Material>`).

| 파일 | 용도 |
|------|------|
| `LeafTexture.ts` | RawTexture (Uint8Array RGBA) — color + normal 절차적 vein 텍스처 256×256. DynamicTexture 가 WebGPU+PBR 에서 silent fail → RawTexture 로 강제 |
| `LeafGenerator.ts` | 복엽 메시 (petiole + rachis + 소엽 + lobe). PBR + SSS translucency (intensity 0.45). `createLeafMeshFromNode` 가 NodeState 직접 소비 |
| `StemGenerator.ts` | Frenet-tube 줄기, 정점색 woodiness |
| `FruitGenerator.ts` | sphere + 정점 노이즈 + clearcoat PBR (0.4) + per-fruit ripen 색 + 5-petal calyx |
| `TrussGenerator.ts` | peduncle + 페디셀 + 꽃 + fruit. 화방 처짐 적용 |

---

## 4. UI Layer (React)

### 4.1 컴포넌트

```
App.tsx
 ├ SceneCanvas (Babylon mount + cleanup)
 ├ 좌상단 HUD (fps · backend · day · UWB)
 ├ EventList (최근 7일 이상 이벤트)
 ├ Minimap (UWB 평면도 SVG)
 ├ Layer toggles (히트맵 / FOV / 경로)
 ├ LabelOverlay (3D→2D 동기 HTML 라벨)
 ├ CameraPresets (overview/eye-level/closeup/robot-pov)
 ├ VIASOFT.AI 브랜드 푸터
 ├ AnalysisPanel (우측)
 │   ├ 구역 헤더 + 헬스 칩
 │   ├ 생육 지표 (초장/엽면적/착과/숙도)
 │   ├ ChangeIndicator (어제 · 7일 대비)
 │   ├ 14일 sparkline
 │   ├ 구역 상태 구성
 │   ├ 최근 촬영 세션 + CaptureThumbs (RGB/Depth/Mask) + AI 신뢰도
 │   ├ PointCloudPreview (SVG 점군 평면 투영)
 │   ├ Segmentation 모드 토글
 │   └ 비교 모드 (off/yesterday/7days)
 └ Timeline (날짜 + 이벤트 마커 + 촬영 세션 마커 + 재생 컨트롤)
```

### 4.2 zustand store

`src/store/twinStore.ts` — 단일 store.

```ts
currentDay, playing, playSpeed
selectedZoneId, selectedPlantId, hoveredZoneId
analysisMode, compareMode
heatmapVisible, pathTrailVisible, fovVisible
cameraPreset
// + setters
```

dev mode에서 `window.__twinStore = useTwinStore` 노출 (verify script 가 store 직접 driving).

---

## 5. 데이터 (mocks)

`src/data/mockScenario.ts` 가 단일 시드 (20260520) 에서 결정론적 시나리오 생성:

| | 수 |
|---|---|
| 식물 | 30 |
| 구역 | 6 (5m 간격) |
| 일 수 | 121 (Day 0–120) |
| 로봇 키프레임 | 일 7회 × 120일 |
| 촬영 세션 | 매 3일 × 4회 = ~160 |
| 이상 이벤트 | ~35 (자동 분포) |

`PlantSpec.daily[]` 가 일별 height/leafArea/fruitCount/ripenScore/healthLabel 동적 데이터.

---

## 6. 의도적 누락 (Out-of-Scope)

| 항목 | 사유 |
|------|------|
| 온실/로봇 GLB 자산 | 절차적 메시로 frame_07 분위기 매칭 충분, 외부 자산 의존 제로 |
| ThinInstance 인스턴싱 | 120 fps 여유 충분, 30 식물 규모에서 불필요 (≥100 식물 시 도입 권장) |
| 빌보드 impostor | 단일 베드 30 식물 규모에서 불필요 |
| 실제 백엔드 (WebSocket/MQTT) | All Mock 시제품 단계 |
| Unreal Pixel Streaming | 별도 전시 데모 옵션 |
| 모바일/태블릿 반응형 | 데스크탑 1080p–1440p 우선 |
| 다국어 | 한국어 UI 단일 |
| 시각 회귀 자동 테스트 | 수동 스크린샷 + Playwright 검증 |

---

## 7. 검증 (Verify)

`verify-farmsim.mjs` (gitignored) — Playwright 헤드리스 검증 스크립트:

- 0 page error, 0 HTTP 404
- WebGPU 백엔드 자동 감지
- fps 모니터링 (목표 60 fps, 실측 120 fps M-series)
- Day/카메라 프리셋/분석모드 드라이빙 후 다 각도 스크린샷
- 60s 재생 후 heap delta 측정 (목표 < +100 MB)
- 오프라인 reload 테스트 (production build 기준)

실행:
```bash
npm run dev
node verify-farmsim.mjs
```
