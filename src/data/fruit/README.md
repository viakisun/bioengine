# Fruit Spec Data (`src/data/fruit/`)

Botanical parameter data for the fruit rendering engine (`src/scene/fruit/`).
Researchers tune fruit morphology + LOD + material **here, in JSON**, without
touching engine code.

## 폴더 구조

```
src/data/fruit/
├─ index.ts         ← getFruitSpec(name) registry + cache
├─ manifest.json    ← registry meta (taxonomy + cultivar list)
├─ specs/
│  └─ tomato.json   ← Tomato (Solanum lycopersicum) fruit parameters
└─ README.md        ← (이 파일)
```

## Spec 구조 (FruitSpec schema, 4-way 분리)

| field | 설명 |
|---|---|
| `schemaVersion` | `"1.0"` literal |
| `taxonomy` | family / genus / species / commonName |
| `morphologyRules` | crownRecession, shoulderBulge, ribAmp, asymmetryAmp (vertex 위치 영향) |
| `meshResolution` | high/low/ultraLow × {segments, rings} (LOD) |
| `ripeningRules` | stageCount=6, blossomEndAdvanceFrac (숙도/색) |
| `materialRules` | stage* PBR arrays + subsurfaceTranslucency |
| `cultivars` (optional) | cultivar override layer (multiplier) |

### Cross-field constraints

- `meshResolution`: `high.segments > low.segments > ultraLow.segments`,
  같은 순서 `rings` (Zod refine 강제)
- `materialRules.stage*.length === ripeningRules.stageCount` (3 arrays)
- `segments >= 6`, `rings >= 4`

## Cultivar 우선순위

```
1. base FruitSpec (morphologyRules)
2. CultivarGenome (tomato-engine — ribbingStrength, asymmetryAmp 배수)
3. spec.cultivars[name] override (선택, 마지막 적용)
```

`applyCultivarLayers(base, genome, override)` (FruitSpec.ts) helper로 순차 적용.

## 연구자 가이드 — 실험 시나리오

### "fruit를 더 oblate (납작하게)"
`tomato.json` `morphologyRules.shoulderBulge`를 0.05 → 0.08 (어깨 더 부풀음).

### "stem-end socket 더 깊게"
`tomato.json` `morphologyRules.crownRecession` 0.18 → 0.25.

### "ripening 더 빨리 (blossom-end 더 일찍)"
`tomato.json` `ripeningRules.blossomEndAdvanceFrac` 0.4 → 0.6.

### "ultra-low LOD 더 단순"
`tomato.json` `meshResolution.ultraLow` {segments: 8, rings: 6} → {segments: 6, rings: 4}.

### "stage 3+ 반짝임 더 강하게"
`tomato.json` `materialRules.stageClearcoatIntensity` `[0, 0, 0.30, 0.42, 0.54, 0.66]` → `[0, 0, 0.40, 0.55, 0.70, 0.85]`.

## Validation 확인

```bash
npx playwright test tests/architecture/fruit-engine-l7.spec.ts
```

## Related docs

- `src/scene/fruit/FruitSpec.ts` — Zod schema + types
- `docs/architecture/FRUIT_SPEC_PARAMETER_AUDIT.md` — parameter migration table
- `docs/architecture/LEAF_ENGINE.md` — leaf 같은 패턴 reference
