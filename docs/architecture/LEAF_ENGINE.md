# Leaf Engine — Architecture (Iter 39 Phase L4)

> Engine vs Data layer SSOT. 연구자가 JSON으로 실험 설계할 수 있는 leaf
> mesh rendering pipeline.

## Layer 분리

```
src/scene/leaf/       ← Engine (plant-agnostic 산식 — "tomato" 단어 0)
  LeafEngine.ts         ← createLeaf + wrapAsMeshes + materials (facade)
  LeafSpec.ts           ← Zod schema + parseLeafSpec + resolveCultivar
  LeafMeshBuilder.ts    ← mesh 산식 SSOT (746 lines, spec parameter 주입)
  LeafletPlaneChunk.ts  ← per-leaflet vertex grid
  LeafletProfile.ts     ← position profile (terminal/primary/intercalary/secondary)
  LeafAnchor.ts         ← centroid normalize (L1-B SSOT #186)
  LeafMaterial.ts       ← Babylon PBR material + wrapLeafChunksAsMeshes
  LeafTexture.ts        ← procedural color/normal texture (Scene-cached)
  index.ts              ← barrel re-export

src/data/leaf/        ← Data (botanical parameter JSON + registry)
  index.ts              ← getLeafSpec(name) + cache + listAvailableLeafSpecs
  manifest.json         ← registry meta (taxonomy + cultivar list)
  specs/
    tomato.json         ← Tomato (Solanum lycopersicum) parameters
    (future) cucumber.json / lettuce.json
  README.md             ← 연구자 가이드
```

## 4 active 원칙 (Phase L4 v4)

### #41 Code = formula, Data = parameter

수학 산식 (lerp/sin/triangle/quaternion math)은 engine 코드. botanical
parameter (presets, magic coefficients, cultivar variation)는 JSON.

연구자가 _코드 변경 없이_ JSON 조정으로 실험 설계 가능.

### #42 Engine layer purity

`src/scene/leaf/` (engine)는 plant-agnostic. `'tomato'` 단어 0.
spec parameter로 모든 botanical data 받음. registry/spec loader는 _data layer_
(`src/data/leaf/`)에서.

### #43 Spec runtime validation (Zod)

연구자 JSON 편집 시 mistake catch. Range `min<=max`, ratio 범위, cross-field
constraint (`terminal.lobeDepth >= intercalary.lobeDepth`), `schemaVersion:
z.literal('1.0')`. Spec 변경 시 Zod schema 동시 갱신.

### #44 Multi-crop taxonomy

Spec에 `taxonomy: { family, genus, species, commonName }` 필수. Crop family /
species / cultivar 계층 데이터로 표현. 미래 plant 추가 시 JSON 추가만, engine
변경 0.

## Public API

```ts
import { LeafEngine } from '../scene/leaf';
import { getLeafSpec } from '../data/leaf';

// 1) Data layer가 spec 제공 (Zod runtime validation 포함).
const spec = getLeafSpec('tomato.json');

// 2) Engine이 spec + skeleton → mesh patches (pure data).
const patches = LeafEngine.createLeaf(spec, leafBladeRootNode, graph, {
  cultivar: 'cherry',              // 'cherry' | 'beefsteak' | 'roma' | undefined
  seed: 12345,                      // deterministic
  quality: 'low',                   // 'low' | 'high'
  meshNamePrefix: 'leaf_xyz',       // optional
});

// 3) Babylon Mesh wrapping + material.
const meshes = LeafEngine.wrapAsMeshes(patches, scene);
const mat = LeafEngine.getMaterial(scene);
for (const m of meshes) { m.material = mat; }
```

## 호출 그래프

```
SkinMeshPlant.ts
  └─ const spec = getLeafSpec('tomato.json')   ← data layer
  └─ LeafEngine.createLeaf(spec, node, graph, options)
     └─ buildSkeletonInputs(node, graph)        ← petiole tangent 추출
     └─ resolveCultivar(spec, options.cultivar) ← spec.cultivars[key] lookup
     └─ buildLeafMeshFromSkeleton(ctx)          ← engine 진입
        └─ buildLeafShapeDescriptor(ctx)
           └─ spec.agePresets[bladeRef.agePreset]
           └─ applyCorrelation(spec.correlationRules, complexity, preset, seed)
           └─ foldDroopDeg from spec.poseRules.foldDroopDeg{Base,Slope}
        └─ for each leaflet: buildLeafletPatch(node, i, desc, ctx)
           └─ buildLeafletOutlineWithNoise(spec, ...)
              └─ ±jitter from spec.poseRules.leafletJitterPercent
              └─ applyPositionProfile(spec.profileByPosition, resolved, position)
              └─ lobeNoise + serrationNoise + endpointTaperWeight
           └─ buildLeafletPlaneChunk(profile, opts)
           └─ normalizeLeafMeshVertices(chunk.positions)   ← L1-B centroid (#186)
           └─ applyLeafletPose(spec.poseRules, node, idSeed, desc)
              └─ noise from spec.poseRules.{pitch,roll,twist}NoiseRange
   └─ LeafEngine.wrapAsMeshes(patches, scene) → Mesh[]
```

