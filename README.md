# 스마트온실 디지털 트윈 — VIASOFT.AI

토마토 생육 시뮬레이터 + 학술 모델 튜닝 실험실. **Reduced TOMGRO + TOMSIM photosynthesis + Gillaspy 3-phase fruit growth + Marcelis abortion** 기반. Babylon.js 9 + React 19 + Vite + WebGPU.

> **모노레포 구조** — `packages/tomato-engine` (생육 알고리즘 + JSON 모델 spec, 엔진 무관) + `packages/tomato-geometry` (식물 메시 generator, 엔진 무관) + `src/` (Babylon + React 운영 화면). 두 패키지는 다른 프로젝트 / Node CLI / worker 에서 그대로 import 가능.

레퍼런스 환경: **김제 스마트팜혁신밸리** (UWB 위치측위 시험, `_ref/smartfarm.mp4` frame_07).

## 4-Mode Workflow

진입 시 [DSSAT / APSIM / WUR TOMSIM 톤의 lobby](src/ui/ModeLobby.tsx) → 4 카드 중 선택:

| 모드 | 용도 | 학술 모델 |
|------|------|---------|
| **◇ Greenhouse Twin** | 720 plant 운영 시나리오 (K-smartfarm 13 베드) | sigmoid (legacy) |
| **▣ Single-Plant Analysis** | 1 plant 정밀 튜닝 + 학술 검증 (1분 단위) | **TOMSIM / Reduced TOMGRO / Gillaspy** |
| ▢ Harvest Robot Pose | 4-keypoint pose 시각화 (Wageningen 표준) | 별도 plan |
| ▤ Parameter Sandbox | 모델 / cultivar 자유 편집 + A/B 비교 | 별도 plan |

→ 1그루 모드에서 학술 모델 튜닝 → 검증된 모델을 전체 온실에 적용 (`v0.x roadmap`)

---

## Quick Start

```bash
npm install
npm run dev               # http://localhost:8090
```

`/legacy.html` 은 이전 Three.js 프로토타입 (참조).

빌드:
```bash
npm run build             # tsc --noEmit + vite build → dist/
npm run preview           # production build 미리보기
```

---

## 핵심 기능

### 1. Single-Plant Analysis — 학술 모델 튜닝 실험실

[4-pane dockable layout](src/components/SinglePlantOverlay.tsx) (Tools / Viewport / Inspector / Timeline / StatusBar):

- **TOMSIM + Reduced TOMGRO** 시뮬레이션 — 1분 단위 stepMinutely
- **시각 ↔ 학술 모델 일치** — fruit 색/크기/위치 + leaf 면적 모두 PhysiologyState 직접 반영
- **Inspector** — Cultivar 14필드 + PlantState 10필드 + Phenology + Truss Table + Genome
- **TimelineChart** — 10 변수 + 동적 truss-별 fruit DM + phenology 이벤트 마커
- **PARGauge** — 실시간 PAR / 온도 시각화
- **자동 Lv 10 boost** — 720 plant hide 후 풀 PBR + Shadow 8192 + MSAA 8 + clearcoat + SSS

### 2. 학술 모델 JSON Spec Sheet (v0.1 신규)

`packages/tomato-engine/models/` 에 *엔진의 동작 명세* 가 JSON 으로 외부화:

```
models/
├── tomgro-v1.jsonc            ← 글로벌 학술 파라미터 (LUE, k, Q10, T_base, abortion 등)
├── cultivars/
│   ├── tomimaru-muchoo.jsonc  ← Sakata F1 pink beefsteak (K-smartfarm)
│   ├── cherry-generic.jsonc
│   ├── round-generic.jsonc
│   ├── beefsteak-generic.jsonc
│   └── roma-generic.jsonc
└── README.md                  ← spec sheet (학술 reference + 단위 규약)
```

