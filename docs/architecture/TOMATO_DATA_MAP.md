# Tomato Data Map — 5 Layer 14 Files

> **This document is a human-readable mirror of
> [`packages/tomato-engine/models/INDEX.jsonc`](../../packages/tomato-engine/models/INDEX.jsonc).
> If there is a conflict, `INDEX.jsonc` is the source of truth.**

토마토 시뮬레이션의 _모든_ 구조화된 데이터 파일을 한눈에 추적하기 위한
카탈로그. AI agent + human 둘 다 "토마토 X 데이터 어디 있어?"라는 질문에
이 표 + INDEX.jsonc 한 번으로 답을 얻도록 설계.

물리 단편화는 _의도된 것_: 각 layer는 서로 다른 _reader_, _owner_,
_lifecycle_, _aggregate boundary_를 가짐 (engine purity 원칙 #42, DDD
aggregate boundary). 통합은 _논리적_으로만 — 이 MAP + INDEX.jsonc.

## 검증

- INDEX.jsonc 진입점: [`packages/tomato-engine/models/INDEX.jsonc`](../../packages/tomato-engine/models/INDEX.jsonc)
- Drift 방어선: [`tests/architecture/tomato-data-index.spec.ts`](../../tests/architecture/tomato-data-index.spec.ts)
- 신규 layer 추가 시 INDEX.jsonc + 본 MAP + spec 동시 갱신 의무.

## 5 Layer 14 Files

### 1. Visual (rendering engine, plant-agnostic)

| 파일 | reader | owner | lifecycle | layer key |
|---|---|---|---|---|
| [`src/data/leaf/specs/tomato.json`](../../src/data/leaf/specs/tomato.json) | `src/data/leaf/index.ts` (`getLeafSpec`) | render-eng | weekly | `visual.leaf` |
| [`src/data/fruit/specs/tomato.json`](../../src/data/fruit/specs/tomato.json) | `src/data/fruit/index.ts` (`getFruitSpec`) | render-eng | weekly | `visual.fruit` |

엔진 코드 (`src/scene/leaf/`, `src/scene/fruit/`)는 **plant-agnostic** — 코드
안 `tomato` 단어 0. 모든 botanical parameter는 이 JSON에서. 미래 cucumber
추가 시 `cucumber.json`만 추가, 엔진 코드 변경 0.

### 2. Physiology (TOMGRO 5-state)

| 파일 | reader | owner | lifecycle | layer key |
|---|---|---|---|---|
| [`packages/tomato-engine/models/tomgro-v1.jsonc`](../../packages/tomato-engine/models/tomgro-v1.jsonc) | `ModelRegistry.ts` | model-eng | monthly | `physiology` |

LUE, Beer-Lambert k, Q10, T_base, abortion, diurnal envelope, LAI cap.
_모든 cultivar 공통_.

### 3. Botanical (식물 구조/성장 모델)

| 파일 | reader | owner | lifecycle | layer key |
|---|---|---|---|---|
| [`packages/tomato-engine/models/botanical/tomato.jsonc`](../../packages/tomato-engine/models/botanical/tomato.jsonc) | `ModelRegistry.ts` | botanist + model-eng | monthly | `botanical` |

Stem growth (hypocotyl, internode, elongation, height curve) + fruit
development (Gompertz, ripening, flowering, mass flow).

### 4. Cultivar (품종별 override)

| 파일 | reader | owner | lifecycle | layer key |
|---|---|---|---|---|
| [`packages/tomato-engine/models/cultivars/cherry-generic.jsonc`](../../packages/tomato-engine/models/cultivars/cherry-generic.jsonc) | `ModelRegistry.ts` | agronomist | quarterly | `cultivar` |
| [`packages/tomato-engine/models/cultivars/beefsteak-generic.jsonc`](../../packages/tomato-engine/models/cultivars/beefsteak-generic.jsonc) | `ModelRegistry.ts` | agronomist | quarterly | `cultivar` |
| [`packages/tomato-engine/models/cultivars/roma-generic.jsonc`](../../packages/tomato-engine/models/cultivars/roma-generic.jsonc) | `ModelRegistry.ts` | agronomist | quarterly | `cultivar` |
| [`packages/tomato-engine/models/cultivars/round-generic.jsonc`](../../packages/tomato-engine/models/cultivars/round-generic.jsonc) | `ModelRegistry.ts` | agronomist | quarterly | `cultivar` |
| [`packages/tomato-engine/models/cultivars/tomimaru-muchoo.jsonc`](../../packages/tomato-engine/models/cultivars/tomimaru-muchoo.jsonc) | `ModelRegistry.ts` | agronomist | quarterly | `cultivar` |

