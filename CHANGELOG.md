# Changelog

All notable changes to FarmSim are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-23

First tagged release. **Single-Plant Analysis 모드 + 학술 모델 JSON spec sheet** 가 핵심.

### Added

#### 학술 모델 (TOMSIM / TOMGRO / Gillaspy / Marcelis)

- **Reduced TOMGRO 5-state {N, LAI, W, W_f, W_m}** — `packages/tomato-engine/src/CoreModel.ts`
  - `stepHourly` + `stepMinutely` (1분 단위 통합) — `stepDaily` 는 24×stepHourly = 1440×stepMinutely wrapper
  - 동등성 검증 0.0000% (`test-hourly-equivalence.ts`)
- **TOMSIM photosynthesis** (LUE form) — `Photosynthesis.ts`
  - `dailyGrossAssimilation` / `hourlyGrossAssimilation` / `dailyNetDM` / `hourlyNetDM`
  - LUE 3.5 g DM/mol PAR (Heuvelink 1996 calibration)
- **Gillaspy 3-phase fruit growth** — `FruitGrowth.ts`
  - Cell division (150 GDD) → expansion (500 GDD, Gompertz) → ripening (200 GDD)
  - Per-fruit cohort with deterministic genome sample
- **Marcelis abortion + 적과 pruning baseline** — `CoreModel.ts`
  - ABORTION_THRESHOLD 0.25, ABORTION_LAG_DAYS 4
  - 시간 해상도 무관 (dtDays 매개변수)
  - `trussTargetFruitCount` per cultivar
- **DiurnalEnv** — `DiurnalEnv.ts`
  - 시간별 PAR 사인² 곡선 + 온도 사인 곡선 (min h=2, max h=14)
  - PAR 적분 + T_avg 정확 보존

#### 모델 JSON Spec Sheet (foundation)

- **`packages/tomato-engine/models/`** — 학술 파라미터 외부화
  - `tomgro-v1.jsonc` — 글로벌 모델 spec (LUE, k, Q10, T_base, abortion, diurnal, LAI cap)
  - `cultivars/*.jsonc` × 5 (cherry / round / beefsteak / roma / tomimaru-muchoo)
  - `README.md` — 학술 publication 수준 spec sheet (파라미터 표 + reference + 튜닝 워크플로)
- **`ModelRegistry.ts`** — JSONC loader (jsonc-parser) + ACTIVE_MODEL singleton
- **Vite HMR hot-reload** — JSON 편집 → 즉시 ACTIVE_MODEL 갱신 → 시뮬 결과 변경

#### App 구조

- **4-mode lobby** — `src/ui/ModeLobby.tsx` (글로벌 crop simulator 톤: light theme, serif title, monospace data)
  - ◇ Greenhouse Twin / ▣ Single-Plant Analysis / ▢ Harvest Robot Pose (WIP) / ▤ Parameter Sandbox (WIP)
  - References 섹션 (Heuvelink / Jones / Gillaspy / Marcelis)
  - URL hash 동기화 (`#single-plant` 등)
- **Single-Plant Analysis 모드** — 별도 Babylon 씬 아닌 *온실 환경 위 Overlay 패턴*
  - 449 supporting plants hide, 인프라 (베드/cocopeat/wire/프레임/지붕) 그대로
  - 4-pane: Tools / Viewport / Inspector (Cultivar + State + Truss Table + Phenology + Genome) / TimelineChart (10 변수 + truss-별 fruit DM 동적) / TimelineSlider (1분 단위)
  - PARGauge (PAR / 온도 실시간) — viewport 우상단
  - Reproducibility Sim ID (`cv=tomimaru-muchoo seed=20260520 +M<minute>`)
  - 자동 Lv 10 render quality boost (WebGPU 호환 partial — DOF/MotionBlur 만 스킵)

#### UX 개선

- **BootOverlay** — 첫 부팅만 풀스크린, 이후 모드 전환/카메라/시뮬 시 안 뜸
- **BusyIndicator** — 우하단 작은 corner spinner, 300ms+ 시뮬 작업만 표시 (debounce)
- **NotificationCenter** — info (좌하단 toast 4s) / warn (우상단 manual) / error (중앙 modal + stack + 새로고침)
- **ErrorBoundary** — UI crash 시 fallback + notify.error 자동
- **카메라 single-plant preset** — radius 5m, target Y 2.2m (plant + 베드 함께 가시)

#### 시각 ↔ 학술 모델 일치

- `overlayPhysiologyFruits` — PlantState 의 fruit/truss 를 TOMGRO PhysiologyState 데이터로 교체
- ShowcasePlant.update 에 옵셔널 PhysiologyState 매개변수 추가
- 슬라이더 1분 이동 시 fruit color / diameter 부드러운 transition
- Leaf size + leafArea TOMGRO LAI 비례 scale (Plant 가 풍성)

### Changed

- `GrowthEngine` 에 `simulatePlantToMinute` + `simulatePlantToHour` + `getPhysiologyState` + `setSingleFocusMode` 추가
- `Cultivar.ts` 의 하드코딩 5개 → JSON loader 로 통일 (CULTIVAR_JSONS map)
- 5 file refactor (Cultivar / Photosynthesis / CoreModel / FruitGrowth / DiurnalEnv) 의 magic number → ACTIVE_MODEL

### Fixed

- `Canvas2D willReadFrequently` 경고 (`CocopeatBagTexture`)
- BootOverlay early-return 위치 (React Rules of Hooks 위반)
- direct URL `#single-plant` 진입 시 supporting plants 안 숨겨지던 문제 (subscribe initial value)
- Fruit collision avoidance (Truss + SupportingPlant — 누적 spacing + Z-jitter + 균등 각도)
- WebGPU 백엔드의 godRays / LensFlare / Color LUT / SSAO / DOF / Motion blur 호환성 (selective skip + notify.warn)
- VolumetricLightScattering 의 WebGPU sampler-bind panic

### References

- Heuvelink E. 1996. *Ann. Bot.* 77:71-80 — TOMSIM
- Jones, Kenig, Vallejos 1999. *Trans. ASAE* 42:255-265 — Reduced TOMGRO
- Gillaspy, Ben-David, Gruissem 1993. *Plant Cell* 5:1439-1451 — 3-phase fruit growth
- Marcelis 1996. *Physiol. Plant.* 94:447 — Sink strength + abortion
- Goudriaan & van Laar 1994 — Q10, canopy integration
- Spitters 1986. *Agric. For. Meteorol.* 38:217 — PAR sin² envelope
- Gould 1992 — Tomato fruit density
- PMC10482247 — Locule QTL (fas, lc)

### Roadmap (Out of Scope for v0.1)

- 온실 모드 (720 plant) 도 TOMGRO 로 통일 — 1그루에서 튜닝된 모델을 전체 derive. 캐싱/day-fallback/GPU compute 필요.
- 생육 모델 A/B 비교 (Sandbox 모드)
- Brix / lycopene 품질 모델 (Anaya-Ramirez 2024)
- 수확 로봇 4-keypoint pose simulation (Wageningen ScienceDirect 2023 표준)
- WebGPU PrePass 호환성 fix (DOF / MotionBlur 활성화)
- Farquhar full photosynthesis (Vcmax/Jmax leaf-level)

[0.1.0]: https://github.com/viakisun/bioengine/releases/tag/v0.1.0
