# Fruit Spec Parameter Audit (Phase L7)

> L6 leaf 완료 후, fruit는 _morphology quality 우수_ but _spec 부재_ — 모든
> botanical/rendering magic 코드 hardcoded. L7는 leaf L4~L6 패턴 (data-driven
> spec + LOD + simple material)을 fruit에 적용.
>
> 본 doc은 **L7-A migration table** (Section 1) + **non-fruit allowlist**
> (Section 2) + **cultivar 우선순위** (Section 3) + **sub-phase mapping**
> (Section 4) 4 sections로 구성.

## Section 1 — Migration Table

### A. Morphology (vertex 위치 영향, S63 L7-A-3a)

| 위치 | 현재 값 | botanical 의미 | JSON destination |
|---|---|---|---|
| [FruitGenerator.ts:38](src/scene/fruit/FruitGenerator.ts#L38) | `CROWN_RECESSION = 0.18` | stem-end socket 깊이 (× radius) | `morphologyRules.crownRecession` |
| [FruitGenerator.ts:39](src/scene/fruit/FruitGenerator.ts#L39) | `SHOULDER_BULGE = 0.05` | socket 아래 ring 바깥 swell | `morphologyRules.shoulderBulge` |
| (genome) | `ribAmp` (cultivar.ribbingStrength 영향) | radial ribbing depth | `morphologyRules.ribAmp` (baseline 0) |
| (genome) | `asymmetryAmp` (cultivar.asymmetryAmp 영향) | per-fruit asymmetry | `morphologyRules.asymmetryAmp` (baseline 0) |

### B. Mesh Resolution (perf — LOD, S64 L7-A-3b)

| 위치 | 현재 값 | 용도 | JSON destination |
|---|---|---|---|
| [FruitGenerator.ts:34](src/scene/fruit/FruitGenerator.ts#L34) | `SEGMENTS_HIGH = 36` | hero (showcase) longitudinal segments | `meshResolution.high.segments` |
| [FruitGenerator.ts:35](src/scene/fruit/FruitGenerator.ts#L35) | `RINGS_HIGH = 22` | hero latitudinal rings | `meshResolution.high.rings` |
| [FruitGenerator.ts:36](src/scene/fruit/FruitGenerator.ts#L36) | `SEGMENTS_LOW = 14` | supporting (default) | `meshResolution.low.segments` |
| [FruitGenerator.ts:37](src/scene/fruit/FruitGenerator.ts#L37) | `RINGS_LOW = 10` | supporting | `meshResolution.low.rings` |
| **신규** | `(no current ultra-low)` | far LOD (L7-B-1에서 사용) | `meshResolution.ultraLow.{segments: 8, rings: 6}` |

### C. Ripening (숙도/색 영향, S65 L7-A-3c)

| 위치 | 현재 값 | botanical 의미 | JSON destination |
|---|---|---|---|
| [FruitGenerator.ts:168](src/scene/fruit/FruitGenerator.ts#L168) | `0.4` (genome fallback `blossomEndAdvanceFrac`) | blossom-end ripening lead fraction | `ripeningRules.blossomEndAdvanceFrac` |
| (fixed) | `stageCount = 6` | ripening stages 0~5 | `ripeningRules.stageCount: 6` |

### D. Material (PBR coefficients, S65 L7-A-3c)

산식 _array form_ 으로 변환 (stage 0~5):

| 위치 | 산식 → 배열 | JSON destination |
|---|---|---|
| [FruitGenerator.ts:299](src/scene/fruit/FruitGenerator.ts#L299) | `roughness = 0.42 - stage × 0.025` → `[0.42, 0.395, 0.37, 0.345, 0.32, 0.295]` | `materialRules.stageRoughness[6]` |
| [FruitGenerator.ts:300-301](src/scene/fruit/FruitGenerator.ts#L300) | `clearCoat: stage<2→0, else 0.30 + (stage-2)×0.12` → `[0, 0, 0.30, 0.42, 0.54, 0.66]` | `materialRules.stageClearcoatIntensity[6]` |
| [FruitGenerator.ts:302](src/scene/fruit/FruitGenerator.ts#L302) | `clearCoat.roughness = 0.18 - stage × 0.012` → `[0.18, 0.168, 0.156, 0.144, 0.132, 0.120]` | `materialRules.stageClearcoatRoughness[6]` |
| [FruitGenerator.ts:303-305](src/scene/fruit/FruitGenerator.ts#L303) | `subSurface: stage>=3, intensity 0.15` | `materialRules.subsurfaceTranslucency.{fromStage: 3, intensity: 0.15}` |
| [FruitGenerator.ts:306](src/scene/fruit/FruitGenerator.ts#L306) | `tintColor #8b1a14` | `materialRules.subsurfaceTranslucency.tintColor: '#8b1a14'` (선택) |
| [FruitGenerator.ts:307-308](src/scene/fruit/FruitGenerator.ts#L307) | `minThickness 0.5, maxThickness 1.5` | (별 phase — subsurface thickness 미세 조정) |

## Section 2 — Non-fruit Allowlist (intentionally kept in code)

`FRUIT-SPEC-NO-TOMATO-01` / `FRUIT-SPEC-BOTANICAL-PARAMETERS-01` 검증 시 _허용_:

### Math constants

| 값 | 위치 | 목적 |
|---|---|---|
| `Math.PI`, `Math.PI * 2` | 다수 | latitudinal angle / longitudinal angle |
| `0.5` | 다수 | half / mid |

### Geometry algorithm constants

| 값 | 위치 | 목적 |
|---|---|---|
| `0`, `1`, `-1`, `2` | 다수 | loop bound / clamp / array index |
| `0.7`, `1.0` | stageStrength curve | _stage curve shape, not parameter_ — algorithm internal |

### Floating-point safety

| 값 | 목적 |
|---|---|
| `1e-5`, `1e-6`, `1e-9` | EPS |
| `0.5`, `1.5` (subsurface thickness) | _physical thickness range_, 후속 phase에서 spec 검토 가능 |

### Hash / seed constants

| 위치 | 값 | 목적 |
|---|---|---|
| `genome.asymmetrySeed`, `mottleSeed` | (passed in) | per-fruit deterministic — not magic |

### Babylon-related

| 위치 | 값 | 목적 |
|---|---|---|
| `Color3.FromHexString('#8b1a14')` (subsurface tint) | 색상 hex | 미래: `materialRules.subsurfaceTranslucency.tintColor` |
| `Color3(1, 1, 1)` (albedo white = texture passthrough) | 산식 | not magic |

## Section 3 — Cultivar Variation 우선순위 (★ 보완 #4)

### 현재 source 정리

| Layer | Source | 영향 |
|---|---|---|
| 1. base shape | `FruitGenerator.ts` 산식 | 기본 oblate spheroid + crown recession + shoulder bulge |
| 2. CultivarGenome | `tomato-engine` packages — `heightWidthRatio`, `ribbingStrength`, `loculeCount`, `asymmetryAmp`, `blossomEndAdvanceFrac`, `asymmetrySeed`, `mottleSeed` (FruitState.cultivarSample 안 embed) | primary cultivar variation source |
| 3. **spec.cultivars[name] override** | _L7 신규_ | optional correction layer — JSON 수정으로 특정 cultivar 보정 |

### 적용 순서 (L7 strict)

```
base FruitSpec (morphology baseline)
  └→ CultivarGenome (per-fruit 산출, tomato-engine 책임)
     └→ spec.cultivars[name]?.{ crownRecessionDelta, shoulderBulgeDelta, ... } 추가 적용
```

`applyCultivarLayers(base, genome, override)` helper (S61):
```ts
function applyCultivarLayers(
  baseMorph: MorphologyRules,
  genome: CultivarGenome,
  override?: FruitCultivarOverride,
): EffectiveMorphology {
  // 1. base
  let effective = { ...baseMorph };
  // 2. genome (heightWidthRatio, ribbingStrength 등)
  effective.ribAmp = baseMorph.ribAmp * genome.ribbingStrength;
  effective.asymmetryAmp = baseMorph.asymmetryAmp * genome.asymmetryAmp;
  // 3. override (선택)
  if (override?.crownRecessionMultiplier) {
    effective.crownRecession *= override.crownRecessionMultiplier;
  }
  // ...
  return effective;
}
```

### 충돌 해결 원칙

연구자가 "왜 beefsteak이 이렇게 생겼는지" 추적 시 — _3 layer 순차_:
1. base 값 확인 (tomato.json)
2. CultivarGenome 적용 확인 (tomato-engine cultivar.jsonc)
3. spec.cultivars override 확인 (tomato.json cultivars 섹션)

### Out of scope (L7)

- spec.cultivars _실제 사용_ (L7는 schema/registry만, 실제 cultivar 추가는 미래)
- CultivarGenome ↔ spec 충돌 정책 (현재 _순차 적용_, 미래 _priority flag_ 가능)

## Section 4 — Sub-phase Mapping

| Sub-phase | Audit entries 다룸 | parity 검증 |
|---|---|---|
| L7-A-1 (S61) | Zod schema 정의 (모든 sections) | schema 자체 |
| L7-A-2 (S62) | tomato.json 모든 entries 채움 | ZOD-VALID-01 |
| L7-A-3a (S63) | Section 1.A morphology (CROWN/SHOULDER + ribAmp/asymmetryAmp) | GEOMETRY-PARITY-01 |
| L7-A-3b (S64) | Section 1.B mesh resolution (SEGMENTS/RINGS HIGH/LOW) | GEOMETRY-PARITY-01 |
| L7-A-3c (S65) | Section 1.C+1.D ripening + material (blossomEndAdvanceFrac + PBR 배열) | COLOR-PARITY-01 + MATERIAL-PARITY-01 |
| L7-A-4 (S66) | FruitEngine namespace | ENGINE-API-01 |
| L7-A-5 (S67) | 5 architecture invariants + docs | NO-TOMATO + COVERAGE + TAXONOMY |
| L7-B-1 (S69) | Section 1.B ultraLow 신규 활성 | LOD-SWITCH-01 |
| L7-B-2 (S70) | Stage-based simple material | MATERIAL-LOD-01 |

## ★ Acceptance Criteria

L7-A 완료 시:
1. `FruitGenerator.ts` 안 botanical/rendering magic = 0 (이 문서 Section 1 모든 entries _migrated_)
2. `tomato.json` (fruit) schemaVersion '1.0', 모든 Section 1 destinations 존재
3. GEOMETRY-PARITY-01 + COLOR-PARITY-01 + MATERIAL-PARITY-01 PASS (vertex/color/material byte-identical)
4. FRUIT-ENGINE-API-01, FRUIT-SPEC-NO-TOMATO-01, FRUIT-SPEC-ZOD-VALID-01,
   FRUIT-SPEC-BOTANICAL-PARAMETERS-01 (audit-based), FRUIT-SPEC-TAXONOMY-01 PASS
5. typecheck PASS

L7-B 완료 시:
6. FRUIT-LOD-SWITCH-01 PASS (threshold 5/15m, leaf 일관)
7. FRUIT-MATERIAL-LOD-01 PASS (ultra-low → stage-based simple)
8. visual 동일 near/mid + 인지 불가 far (사용자 시각 checkpoint)
