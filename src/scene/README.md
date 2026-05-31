# src/rendering — D layer: Rendering Engine

> ★ **D layer** — Babylon mesh output. `docs/architecture/LAYER_STRUCTURE.md` 참조.
> Iter 35 Phase E: `src/twin/` → `src/rendering/` rename (D layer 의미 명확화).

## 역할

A (geometry) + B (growth) + C (plant base) layer의 결과를 받아 Babylon mesh로 render.
Scene/Camera/Engine/Quality/Post-FX/Shader 모두 본 layer 책임.

## 구조

```
rendering/
├── BabylonEngine.ts          ← engine init, render loop, store subscriptions
├── SceneInfrastructure.ts    ← Iter 35 신규 (ground + GrowthEngine + Showcase + SkinMesh)
├── SceneSetup.ts             ← 조명, IBL, SSAO 초기화
├── CameraRig.ts              ← preset/zoom/pan
├── RenderQuality.ts          ← QUALITY_PRESETS (Lv 1~10)
├── QualityProbe.ts           ← runtime quality measurement
├── ShowcasePlant.ts          ← Babylon mesh of showcase plant
├── SkinMeshPlant.ts          ← canonical leaf mesh (SDF + marching cubes + R26)
├── SkeletonOverlay.ts        ← skeleton debug visualization
├── SemanticOverlay.ts        ← SkinMesh graph debug (window.__semanticOverlay)
├── dockingOverlay/           ← petiole junction debug (Iter 20+)
├── stem/                     ← StemGenerator (Iter 35 Phase E ← src/plant/)
└── fruit/                    ← FruitGenerator (Iter 35 Phase E ← src/plant/)
```

## Import 규칙

- A (`packages/tomato-geometry`) 허용
- B (`packages/tomato-engine`) 허용
- C (`src/plant`) 허용
- Babylon (`@babylonjs/*`) **자유** (D layer의 존재 이유)
- `src/_archive/` **금지** (`iter35-layer-boundary.spec.ts` LAYER-ARCHIVE-NOT-IMPORTED-01)

## Canonical entry point (leaf mesh)

`SkinMeshPlant.ts` per-leaf loop _유일_ entry:

```ts
// line 702-720 (Iter 33+)
const phytomerLeaf = meshAnchorNode.phytomer?.leaf;
const leafMesh = buildLeafMeshFromPhytomer(name, scene, phytomerLeaf, genome, rng);
leafMesh.parent = lushGroup;
leafMesh.position = new Vector3(...meshAnchorNode.pos);
leafMesh.rotationQuaternion = new Quaternion(...anchor.rotation);   // R26
leafMesh.material = yellowing > 0.4 ? yellowMat : greenMat;
```

`buildLeafMeshFromPhytomer` 호출 site _단 1곳_ (`SkinMeshPlant.ts`). `leaf-mesh-single-entry.spec.ts` 검증.

## 관련 docs

- [`../../docs/architecture/LAYER_STRUCTURE.md`](../../docs/architecture/LAYER_STRUCTURE.md)
- [`../../docs/architecture/LEAF_RENDER_FLOW.md`](../../docs/architecture/LEAF_RENDER_FLOW.md)
- [`../../docs/architecture/SINGLE_PLANT_MODE.md`](../../docs/architecture/SINGLE_PLANT_MODE.md)
