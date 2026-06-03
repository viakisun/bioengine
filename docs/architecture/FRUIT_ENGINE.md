# Fruit Engine — Architecture (Iter 39 Phase L7)

> Engine vs Data layer SSOT (leaf L4~L6 패턴 fruit 적용). 연구자가 JSON으로
> fruit morphology/LOD/material 실험할 수 있는 fruit rendering pipeline.

## Layer 분리

```
src/scene/fruit/                  ← rendering engine (plant-agnostic — "tomato" 단어 0)
├─ FruitEngine.ts                  ← createFruit (facade)
├─ FruitSpec.ts                    ← Zod schema + parseFruitSpec + applyCultivarLayers
├─ FruitGenerator.ts               ← mesh + material 산식 (spec 주입)
└─ index.ts                        ← barrel

src/data/fruit/                   ← data + registry
├─ index.ts                        ← getFruitSpec(name) + cache
├─ manifest.json                   ← registry meta
├─ specs/
│  └─ tomato.json                  ← Tomato fruit parameters (Solanaceae / Solanum / lycopersicum)
└─ README.md                       ← 연구자 가이드
```

## ★ 핵심 원칙

### #41 Code = formula, Data = parameter (fruit 적용)

수학/geometric 산식 (Spherical/oblate/ribbing/asymmetry math)은 engine 코드.
모든 botanical/rendering 수치는 JSON spec.

### #42 Engine layer purity (fruit)

`src/scene/fruit/` 안 `'tomato'` 단어 0. spec parameter로 모든 botanical data
받음. registry는 _data layer_ (`src/data/fruit/`).

### #50 Organ data-driven 일관성

leaf/fruit 모두 동일 패턴:
- `src/scene/{organ}/` engine
- `src/data/{organ}/specs/` data
- `{Organ}Engine` namespace
- Zod spec + Taxonomy

## Public API

```ts
import { FruitEngine } from '../scene/fruit';
import { getFruitSpec } from '../data/fruit';

const spec = getFruitSpec('tomato.json');

const fruitNode = FruitEngine.createFruit(spec, name, scene, fruit, rng, {
  lod: 'high',           // 'high' | 'low' | 'ultraLow' (L7-B)
  skipCalyxAndStem: false,
});
```

## FruitSpec sections (4-way 분리)

| field | 설명 |
|---|---|
| `taxonomy` | family / genus / species / commonName |
| `morphologyRules` | crownRecession, shoulderBulge, ribAmp, asymmetryAmp (vertex 위치) |
| `meshResolution` | high/low/ultraLow × {segments, rings} (LOD) |
| `ripeningRules` | stageCount=6, blossomEndAdvanceFrac |
| `materialRules` | stage* PBR arrays + subsurfaceTranslucency |
| `cultivars` (optional) | cultivar override layer |

### Cross-field constraints

- `meshResolution`: high > low > ultraLow (segments/rings 모두)
- `segments >= 6`, `rings >= 4`
- `materialRules.stage*.length === ripeningRules.stageCount`

## Cultivar 우선순위 (audit Section 3)

```
1. base FruitSpec (morphologyRules)
2. CultivarGenome (tomato-engine — ribbingStrength, asymmetryAmp 배수)
3. spec.cultivars[name] override (선택, 마지막)

applyCultivarLayers(base, genome, override) → EffectiveFruitMorphology
```

## 호출 그래프

```
TrussGenerator.ts (caller)
  └─ const spec = getFruitSpec('tomato.json')          ← data layer (Zod 검증)
  └─ createFruitNode(name, scene, fruit, rng, spec, opts)
     └─ buildFruitBodyVertexData(fruit, genome, spec, lod)
        └─ spec.meshResolution[lod] {segments, rings}
        └─ spec.morphologyRules.{crownRecession, shoulderBulge}
        └─ ripening 산식 spec.ripeningRules.blossomEndAdvanceFrac
     └─ getBodyMaterial(scene, stage, spec)
        └─ spec.materialRules.{stageRoughness[stage], stageClearcoatIntensity[stage], ...}
        └─ spec.materialRules.subsurfaceTranslucency.{fromStage, intensity, tintColor}
```

## 검증 invariants (Phase L7, fruit-engine-l7.spec.ts)

| ID | 검증 |
|---|---|
| FRUIT-ENGINE-API-01 | FruitEngine.createFruit + CreateFruitOptions |
| FRUIT-SPEC-NO-TOMATO-01 | engine 코드 안 'tomato' 단어 0 (scope: `src/scene/fruit/**/*.ts`) |
| FRUIT-SPEC-ZOD-VALID-01 | tomato.json schema parse + cross-field constraint |
| FRUIT-SPEC-BOTANICAL-PARAMETERS-01 | audit-based — CROWN_RECESSION / SHOULDER_BULGE const 0 + spec 사용 |
| FRUIT-SPEC-TAXONOMY-01 | 4 fields 필수 |
| FRUIT-MATERIAL-PARITY-01 | spec.materialRules 값이 pre-L7-A-3c 산식과 byte-identical (18 PBR + subsurface) |
| FRUIT-COLOR-PARITY-01 | blossomEndAdvanceFrac fallback 0.4 |

총 7 신규 invariants L7-A. L7-B에서 LOD-SWITCH-01 + MATERIAL-LOD-01 추가.

## History

- **L7-0** (S60) — Audit doc (FRUIT_SPEC_PARAMETER_AUDIT.md 4 sections)
- **L7-A-1** (S61) — FruitSpec.ts Zod schema (4-way + cross-field refines)
- **L7-A-2** (S62) — src/data/fruit/specs/tomato.json + registry + README
- **L7-A-3a/b** (S63) — morphology + resolution migration
- **L7-A-3c** (S64) — material/ripening migration + COLOR + MATERIAL parity
- **L7-A-4** (S65) — FruitEngine namespace + index barrel
- **L7-A-5** (S66) — docs + invariants complete

L7-B: LOD distance switch + stage-based simple material (S67~S69).