**튜닝 워크플로:**
1. VS Code 로 `tomgro-v1.jsonc` 또는 cultivar JSON 편집 (예: `LUE_gDM_per_mol_PAR: 3.5 → 4.0`)
2. 저장 → Vite HMR → ACTIVE_MODEL 자동 reload
3. 브라우저의 Single-Plant 모드에서 슬라이더 옮기면 새 값 즉시 반영
4. Inspector + TimelineChart 가 새 결과 표시

코드 = 인터프리터, JSON = 모델 spec. DSSAT / APSIM / WUR TOMSIM 의 spec sheet 와 같은 패턴.

### 3. Greenhouse Twin — 운영 시나리오

기존 720 plant 온실 (sigmoid 모델, K-smartfarm 13 베드):

- **3D 씬**: 베드 13 × 식물 720, 폴리카보네이트 천장, 행잉 와이어 + 수직 string, 협동 로봇, UWB anchor
- **분석 패널** (우): 선택 구역의 생육 지표·이미지·AI 분석 결과
- **타임라인** (하): 120일 스크럽 + 이상 이벤트 + 촬영 세션 마커
- **UWB 평면도** (우상단): 4-anchor 거리선 + 로봇 실시간 위치 (cm 단위)

### 생육 엔진 (engine-agnostic, `@farmsim/tomato-engine`)

`packages/tomato-engine/` — 식물 생장 알고리즘. Babylon/Three 의존 zero.

```ts
import { GrowthEngine } from '@farmsim/tomato-engine';
const engine = new GrowthEngine();
// Single-Plant Analysis (학술 모델, 분 단위)
engine.addPlant({ seed: 42, cultivarName: 'tomimaru-muchoo' });
const phys = engine.simulatePlantToMinute(42, 45 * 24 * 60 + 12 * 60);
// → TT, LAI, W, W_f, trusses[].fruits[] (TOMGRO PhysiologyState)

// Greenhouse Twin (sigmoid, day 단위)
const state = engine.computeState(42, 75);
```

- **6 환경 변수** (temperatureC, humidity, lightHoursPerDay, co2ppm, nutrientEC, substrateWater)
- **2 모델 path**:
  - `simulatePlantToMinute` — TOMGRO 학술 모델 (1분 단위 누적, PhysiologyState)
  - `computeState` — sigmoid (day-snapshot, PlantState)
- **5 cultivar registry** + 글로벌 모델 spec, 모두 JSONC 외부화 + Vite HMR hot-reload
- **회귀 검증**: stepDaily/stepHourly/stepMinutely 0.0000% 오차 동등성 (`test-hourly-equivalence.ts`)

### 영상 참조

`_ref/smartfarm.mp4` (gitignored) — frame_07 모니터링 화면이 본 운영 화면의 직접 참조:
- 빨간 토마토 행잉베드 (양쪽 가득)
- AGV + 협동로봇 가운데
- 우측 2D 그리드 모니터 + 실시간 좌표 → 우리 미니맵

---

## 학술 Backbone

이 시뮬레이터의 생육 모델은 다음 학술 backbone 위에 있음:

| 모델 | 출처 | 사용처 |
|------|------|------|
| **TOMSIM** carbon balance | Heuvelink E. 1996, *Ann. Bot.* 77:71-80 | photosynthesis (LUE form), partitioning |
| **Reduced TOMGRO** 5-state {N, LAI, W, W_f, W_m} | Jones, Kenig, Vallejos 1999, *Trans. ASAE* 42:255-265 | 핵심 plant state |
| **Gillaspy 3-phase fruit growth** | Gillaspy, Ben-David, Gruissem 1993, *Plant Cell* 5:1439-1451 | cell division → expansion → ripening |
| **Marcelis abortion + sink strength** | Marcelis L.F.M. 1996, *Physiol. Plant.* 94:447 | per-organ sink, abortion under load |
| **CROPGRO-Tomato thermal time** | T_base = 10 °C | GDD-driven phenology |
| **Spitters PAR sin² envelope** | Spitters 1986, *Agric. For. Meteorol.* 38:217 | diurnal PAR |

