# 개발 가이드 — 스마트온실 디지털 트윈

대상: 이 코드베이스에 새로 합류하는 개발자.

브랜치: `feature/babylon-twin` (Babylon.js 9 + React 19 + Vite).

---

## 0. 빠른 시작

```bash
git checkout feature/babylon-twin
npm install
npm run dev
open http://localhost:8090/
```

`/legacy.html` 로 가면 이전 Three.js 진입점도 동시에 확인 가능.

요구 사항:
- Node 20+ (Vite 8 호환)
- macOS / Linux. Windows 미테스트.
- 권장: Chrome 119+ (WebGPU). Safari/Firefox 는 WebGL2 fallback.

---

## 1. 폴더 구조

```
src/
  main.tsx              ── React entry
  App.tsx               ── 전체 레이아웃
  components/           ── React UI 컴포넌트
  store/twinStore.ts    ── zustand 단일 store
  data/mockScenario.ts  ── Mock 시나리오 데이터
  twin/                 ── Babylon 씬 레이어
    BabylonEngine.ts        ── 엔진 부팅 + 렌더 루프 + store 구독
    SceneSetup.ts           ── 라이트/IBL/sky/포스트프로세싱
    CameraRig.ts            ── ArcRotateCamera + 4 프리셋
    GreenhouseScene.ts      ── 씬 빌더 (ground/베드/식물/온실/와이어/로봇/heatmap/anchor)
    ShowcasePlant.ts        ── GrowthEngine 구동 라이브 식물
    GroundTexture.ts        ── 절차적 콘크리트 RawTexture
    Robot.ts                ── AGV + 6DOF cobot
    Heatmap.ts              ── 베드 위 동적 색 텍스처
    PathTrail.ts            ── 로봇 과거 경로
    UwbAnchors.ts           ── 4 코너 anchor + 거리선
    ZonePicker.ts           ── pointer → store
  plant/                ── Babylon mesh generators
    LeafGenerator.ts
    LeafTexture.ts          ── RawTexture (DynamicTexture 가 WebGPU+PBR 에서 fail)
    StemGenerator.ts
    FruitGenerator.ts
    TrussGenerator.ts
  simulation/           ── 엔진 무관 (zero Babylon/Three)
    GrowthEngine.ts         ── public façade
    GrowthModel.ts          ── apex-driven 생장 (336 줄)
    PhysicsModel.ts         ── pipe-model 줄기 + 캔틸레버 화방
    PlantGenome.ts          ── 30+ 게놈 파라미터
    GrowthController.ts     ── (legacy Three.js 진입점 전용)
  sim/SunPosition.ts    ── 35°N 태양 위치 (엔진 무관)
  utils/SeededRandom.ts
  utils/LSystem.ts      ── (현재 미사용, legacy)
public/
  favicon.svg
  hdri/environment.env  ── Babylon CC0 IBL (~270KB)
docs/
  architecture.md
  development-guide.md  ── 이 파일
```

---

## 2. 일반 워크플로

### 2.1 빌드 / 타입체크 / 미리보기

```bash
npm run dev           # Vite dev server (port 8090, HMR)
npm run build         # tsc --noEmit + vite build → dist/
npm run preview       # production build 미리보기
npx tsc --noEmit      # 타입체크만
```

### 2.2 식물 생장 로직 수정

`src/simulation/GrowthModel.ts` 또는 `PhysicsModel.ts` 만 건드리면 됨. PlantState 인터페이스 변경 시:
1. `GrowthModel.ts` 의 `NodeState` / `PlantState` 타입 업데이트
2. `LeafGenerator.createLeafMeshFromNode` / `StemGenerator.createStemMesh` 가 새 필드 사용하도록 수정
3. `ShowcasePlant.buildFromState` 가 새 필드 활용

게놈 파라미터 추가:
1. `PlantGenome.ts` 의 `PlantGenome` 인터페이스 + `generateGenome` 에 기본값 추가
2. 사용 위치 (GrowthModel, PhysicsModel) 에서 default-fallback 처리

### 2.3 환경 변수 (온도/조도 등) 슬라이더 추가

`GrowthEngine.setEnvironment({ ... })` 가 6개 변수 받음. UI 슬라이더 추가 절차:
1. `twinStore` 에 새 필드 + setter
2. `BabylonEngine.subscribe` 에서 변화 시 `greenhouse.growthEngine.setEnvironment({...})` 호출
3. ShowcasePlant 이 다음 day-scrub 에서 자동으로 새 환경 반영 (computeState 가 환경 적용)

### 2.4 새 React 컴포넌트 추가

- `components/` 폴더에 새 파일
- store 구독: `const x = useTwinStore((s) => s.x)`
- 3D world 좌표 라벨 필요시: `LabelOverlay` 에 `setLabels` 호출 (BabylonEngine 렌더 루프가 매 frame project)

### 2.5 mesh dispose 주의

