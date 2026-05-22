# @farmsim/tomato-geometry

Engine-agnostic procedural geometry generators for tomato plant parts. Outputs raw vertex arrays (`GeoChunk { positions, normals, uvs, indices, colors? }`) and texture bytes (`Uint8Array RGBA`). Wrap with Babylon `Mesh`, Three `BufferGeometry`, Filament, glTF builder, etc.

**Zero @babylonjs / three deps**. Peer-depends on `@farmsim/tomato-engine` only for `NodeState` / `PlantGenome` / `LeafStageInfo` types + `SeededRandom`.

## Modules

### `buildLeafChunk(params, rng) → GeoChunk`

Builds a compound tomato leaf (petiole + rachis + paired leaflets + petiolules + optional terminal lobes) merged into a single chunk.

Stage-aware: pass `stageInfo` from `@farmsim/tomato-engine`'s `getLeafStage(node, plantAge)` so leaflet count + serration + lobe morph smoothly between life stages instead of snap-changing.

```ts
import { buildLeafChunk } from '@farmsim/tomato-geometry';
import { SeededRandom, getLeafStage } from '@farmsim/tomato-engine';

const stageInfo = getLeafStage(node, plantState.day);
const chunk = buildLeafChunk({
  stageInfo,
  leafletCount: node.leafletCount,
  sizeFactor: node.leafSizeFactor * genome.leafSizeMultiplier,
  maturity: node.leafMaturity,
  curl: 0.12 + node.yellowing * 0.15,
  ageFrac: Math.max(node.droopExtra / 120, node.age / 80) + node.waterStress * 0.3,
  shape: { /* genome.leaf* */ },
}, new SeededRandom(seed));
// Wrap with whatever rendering engine you use:
// Babylon: const vd = new VertexData(); Object.assign(vd, chunk); vd.applyToMesh(mesh);
// Three:   const geo = new BufferGeometry().setAttribute(...);
```

Gravity profile follows the user reference (`vertex.y -= droop * pow(distance, 1.6)`) — smoother than a cubic cantilever, matches observed tomato petiole sag.

### `buildCotyledonChunk(params) → GeoChunk`

Embryonic leaf — 16-segment oval plane (length = `size × 2`, width = `size`), no veins, no serration. Two opposing chunks per plant, day 3–25 visible.

Reference: ported from the main-branch Three.js `PlantGenerator.createCotyledons`.

### `buildLeafColorBytes(diseaseLoad?) → Uint8Array`

256×256 RGBA. Realistic tomato leaf green + 6 pairs of secondary veins (lighter green Bezier-curve fills) + edge darkening. Optional `diseaseLoad` (0–1) overlays brown spots via Perlin-noise threshold — same texture image is enough to communicate "this plant is diseased" at any LOD.

### `buildLeafNormalBytes() → Uint8Array`

256×256 RGBA tangent-space normal map. Heightmap built from vein ridges (gaussian profiles) + FBM surface bumps, central-difference → normals.

### `catmullRomPath(points: Vec3[], divisionsPerSeg) → Vec3[]`

Smooth path through control points. Used by the stem generator to interpolate between node positions with deflection accumulated.

### `types.ts` — primitives + math helpers

```ts
interface GeoChunk { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; colors?: number[]; }

type Mat4 = { m: Float32Array };  // column-major, Babylon-compatible layout

Mat4.identity / rotationX / rotationY / rotationZ / translation
rotateChunkX / Y / Z / translateChunk / transformChunk
createCylinderChunk(radiusTop, radiusBottom, height, radialSegs, heightSegs)
mergeChunks(chunks[])
newChunk()
```

The `Mat4` layout matches Babylon's `Matrix.m` (column-major Float32Array of 16) so transformChunk's pos×m / normal×m loops are direct.

## Why split engine vs geometry?

- `@farmsim/tomato-engine` is the biology. It's small, pure, headless, easy to put in a worker or CI test.
- `@farmsim/tomato-geometry` is the procedural mesh / texture code. Also pure, but heavier (large arrays). Splitting means the engine stays trivially loadable for analysis-only workloads.
- `apps/farmsim` is the Babylon binding (Scene-keyed material caches, RawTexture wrappers, Mesh creation).

If you wanted a Three.js or Filament port of FarmSim, you'd reuse both packages unchanged and write a new `apps/<thing>` that wraps `GeoChunk → BufferGeometry/etc.`.
