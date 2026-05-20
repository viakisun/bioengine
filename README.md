# 스마트온실 디지털 트윈 — VIASOFT.AI

토마토 행잉베드 온실의 운영을 위한 웹 기반 디지털 트윈. Babylon.js 9 + React 19 + Vite + WebGPU.

레퍼런스 환경: **김제 스마트팜혁신밸리** (UWB 위치측위 시험, `_ref/smartfarm.mp4` frame_07).

```
운영 화면 (좌측 3D 씬 / 우측 분석 패널 / 하단 타임라인 / 상단 UWB 평면도)
   ├ 30m 행잉베드 × 30 식물 × 6 zone
   ├ 가운데 풀-디테일 식물 (생육 엔진 구동, 매 day-scrub 재빌드)
   ├ AGV + 6DOF 협동로봇 (촬영 중 LED/FOV 색 변경)
   ├ 베드 위 heatmap (구역별 정상/생육부진/병해/수분스트레스 색)
   ├ UWB 4-anchor + 실시간 거리선 + 평면도 미니맵
   ├ 분석 패널: 구역 지표 + 14일 sparkline + 어제/7일 대비 + RGB/Depth/Mask + 점군 + AI 신뢰도
   └ 분석 모드 토글 → HighlightLayer segmentation overlay
```

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

### 운영 화면

- **3D 씬** (좌): 30m 베드, 30 식물 (가운데 풀 디테일 + 양쪽 LOD-graded), 폴리카보네이트 천장, 천장 행잉 와이어 + 식물별 수직 string, 협동 로봇, UWB anchor
- **분석 패널** (우): 선택 구역의 생육 지표·이미지·AI 분석 결과
- **타임라인** (하): 120일 스크럽 + 이상 이벤트 + 촬영 세션 마커
- **UWB 평면도** (우상단): 4-anchor 거리선 + 로봇 실시간 위치 (cm 단위)

### 생육 엔진 (engine-agnostic)

`src/simulation/GrowthEngine.ts` — 식물 생장 알고리즘. Babylon/Three 의존 zero.

```ts
const engine = new GrowthEngine();
engine.setEnvironment({ temperatureC: 23, lightHoursPerDay: 14, ... });
engine.addPlant({ seed: 42, genomeOverrides: { heightMaxCm: 220 } });
const state = engine.computeState(42, 75);
```

- **62+ 게놈 파라미터** (heightMaxCm, leafSerrationDepth, internodeElongDelay, stemYoungsModulusMPa, …)
- **6개 환경 변수** (temperatureC, humidity, lightHoursPerDay, co2ppm, nutrientEC, substrateWater) — 생장률·잎크기·과실크기·노드간격을 곱연산으로 스케일
- **PlantState 출력**: 노드별 high-detail (heightCm, droopExtra, leafMassG, stemRadiusMm, deflectionRad, truss 화방/과실)
- **JSON 왕복**: `serialize()` / `fromSerialized(data)`

가운데 showcase 식물이 매 day-scrub에서 PlantState를 받아 mesh를 재생성. 잎 처짐(droopExtra)·줄기 굴곡(deflection)·잎/과실 익는 색 모두 모델 출력 그대로 반영.

### 영상 참조

`_ref/smartfarm.mp4` (gitignored) — frame_07 모니터링 화면이 본 운영 화면의 직접 참조:
- 빨간 토마토 행잉베드 (양쪽 가득)
- AGV + 협동로봇 가운데
- 우측 2D 그리드 모니터 + 실시간 좌표 → 우리 미니맵

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 3D 엔진 | Babylon.js 9.8 (WebGPU 우선, WebGL2 fallback) |
| UI | React 19 + zustand + Vite 8 + TypeScript 5.9 strict |
| 라이팅 | DirectionalLight + Hemispheric + HDRI IBL (Babylon CC0 .env 로컬) |
| 포스트프로세싱 | ACES tonemap + Bloom + Sharpen + FXAA + Vignette; SSAO2 (WebGL2 한정) |
| 머티리얼 | PBR + clearcoat (토마토) + subSurface translucency (잎 SSS) + HighlightLayer (분석 모드) |
| 시뮬레이션 | apex-driven 생장 + 구조역학 (pipe model + 캔틸레버) |

---

## 검증

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

- [docs/architecture.md](docs/architecture.md) — 레이어 구조, 생육 엔진, 씬 구성
- [docs/development-guide.md](docs/development-guide.md) — 폴더 구조, 워크플로, WebGPU 호환성, 자주 마주칠 이슈

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