신규 cultivar 추가 절차: `packages/tomato-engine/models/README.md` §
"Adding a New Cultivar" 참조.

### 5. Training (재배 시나리오)

| 파일 | reader | owner | lifecycle | layer key |
|---|---|---|---|---|
| [`packages/tomato-engine/models/training/single-stem-high-wire.jsonc`](../../packages/tomato-engine/models/training/single-stem-high-wire.jsonc) | Scenario registry | agronomist | quarterly | `training` |
| [`packages/tomato-engine/models/training/free-bush.jsonc`](../../packages/tomato-engine/models/training/free-bush.jsonc) | Scenario registry | agronomist | quarterly | `training` |

Cultivar와 _독립적_ — pruning / training policy.

### 6. Calibration (런타임 assertion target)

| 파일 | reader | owner | lifecycle | layer key |
|---|---|---|---|---|
| [`packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc`](../../packages/tomato-engine/models/calibration/tomato-growth-targets.jsonc) | `growth/CalibrationPack.ts` | calib-ops | weekly | `calibration` |

Reference Pack v0.1 height/leaf/truss band by day. Single-Plant Analysis가
런타임 drift 감지에 사용.

### 7. Diagnostic (운영 진단 규칙)

| 파일 | reader | owner | lifecycle | layer key |
|---|---|---|---|---|
| [`growth-calibration/schema/diagnostic_rules/tomato.jsonc`](../../growth-calibration/schema/diagnostic_rules/tomato.jsonc) | growth-calibration scripts | qa-ops | on-incident | `diagnostic` |
| [`growth-calibration/schema/diagnostic_rules/tomato_tomimaru_day33.jsonc`](../../growth-calibration/schema/diagnostic_rules/tomato_tomimaru_day33.jsonc) | growth-calibration scripts | qa-ops | on-incident | `diagnostic` |

Cultivar-agnostic + per-day rule. `common.jsonc` 위에 layered.

### 8. Audit (read-only, runtime X)

| 파일 | reader | owner | lifecycle | runtime |
|---|---|---|---|---|
| [`docs/expert-review/tomato-growth-model.review.json`](../expert-review/tomato-growth-model.review.json) | (none — humans only) | external reviewer | one-shot | `false` |

Audit baseline — 현재 hardcoded biological parameter 중 model data로
옮겨야 할 것들의 expert 리뷰. **엔진에서 읽지 않음**.

## Layer Ownership 요약

| Layer | Owner | Lifecycle | Aggregate |
|---|---|---|---|
| visual.leaf | render-eng / designer | weekly (HMR tweak) | Render |
| visual.fruit | render-eng | weekly | Render |
| physiology | model-eng | monthly | Growth-engine |
| botanical | botanist + model-eng | monthly | Growth-engine |
| cultivar | agronomist | quarterly | Growth-engine |
| training | agronomist | quarterly | Growth-engine |
| calibration | calib-ops | weekly (sweep) | Calibration |
| diagnostic | qa-ops | on-incident | Calibration |
| audit | external reviewer | one-shot | Read-only |

## 활성 원칙 #53

데이터 layer는 _물리적으로 단편화 OK, 논리적으로는 단일 진입점_. Engine
purity (#42) + ownership boundary (DDD aggregate) + lifecycle 차이를 보존
하기 위해 파일은 영역별로 분리 유지. 그러나 _discoverability_는 단일
manifest (INDEX.jsonc) + AI memory anchor (CLAUDE.md) + human mirror
(본 문서)로 _logical unification_. 신규 데이터 파일 추가 시 `layer` field
필수 + INDEX 갱신 의무.

## Future — Multi-Crop 확장

미래 cucumber 추가 시 동일 패턴 복제:
- `src/data/leaf/specs/cucumber.json` + `src/data/fruit/specs/cucumber.json`
- `packages/cucumber-engine/models/INDEX.jsonc` (cucumber umbrella)
- `docs/architecture/CUCUMBER_DATA_MAP.md` (mirror)
- CLAUDE.md에 cucumber catalog anchor 추가

원칙 #42 (engine purity) 손상 없이 확장 가능.
