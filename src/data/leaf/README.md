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
| `agePresets` | 5종 (young/mature/old/complex/potato-leaf) — 각 morphology range 묶음 (★ `potato-leaf` botanical 명시 ↓) |
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

### ★ `agePresets` keys botanical 명시 (L8-0)

- `young`, `mature`, `old`, `complex` — 토마토 잎 _성숙도/복잡도_ 단계
- **`potato-leaf`** — _토마토_ cultivar 중 **smooth-margin variant**
  (UC ANR 학명).
  **★ _감자 잎이 아닙니다_.** 'regular leaf tomato' (scalloped/serrated)와
  대비되는 토마토 leaf type 분류. 실 cultivars: Brandywine, Pruden's
  Purple, Mortgage Lifter. 자세한 사항: [LEAF_PRESETS.md §E](../../../docs/architecture/LEAF_PRESETS.md).

### Dead fields (L8-5, S74 보완 #2)

`agePresets.*` 안 다음 fields는 **mesh 산식에 영향 0** — `applyPositionProfile`
이 `profileByPosition.*` 값으로 _완전 덮어쓰기_:

| field | 덮어쓰기 source | 실제 mesh source |
|---|---|---|
| `aspectRatioRange` | `applyPositionProfile` | `profileByPosition.{position}.widthRatio` |
| `serrationAmpRange` | `applyPositionProfile` | `profileByPosition.{position}.serrationAmp` |
| `lobeDepthRange` | `applyPositionProfile` | `profileByPosition.{position}.lobeDepth` |
| `aspectRatioBaseline` | `applyPositionProfile` | `profileByPosition.{position}.widthRatio` |
| `tipSharpnessBaseline` | `applyPositionProfile` | `profileByPosition.{position}.tipSharpness` |

★ 이 fields를 `tomato.json`에서 변경해도 **mesh 변화 없음**. 실제 잎 비율/
톱니/결각/끝 sharpness 변경은 `profileByPosition.*` 값에서.

L9 multiplier refactor 후 의미 부활 예정 — agePreset range가 _position
profile multiplier_로 작용하여 maturity별 변화 표현.

LIVE fields (mesh 영향 있음): `leafLengthCmRange`, `majorLeafletPairsRange`,
`intercalaryRange`, `secondaryRange`, `poseDroopDegRange`, `color`, `curl`,
`asymmetry`, `smoothMargin`, `leafLengthFactor`, `leafletCountFactor`,
`baseShapeBaseline`.

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
