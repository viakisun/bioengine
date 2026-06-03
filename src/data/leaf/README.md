# Leaf Spec Data (`src/data/leaf/`)

Botanical parameter data for the leaf rendering engine (`src/scene/leaf/`).
Researchers tune leaf morphology **here, in JSON**, without touching engine code.

## 폴더 구조

```
src/data/leaf/
├─ index.ts         ← getLeafSpec(name) registry + cache
├─ manifest.json    ← registry meta (taxonomy + cultivar list)
├─ specs/
│  └─ tomato.json   ← Tomato (Solanum lycopersicum) botanical parameters
└─ README.md        ← (이 파일)
```

미래 plant 추가 (예: cucumber, lettuce) 시:
1. `specs/cucumber.json` 작성 — `tomato.json` 구조 따름
2. `index.ts` REGISTRY entry 추가
3. `manifest.json` taxonomy entry 추가
4. engine 코드 변경 0 — caller가 `getLeafSpec('cucumber.json')`로 사용

## Spec 구조 (LeafSpec schema)

각 spec JSON은 `src/scene/leaf/LeafSpec.ts`의 `LeafSpecSchema` (Zod)
runtime validation을 통과해야 함. 잘못 편집 시 `getLeafSpec()` 호출 시점에
`ZodError` 발생 (어디서 무엇이 잘못되었는지 명시).

### 필수 fields

| field | 설명 |
|---|---|
| `schemaVersion` | `"1.0"` literal — 미래 migration entrypoint |
| `taxonomy` | family / genus / species / commonName (botanical classification) |
| `agePresets` | 5종 (young/mature/old/complex/potato-leaf) — 각 morphology range 묶음 |
| `profileByPosition` | terminal / primary / intercalary / secondary 별 leaflet shape 비율 |
| `correlationRules` | §8 산식 계수 (complexity → 산출물 mapping) |
| `poseRules` | leaflet 회전 noise (rad) + L0-D-1 fold droop (deg) + per-leaflet jitter % |
| `lobeNoiseRules` (★ L5) | 큰 결각 sin 합성 — `positiveOnly` + `waves[]` (freq/phase/weight) |
| `leafInstanceRules` (★ L5) | leaf-level macro — leftRightImbalance range + apex boost |
| `shapeProfileRules` (★ L5) | base wedge transition + cultivar clamps + maturity envelope + openness |
| `edgeAsymmetryRules` (★ L5) | 좌우 lobe/serration weight (leaf 자연 비대칭) |

### Optional

| field | 설명 |
|---|---|
| `cultivars` | cherry/beefsteak/roma 등 cultivar별 shape multiplier/bias |
| `extends` | 미래 base spec composition hook (현재 unused) |

### schemaVersion 정책

- v1.1 (L5 이후, 현재): 모든 botanical parameter JSON 이관
- v1.0 (L4): _deprecated_ — runtime은 1.1만 허용

### Cross-field constraint

- `profileByPosition.terminal.lobeDepth >= profileByPosition.intercalary.lobeDepth`
  (botanical: terminal이 가장 elaborate, intercalary는 단순한 보조엽)

## 연구자 가이드 — 실험 시나리오

### "intercalary를 더 단순하게"
`tomato.json` →
```json
"intercalary": {
  "widthRatio": 0.34,
  "lobeDepth": 0.04,    // ↓ (0.07 → 0.04)
  "serrationAmp": 0.01, // ↓
  ...
}
```

### "beef 계열을 더 넓게"
```json
"cultivars": {
  "beefsteak": {
    "aspectRatioMultiplier": 1.30,  // ↑ (1.15 → 1.30)
    ...
  }
}
```

### "serration 강도 증가 (전체)"
```json
"correlationRules": {
  ...
  "serrationFreqBase": 14,    // ↑ (10 → 14)
  "serrationFreqSlope": 22,   // ↑ (18 → 22)
}
```

## Validation 확인

```bash
# spec parse 테스트 (S36 spec — LEAF-SPEC-ZOD-VALID-01)
npx playwright test tests/architecture/leaf-spec-zod-valid.spec.ts
```

## Related docs

- `src/scene/leaf/LeafSpec.ts` — Zod schema + types
- `docs/architecture/LEAF_ENGINE.md` — engine vs data layer 책임 (Phase L4)
- `docs/architecture/LEAF_PRESETS.md` — botanical reference (Iter 36-38)
