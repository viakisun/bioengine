# Logging System — namespace + opt-in

> Production source의 console 호출은 _모두_ `createLogger(ns)` 경유.
> 기본 boot 출력 = `[progressive] complete` 1줄 + warn/error.
> 필요시 URL `?debug=engine,growth` 또는 `localStorage.debug='*'`로 opt-in.
>
> Plan SSOT: [`.claude/plans/sleepy-growing-pretzel.md`](../../.claude/plans/sleepy-growing-pretzel.md)
> Enforcement: [`tests/architecture/logger-system.spec.ts`](../../tests/architecture/logger-system.spec.ts) + Phase L6 NO-DIRECT-CONSOLE

---

## 왜 namespace logger인가

Iter 31 Phase H 이전: production source에 **78건** ad-hoc `console.log/warn/error`
호출 + 25+ 개 prefix (`[BabylonEngine]`, `[SkinMeshPlant]`, `[NodeGrowthContext]`,…).
Dev mode boot에 _30+줄_ 출력 → `⚠ floating candidates` 같은 _진짜 warning_이
build stats 사이에 _묻힘_.

Phase L0~L4: 모두 _10 namespace_ + 4 level의 `createLogger(ns)` API로 표준화.
기본 silent + opt-in으로 _필요할 때만_ 자세히.

---

## API

```ts
// 모듈 상단
import { createLogger } from '../utils/logger';
const log = createLogger('engine');  // namespace 선택

// 호출
log.debug('creating engine');       // opt-in only (engine namespace default warn)
log.info('first frame');            // engine default warn → silent (info < warn)
log.warn('WebGPU init failed', err); // 항상 출력 (silenceable)
log.error('setupScene failed', err); // 항상 출력
```

- logger가 _자동_으로 `[ns]` prefix 부착 (호출자는 메시지 텍스트만)
- silent 시 NOOP 함수 → string concat 0 cost

---

## 4 Level + 10 Namespace

### Level 의미

| Level | 의미 | 출력 정책 |
|---|---|---|
| `debug` | 내부 추적 | _opt-in only_ (`?debug=ns`) |
| `info` | 사용자 가치 milestone / interactive feedback | namespace default ≤ info |
| `warn` | 진단 — 잠재 결함 / 부동 상태 | namespace default ≤ warn (silenceable) |
| `error` | 실패 — fallback/recovery | _항상_ 출력 (silence 불가) |

### Namespace + NS_DEFAULTS

