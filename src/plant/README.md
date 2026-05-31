# src/plant — C layer: Plant Base

> ★ **C layer** — biology → geometry cache. `docs/architecture/LAYER_STRUCTURE.md` 참조.
> Babylon import _금지_ (Iter 36+ migration 완료 후 강제).

## 역할

GrowthEngine (B layer) 의 daily step 결과를 받아 _Babylon-independent_ geometry로 cache.
SkinMeshPlant (D layer) 가 본 cache를 읽어 Babylon mesh build.

## 구조

```
plant/
├── PlantBase.ts            ← axes/leaves/trusses position cache (B → C)
├── skeleton/               ← SkeletonGraph + populator (R26 contract)
│   ├── PlantSkeletonGraph.ts
│   ├── populateAnchorMorphology.ts
│   ├── AnchorTransform.ts  ← Iter 34 C4 cleanup
│   └── ...
├── leaf/                   ← organ graph schema
│   ├── LeafGraph.ts
│   ├── leafOrgan.ts
│   └── ...
├── anchors/                ← mesh anchor contract (helpers)
│   └── leafAnchor.ts
├── coordinates/            ← 4 좌표계 변환 utilities
│   ├── transforms.ts
│   └── types.ts
└── (Iter 36 이동 대상)     ← Babylon import 잔존 — LAYER_STRUCTURE.md 참조
    ├── LeafTexture.ts
    ├── LeafGenerator.ts
    ├── TrussGenerator.ts
    ├── leaf/material/, leaf/buildLeafBladeMesh.ts, leaf/devHook.ts
    ├── skin/SkinEngine.ts, skin/buildPlantSkinMesh.ts, skin/StemFamilyTubeNetworkBuilder.ts
    └── skeleton/buildTomatoSkeletonGraph.ts
```

## Import 규칙

- A (`packages/tomato-geometry`) 허용 (type/value)
- B (`packages/tomato-engine`) 허용 (type/value)
- D (`src/rendering`) **금지**
- Babylon (`@babylonjs/*`) **금지** (Iter 36+ 완전 강제)

## 좌표 작업 시 (필수)

`docs/architecture/COORDINATE_SYSTEMS.md` + `docs/architecture/MESH_ANCHORS.md` 우선 읽기.
4 좌표계 (world/plant-local/mesh-local/graph) suffix 명시 의무.

## 핵심 spec

- `iter31-r26-leaf-rotation-contract.spec.ts` — R26 contract 6 invariants
- `iter33-leaf-render-live.spec.ts` — leaf render 9 invariants
- `leaf-mesh-single-entry.spec.ts` — buildLeafMeshFromPhytomer 단일 진입점
- `skeleton-phytomer-binding.spec.ts` — phytomer 100% bind
- `coordinate-contracts.spec.ts` — INV-01~05
- `mesh-anchor-contracts.spec.ts` — anchor invariant
- `iter35-layer-boundary.spec.ts` (Iter 35 Phase H) — layer 경계 enforcement