학술 파라미터 전체는 [`packages/tomato-engine/models/README.md`](packages/tomato-engine/models/README.md) 의 spec sheet 참조.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 3D 엔진 | Babylon.js 9.8 (WebGPU 우선, WebGL2 fallback) |
| UI | React 19 + zustand + Vite 8 + TypeScript 5.9 strict |
| 모델 spec | JSONC + `jsonc-parser` + Vite `?raw` import + HMR hot-reload |
| 라이팅 | DirectionalLight + Hemispheric + HDRI IBL (Babylon CC0 .env 로컬) |
| 포스트프로세싱 | ACES tonemap + Bloom + Sharpen + FXAA + Vignette; SSAO2/DOF/MotionBlur (WebGL2 한정) |
| 머티리얼 | PBR + clearcoat (토마토) + subSurface translucency (잎 SSS) + HighlightLayer (분석 모드) |
| 시뮬레이션 | TOMGRO stepMinutely (1분 단위 학술 모델) + apex-driven 생장 (sigmoid legacy) |

---

## 검증

### 학술 모델 동등성

```bash
npx vite-node packages/tomato-engine/test-hourly-equivalence.ts
```

- 22°C 일정 일일주기 환경에서 `stepDaily × 50 일` == `stepHourly × 1200 시간` == `stepMinutely × 72,000 분`
- 모든 state field (TT, N, LAI, W, W_f, W_m, heightCm, trusses) **0.0000% 상대 오차**
- `simulatePlantToMinute` determinism: direct / multi-step / forward-then-rewind 세 경로 모두 동일 state

```bash
npx vite-node packages/tomato-engine/test-coremodel.ts
```

- Day 120 Tomimaru Muchoo 결과가 학술 범위 (LAI 3-4, fruit FW 4-6 kg, acropetal spread ≥ 1) 안에 들어옴

### 운영 화면

```bash
npm install --no-save playwright@1.60.0
node verify-farmsim.mjs
```

자동 측정:
- 콘솔 / 페이지 / HTTP 오류 (목표 0)
- WebGPU/WebGL2 백엔드
- fps (목표 60, 실측 120 fps M-series)
- 60초 재생 heap delta (목표 < +100MB)
- 오프라인 reload (production build)

---

## 문서

- [**packages/tomato-engine/models/README.md**](packages/tomato-engine/models/README.md) — **학술 모델 spec sheet** (v0.1 신규). 파라미터 표 + 학술 reference + 튜닝 워크플로 + cultivar 추가 절차
- [CHANGELOG.md](CHANGELOG.md) — 버전별 변경 사항
- [docs/stage-by-stage.md](docs/stage-by-stage.md) — 부위별 단계별 알고리즘 (떡잎/잎/꽃/과실/줄기/스트레스, 모델↔메시 매핑)
- [docs/architecture.md](docs/architecture.md) — 레이어 구조, 생육 엔진, 씬 구성
- [docs/development-guide.md](docs/development-guide.md) — 폴더 구조, 워크플로, WebGPU 호환성, 자주 마주칠 이슈
- [packages/tomato-engine/README.md](packages/tomato-engine/README.md) — engine-agnostic 생육 패키지 API
- [packages/tomato-geometry/README.md](packages/tomato-geometry/README.md) — engine-agnostic geometry generator API

---

## 의도적 누락 (Out-of-Scope)

- 온실/로봇 GLB 자산 (절차적 메시로 frame_07 분위기 매칭)
- ThinInstance / 빌보드 impostor (현재 fps 여유 충분)
- 실제 백엔드 (WebSocket/MQTT) — All Mock 시제품 단계
- Unreal Pixel Streaming — 별도 전시 데모 옵션
- 모바일/태블릿 반응형 — 데스크탑 1080p–1440p 우선
- 다국어 — 한국어 단일

---

## 라이센스 / 자산 출처

- `public/hdri/environment.env` — Babylon.js 공식 환경맵 (CC0)
- `public/favicon.svg` — 자체 작성
- 외부 CDN 의존 zero (오프라인 데모 가능)