씬에서 mesh를 동적 생성/제거할 때 (예: ShowcasePlant), TransformNode.dispose() 는 **기본적으로 자식 mesh를 dispose 하지 않음**. 반드시 다음 패턴 사용:

```ts
for (const child of node.getChildMeshes(false)) {
  child.dispose(false, true);   // disposeMaterialAndTextures = true
}
node.dispose(false, true);
```

`ShowcasePlant.disposeAll()` 이 좋은 참조.

---

## 3. WebGPU vs WebGL2 호환성 메모

| 기능 | WebGPU | WebGL2 |
|------|--------|--------|
| SSAO2RenderingPipeline | ❌ Babylon 9.x PrePassRenderer 비호환 | ✅ 활성 (코드에서 자동 분기) |
| DynamicTexture + PBRMaterial | ❌ silent fail (mesh 안 보임) | ✅ |
| RawTexture (Uint8Array) | ✅ | ✅ |
| HighlightLayer | ✅ | ✅ |
| GradientMaterial (sky) | ✅ | ✅ |
| `SkyMaterial` (Hosek-Wilkie) | ❌ silent fail | ✅ |
| HDRCubeTexture (.env prefiltered) | ✅ | ✅ |
| CascadedShadowGenerator | ⚠️ 일부 device 불안정 (현재 기본 ShadowGenerator 사용) | ✅ |

**일반 원칙**: WebGPU 우선 시도, side-effect import 누락 시 silent fail 가능. 의심 시 `await tryWebGPU` 를 `null` 반환하게 강제하고 WebGL2 결과와 비교.

---

## 4. 검증 (Playwright)

`verify-farmsim.mjs` (gitignored). 처음 사용 시:

```bash
npm install --no-save playwright@1.60.0
# (기존 시스템 Chrome 사용, 별도 chromium 다운로드 없음)
node verify-farmsim.mjs
```

출력:
- 콘솔 에러 / 페이지 에러 / HTTP 4xx-5xx 목록
- HUD 텍스트 (fps · backend)
- 스크린샷 `/tmp/farmsim-verify.png` + 변화 상태별 추가
- 60초 재생 후 heap delta (목표 < +100MB)
- 오프라인 reload 테스트 (production build 권장)

기본 스크린샷 사이즈: 1920×1200. viewport 조정 시 `verify-farmsim.mjs` 의 `newPage({ viewport: ... })` 수정.

---

## 5. 자주 마주칠 이슈

### 5.1 dev server 안 뜨거나 404 폭주
- Vite optimize cache stale: `rm -rf node_modules/.vite && npm run dev`
- 8090 포트 점유: `lsof -ti:8090 | xargs kill -9`

### 5.2 잎이 안 보임 (검정 / 사라짐)
- DynamicTexture 사용 가능성 → `RawTexture` 로 교체 (`LeafTexture.ts` 참조)
- 카메라 시야 밖 → `cameraRig.setPreset('overview')` 로 확인

### 5.3 setupScene 실패
- side-effect import 누락 → `SceneSetup.ts` 상단 `@babylonjs/core/PostProcesses/...` import 확인

### 5.4 메모리 증가
- ShowcasePlant 같은 동적 mesh 재생성에서 `disposeAll` 의 자식 재귀 dispose 확인 (위 2.5 참조)

### 5.5 분석 모드 토글했는데 outline 안 보임
- ShowcasePlant 의 leaf/fruit/stem mesh 가 `currentParts` 에 추가됐는지 확인
- 분석 모드 토글 후 `applySegmentationHighlights()` 가 호출되는지 (mesh 재빌드 시 자동)

---

## 6. CI / 배포

현재 CI 없음. 수동 배포:

```bash
npm run build         # dist/ 생성
# dist/ 를 정적 호스팅 (Vercel/Netlify/S3 모두 동작)
# /hdri/environment.env 가 함께 배포되어야 IBL 로딩
```

배포 전 production build 검증:

```bash
npm run build
npm run preview       # dist/ 를 4173 포트로 서빙
node verify-farmsim.mjs   # URL 만 preview 포트로 변경
```

---

## 7. 향후 작업 (Out-of-Scope, future)

| 작업 | 시점 / 트리거 |
|------|-------------|
| ThinInstance 인스턴싱 (지지 식물 29 그루) | 식물 ≥ 100 그루 또는 fps < 60 시 |
| 빌보드 impostor + 사전 렌더 atlas | 다중 베드 (≥ 3 베드) 시 |
| 온실/로봇 GLB 자산 교체 | 디자이너가 Blender/Sketchfab 모델 제공 시 |
| 실제 백엔드 연동 (WebSocket/MQTT) | 시제품 → 본 제품 단계 |
| Unreal Pixel Streaming 전시 데모 | 별도 일정/예산 |
| 모바일/태블릿 반응형 | 운영 화면 안정화 후 |
| 시각 회귀 자동 테스트 | CI 구축과 함께 |
| 환경 변수 UI 슬라이더 | 디버그/시연 모드 필요 시 |