| Namespace | Default Level | 모듈 |
|---|---|---|
| `engine` | warn | BabylonEngine, RenderQuality |
| `scene` | warn | SceneSetup, SkeletonOverlay, SceneCanvas |
| `quality` | warn | QualityProbe |
| `progressive` | **info** | ProgressiveLoad (★ user-value milestone) |
| `skinplant` | warn | SkinMeshPlant, ShowcasePlant (build stats는 debug only) |
| `overlay` | **info** | dockingOverlay, leafWireframe, SinglePlantOverlay (hotkey feedback) |
| `growth` | warn | tomato-engine/growth/* + BotanicalSpec |
| `leaf` | warn | LeafShapeSchema, widthProfile |
| `plant` | warn | TrussGenerator |
| `app` | error | main.tsx, ErrorBoundary, legacy `log.*` wrapper |

★ `info` default namespace는 `progressive`, `overlay` — milestone + 사용자 직접
인터랙션 피드백.

★ `app` default `error` — legacy `log.dev/info/warn/error` wrapper는 silent (점진
migrate 후 Iter 32 제거).

---

## Opt-in (사용자 자가 진단)

debug npm 라이브러리와 동일 pattern.

### URL parameter

```
http://localhost:5173?debug=engine,growth     ← engine, growth namespace debug
http://localhost:5173?debug=*                  ← 모든 namespace debug (Phase H 이전 수준)
http://localhost:5173?debug=skinplant&silence=growth   ← skinplant 자세히 + growth mute
```

### localStorage (영구)

```js
// DevTools console
localStorage.setItem('debug', 'engine,growth');
localStorage.setItem('silence', 'growth');  // 선택 — growth warn mute
location.reload();
```

URL `?debug=` 미설정 시 localStorage fallback. 평가 순서: **URL > localStorage > NS_DEFAULTS**.

### CSV 규칙

- `engine,growth` → 2개 namespace
- `*` → ALL_NAMESPACES
- `engine,*` → ALL (`*` 우선)
- `` (empty) → opt-in 없음 (NS_DEFAULTS 적용)

### Silence (warn mute)

```
?silence=growth        → growth는 effective='error' (warn 미출력, error는 출력)
```

★ silence는 _진단 가치 낮은_ 노이지 warn 임시 무음용. 평소엔 사용 비권장.

---

## 사용자 자가 진단 user story

### 문제 신고 → 진단 흐름

**문제 상황**: "leaf rotation이 이상해요" 사용자 신고.

```
1. DevTools console 열기 (F12)
2. 다음 입력:
   localStorage.setItem('debug', 'growth,leaf,plant,skinplant');
3. location.reload();
4. 문제 재현 (예: D=30 stage 진입)
5. console 우클릭 → "Save as..." 또는 "Preserve log" 체크 후 캡쳐
6. dev에게 share
```

`growth + leaf + plant + skinplant` namespace 활성화 시:
- PlantBase growth validation warn
- Leaf shape provenance warn
- Truss generation warn
- Skinplant build stats + breakdown

→ 진단 충분.

### 모든 진단 로그 (Phase H 이전 수준)

```js
localStorage.setItem('debug', '*'); location.reload();
```

---

## 새 모듈에 logger 추가하는 법

```ts
// src/myFeature/MyModule.ts
import { createLogger } from '../utils/logger';

const log = createLogger('engine');  // 기존 namespace 선택

export function myFunction() {
  log.debug('detail trace');         // opt-in only
  log.warn('unexpected state', val); // 항상 출력
}
```

★ 새 namespace가 필요하면 → 다음 절차 참조.

---

## 새 namespace 추가 절차

1. `src/utils/logger.ts`의 `LogNamespace` union에 멤버 추가
2. `NS_DEFAULTS` table에 기본 level 추가
3. (필요시) `packages/tomato-engine/src/utils/logger.ts`에도 추가
4. 이 문서 (`LOGGING.md`)의 namespace 표 갱신
5. PR review에서 default level 적절성 확인 (`info` default는 신중)

---

## Enforcement (Phase L6)

### `LOGGER-NO-DIRECT-CONSOLE-01`

production source의 직접 `console.{log,info,debug,warn,error}(` 호출 0건.

**Whitelist (예외 허용)**:
- `src/utils/logger.ts` — logger 자체
- `src/plant/diagnostics/**` — 명시적 dump (호출자 의도)
- `packages/tomato-engine/diagnostics/**` — 동일
- `packages/tomato-engine/src/utils/logger.ts` — packages logger 자체
- `growth-calibration/scripts/**` — CLI 출력 목적
- `packages/*/test-*.ts` — 테스트 스크립트
- `tests/**` — Playwright spec

### `PRODUCTION-LOG-COUNT-01`

Playwright `page.on('console')`로 boot 출력 line count ≤ **3** (warn/error 있을 시).

기대 출력 (기본):
```
[progressive] complete  total=...ms  finalFps=...  finalMem=...
```
+ `[skinplant] ⚠ floating candidates=N`이 _있다면_ 1~2건 추가.

Vite, Babylon framework, browser violation 메시지는 _제외_ filter.

---

## Production silent 검증 (Before/After)

### Before (Phase H 이전)

```
[vite] connecting...
[vite] connected.
[SinglePlantOverlay] useImplicitMesh changed → false
[SinglePlantOverlay] effect: minute=65520 useImplicitMesh=false ...
[BabylonEngine] creating engine
BJS - [08:48:42]: Babylon.js v9.8.0 - WebGPU1 engine
[BabylonEngine] using WebGPU
[BabylonEngine] shader wind: OFF (WebGPU fallback)
[BabylonEngine] camera ready
[SceneSetup] starting setup (backend=webgpu)
[SceneSetup] IBL loaded from /hdri/environment.env
[SceneSetup] setup complete
[ProgressiveLoad] start (savedQuality=8)
... (총 30+ lines)
[skinplant] ⚠ floating candidates=2     ← 묻힘
[ProgressiveLoad] complete  total=20235ms
```

### After (Phase L0~L7 적용)

```
[vite] connecting...
[vite] connected.
BJS - [08:48:42]: Babylon.js v9.8.0 - WebGPU1 engine
[skinplant] ⚠ floating candidates=2     ← 명확
[progressive] complete  total=20235ms  finalFps=...  finalMem=...
```

★ 5 lines (production lines 3) — warning이 명확히 보임.

### opt-in (`?debug=skinplant`)

```
... (Vite/Babylon)
[skinplant] graph: nodes=189 edges=152 | tube: ...
[skinplant] per-edge-type breakdown: ...
[skinplant] ⚠ floating candidates=2
[skinplant] per-leaf meshes=28
[skinplant] graph: nodes=61 edges=44 | tube: ...
[skinplant] per-edge-type breakdown: ...
[skinplant] ⚠ floating candidates=1
[skinplant] per-leaf meshes=8
[progressive] complete  ...
```

---

## Performance (silent cost)

silent 시 `NOOP` 함수 호출 — string concat 발생 _0_:
```ts
log.debug('detail msg');                  // → noop()
log.debug(`build ${count} items in ${t}ms`); // → noop() — template literal은 평가됨!
```

★ 두 번째 형태처럼 _string template literal_을 인자로 넘기면 silent에도 _concat 비용_
발생. 성능 critical 경로 (매 frame 호출 등)에서 logger 호출 _금지_.

권장:
```ts
// 좋은 예 — silent 시 0 cost
log.debug('build complete');

// 주의 — silent여도 string template 평가
log.debug(`build ${count} items in ${t}ms`);

// 매 frame 호출이면 lazy:
if (DEBUG_ENABLED) log.debug(`...heavy concat...`);
```

---

## 관련 commit chain

- `4d21f3c` — Phase L0: logger 재설계 + 12 spec
- `201e0bc` — Phase L1: src/twin + src/components migrate
- `974ed9f` — Phase L2: src/ui + src/main.tsx
- `cfc9c82` — Phase L3: src/plant
- `5701191` — Phase L4: packages/tomato-engine logger + growth migrate

Phase L5~L7 진행 중.

---

## Iter 32 후보

- Legacy `log.dev/info/warn/error` wrapper (`createLogger('app')` alias) 완전 제거
- Phase H의 `app` namespace 의존 코드 _전부_ 명시 namespace로 migrate 완료 후