## Spec 구조

각 `specs/*.json`은 `LeafSpec` interface 준수. `LeafSpec.ts`의 Zod schema가
runtime 검증.

```ts
interface LeafSpec {
  schemaVersion: '1.0';
  taxonomy: { family, genus, species, commonName };
  extends?: { baseSpec? };           // 미래 base spec composition
  agePresets: Record<string, AgePresetParams>;   // young/mature/old/complex/potato-leaf
  profileByPosition: {
    terminal: PositionProfile;        // widthRatio + lobeDepth + serration + tipSharpness + baseTaper
    primary: PositionProfile;
    intercalary: PositionProfile;     // terminal.lobeDepth >= intercalary.lobeDepth (botanical)
    secondary: PositionProfile;
  };
  correlationRules: {
    intercalaryComplexityExponent;    // 2 (c^2)
    serrationFreqBase / Slope;        // 10 + c*18
    asymmetryBase / Slope;            // 0.02 + c*0.06
    correlationJitterScale;           // 0.10
  };
  poseRules: {
    foldDroopDegBase / Slope;         // -5 + 15*maturity
    leafletJitterPercent;             // 5 (±5%)
    pitchNoiseRange / rollNoiseRange / twistNoiseRange;  // rad
  };
  cultivars?: Record<string, CultivarOverride>;  // cherry/beefsteak/roma
}
```

## 연구자 실험 시나리오

`src/data/leaf/README.md` 참조. 예:

- "intercalary를 더 단순하게": `intercalary.lobeDepth` ↓
- "beef 계열을 더 넓게": `cultivars.beefsteak.aspectRatioMultiplier` ↑
- "serration 강도 증가": `correlationRules.serrationFreqBase/Slope` ↑

## 미래 plant 추가

```bash
# 1) JSON spec 작성
$ cp src/data/leaf/specs/tomato.json src/data/leaf/specs/cucumber.json
# 편집: taxonomy + agePresets + profileByPosition + ...

# 2) Registry 등록
# src/data/leaf/index.ts
const REGISTRY = {
  'tomato.json': tomatoJson,
  'cucumber.json': cucumberJson,   // ← 추가
};

# 3) Manifest 갱신
# src/data/leaf/manifest.json — entry 추가

# 4) Caller에서 spec 선택
# const spec = getLeafSpec('cucumber.json');
```

Engine 코드 변경 0. 추가 검증은 `LEAF-SPEC-ZOD-VALID-01`에서 자동 catch
(Zod validation).

## 검증 invariants (Phase L4-8, tests/architecture/leaf-engine-l4.spec.ts)

| ID | 검증 |
|---|---|
| LEAF-ENGINE-API-01 | LeafEngine 4 methods (createLeaf/wrapAsMeshes/getMaterial/getYellowMaterial) |
| LEAF-SPEC-NO-TOMATO-01 | engine 코드 안 'tomato' 단어 0 (원칙 #42) |
| LEAF-SPEC-ZOD-VALID-01 | tomato.json이 LeafSpecSchema.parse PASS (원칙 #43) |
| LEAF-SPEC-BOTANICAL-PARAMETERS-01 | 코드 안 botanical magic 0 (원칙 #41) |
| LEAF-SPEC-TAXONOMY-01 | spec.taxonomy 4 fields 필수 (원칙 #44) |

REFACTOR-PARITY-01 + 25 leaf invariants 회귀 PASS.

## History

- **L1-B** (S6) — centroid anchor (mesh-anchor-contracts.spec)
- **L2-3** (S13) — per-leaflet position profile (terminal/primary/intercalary 차별화)
- **L2-4a/b** (S14/S15) — cap topology + resolution quality
- **L2-5** (S16/S17) — variation reporting + threshold
- **L3-A~F** (S18~S27) — 산식 inline + monolithic LeafMeshBuilder + GeoChunk 분리
- **L4-0~9** (S28~S37) — engine purity + data layer + Zod + LeafEngine namespace
