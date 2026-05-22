# @farmsim/tomato-engine

Zero-dependency tomato (Solanum lycopersicum) growth simulation.

- Apex-driven biology — internode elongation is GA-mediated (leaf produces gibberellin → internode below elongates), so early seedlings are a rosette and a visible stem appears around day 20.
- Structural mechanics — Pipe model for stem radius, cantilever bending for trusses, weight + age + water-stress for leaf droop.
- 30+ heritable genome parameters (height curve, leaf shape, fruit size, biomechanics, …) generated deterministically from a single seed.
- 6 climate environment knobs (temperatureC / humidity / lightHoursPerDay / co2ppm / nutrientEC / substrateWater) that multiplicatively modulate genome at compute time.
- Plain TypeScript, **zero @babylonjs / three / framework deps**. Runs in Node, worker, browser, anything.

```bash
# Local consumption inside the monorepo (already wired via npm workspaces):
import { GrowthEngine } from '@farmsim/tomato-engine';
```

## Quick start

```ts
import { GrowthEngine } from '@farmsim/tomato-engine';

const engine = new GrowthEngine();
engine.setEnvironment({
  temperatureC: 23,
  humidity: 0.7,
  lightHoursPerDay: 14,
  co2ppm: 800,
});
engine.addPlant({ seed: 42 });

const state = engine.computeState(42, 75);
console.log(`Day ${state.day}: ${state.heightCm.toFixed(1)}cm, ${state.totalFruits} fruits`);
for (const node of state.nodes) {
  console.log(`  node ${node.index}: ${node.leafletCount} leaflets, droop=${node.droopExtra.toFixed(0)}°, stemR=${node.stemRadiusMm.toFixed(1)}mm`);
}
```

## API

### `class GrowthEngine`

| Method | Description |
|--------|-------------|
| `addPlant({ seed, genomeOverrides? })` | Register a plant. Override any subset of the 30+ genome fields. |
| `updateGenome(seed, overrides)` | Mutate genome at runtime (UI slider use). |
| `removePlant(seed)` / `clear()` / `getSeeds()` | Lifecycle. |
| `setEnvironment(env)` / `getEnvironment()` | 6-knob greenhouse climate. |
| `computeState(seed, day, envOverride?, stress?)` | Full PlantState at a given day (fractional OK). |
| `computeAllStates(day, envOverride?)` | All registered plants. |
| `getSnapshot(day)` / `toJSONString(day?)` | Serializable snapshot. |
| `serialize()` / `static fromSerialized(data)` | Round-trip engine state through JSON. |

### Types

| Type | Notes |
|------|-------|
| `PlantGenome` | 30+ heritable params. See [PlantGenome.ts] for full list with units + biological meaning. |
| `EnvironmentParams` | All optional, all 0–N. Defaults to a Kimje smartfarm baseline. |
| `PlantStressInputs` | `{ waterStress?, diseaseLoad? }` — both 0–1. |
| `PlantState` | `{ day, heightCm, nodes[], cotyledonSize, waterStress, diseaseLoad, ... }`. |
| `NodeState` | Per-node — `leafMaturity, leafletCount, droopExtra, yellowing, truss?, massAboveKg, stemRadiusMm, deflectionRad, ...` |
| `TrussState`, `FruitState`, `FlowerState` | Per-truss substructures. |
| `LeafStageInfo` | Output of `getLeafStage(node, plantAge)` — smooth blendT + fractional leafletCount for renderers. |

### Helpers

| Function | Purpose |
|----------|---------|
| `generateGenome(seed)` | The raw genome generator (used internally by `addPlant`). |
| `computePhysics(nodes, genome)` | Standalone physics pass. |
| `computeTrussDroop(truss, genome)` | Cantilever beam deflection of a single truss peduncle. |
| `getSunState(hourOfDay)` / `dayToHour(dayFraction)` | 35°N solar position (direction + colour temp + intensity). |
| `getLeafStage(node, plantAge)` | Classify into 6 leaf stages with smooth blendT. |
| `SeededRandom` | Deterministic RNG (LCG + Box-Muller gaussian). |
| `environmentStressFactor(env)` / `applyEnvironmentToGenome(genome, env)` | The env→genome modulation, exposed for inspection. |

### Constants

`TOTAL_DAYS = 120`, `STAGE_COLORS` (6 ripening RGBs), `RIPEN_NAMES`, `GROWTH_STAGES`.

## Determinism

Same `seed` + same `env` + same `day` → bit-identical `PlantState`. Useful for golden tests, deterministic LOD rebuilds, replay.

## Used by

- `@farmsim/tomato-geometry` (peer) — geometry generators that consume `NodeState`/`PlantGenome`/`LeafStageInfo`.
- `apps/farmsim` — Babylon.js digital-twin app that wraps the geometry chunks with PBR materials and shadow casters.

See [docs/stage-by-stage.md](../../docs/stage-by-stage.md) for the full stage-by-stage rendering guide.
