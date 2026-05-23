// Client-agnostic growth data engine
// Zero Three.js / Babylon dependencies — pure data layer.
//
// Usage:
//   const engine = new GrowthEngine();
//   engine.setEnvironment({ temperatureC: 24, lightHoursPerDay: 14 });
//   engine.addPlant({ seed: 42, genomeOverrides: { heightMaxCm: 220 } });
//   const state = engine.computeState(42, 75);
//   // state.nodes[i].droopExtra, leafMassG, deflectionRad, stemRadiusMm ...
//
// All inputs are JSON-serializable, all outputs are plain objects.

import { type PlantGenome, generateGenome } from './PlantGenome';
import { computePlantState, type PlantState, type PlantStressInputs } from './GrowthModel';
import { type Cultivar, getCultivar } from './Cultivar';

/**
 * Greenhouse environment parameters that modulate growth and physics.
 * Optional — defaults assume a Kimje-style smart greenhouse climate.
 *
 * Currently consumed by:
 *   - applyEnvironmentToGenome (scales growth rate / leaf size by stress)
 *
 * Future-friendly hook: pass-through to GrowthModel/PhysicsModel for
 * deeper coupling (e.g. transpiration-based wilting, CO2-limited
 * fruit set). The shape is stable; new fields can be added without
 * breaking existing callers because all keys are optional.
 */
export interface EnvironmentParams {
  /** Air temperature, °C. Optimal tomato range 20–26°C. */
  temperatureC?: number;
  /** Relative humidity, 0–1. Optimal 0.6–0.75. */
  humidity?: number;
  /** Daily light hours (DLI proxy). Winter ~10, summer ~16. */
  lightHoursPerDay?: number;
  /** Atmospheric CO2 in ppm. Outdoor ~420, enriched greenhouse 800–1200. */
  co2ppm?: number;
  /** EC of nutrient solution, dS/m. Tomato target 2.5–3.5. */
  nutrientEC?: number;
  /** Substrate water content, 0–1. Below 0.3 → water stress. */
  substrateWater?: number;
}

const DEFAULT_ENVIRONMENT: Required<EnvironmentParams> = {
  temperatureC: 23,
  humidity: 0.7,
  lightHoursPerDay: 14,
  co2ppm: 800,
  nutrientEC: 3.0,
  substrateWater: 0.6,
};

export interface PlantInput {
  seed: number;
  /** Subset of PlantGenome to override after seeded generation. */
  genomeOverrides?: Partial<PlantGenome>;
  /** Cultivar name (registered in CULTIVARS). Default 'round-generic'. */
  cultivarName?: string;
}

export interface SimulationSnapshot {
  day: number;
  environment: Required<EnvironmentParams>;
  plantCount: number;
  plants: PlantState[];
}

export interface SerializedEngine {
  version: 1;
  environment: Required<EnvironmentParams>;
  plants: Array<{
    seed: number;
    genome: PlantGenome;
  }>;
}

/**
 * Compute an environment stress factor that scales growth.
 *
 *   1.0 = optimal (default environment)
 *   <1  = stress (cold, low light, dry substrate, ...)
 *   >1  = boost (CO2 enrichment, high light, ...)
 *
 * Multiplicative across the contributing factors. Each factor falls
 * off smoothly using a half-cosine band; outside the band the factor
 * tapers toward 0.5 (not zero — plants still survive).
 */
export function environmentStressFactor(env: Required<EnvironmentParams>): number {
  const tempFactor = bandFactor(env.temperatureC, 20, 26, 8);
  const humidityFactor = bandFactor(env.humidity, 0.6, 0.75, 0.4);
  const lightFactor = bandFactor(env.lightHoursPerDay, 12, 16, 6);
  const co2Boost = Math.min(1.25, Math.max(0.7, env.co2ppm / 800));
  const waterFactor = bandFactor(env.substrateWater, 0.45, 0.75, 0.4);
  const ecFactor = bandFactor(env.nutrientEC, 2.5, 3.5, 1.5);

  return tempFactor * humidityFactor * lightFactor * co2Boost * waterFactor * ecFactor;
}

function bandFactor(value: number, low: number, high: number, halfWidth: number): number {
  if (value >= low && value <= high) return 1.0;
  const dist = value < low ? low - value : value - high;
  // Smooth fall-off: cos band over [0..halfWidth], min 0.5
  const t = Math.min(1, dist / halfWidth);
  return 0.5 + 0.5 * Math.cos(t * Math.PI / 2);
}

/**
 * Apply environment stress to a genome by scaling growth-sensitive
 * parameters. Returns a modified copy — does not mutate input.
 */
export function applyEnvironmentToGenome(
  genome: PlantGenome,
  env: Required<EnvironmentParams>
): PlantGenome {
  const stress = environmentStressFactor(env);
  return {
    ...genome,
    // Slower growth → larger sigmoid midpoint, smaller k
    heightSigmoidK: genome.heightSigmoidK * (0.7 + 0.3 * stress),
    leafSizeMultiplier: genome.leafSizeMultiplier * (0.6 + 0.4 * stress),
    leafExpansionRate: genome.leafExpansionRate * (0.7 + 0.3 * stress),
    fruitMaxDiameterMm: genome.fruitMaxDiameterMm * (0.75 + 0.25 * stress),
    nodeInterval: genome.nodeInterval / (0.7 + 0.3 * stress),
  };
}

interface PlantEntry {
  genome: PlantGenome;
  cultivar: Cultivar;
}

/**
 * GrowthEngine — the public façade.
 *
 * Holds plant genomes + environment, computes deterministic
 * PlantState snapshots at any day (no time-stepping required —
 * any (seed, day) pair is reproducible).
 *
 * Pure compute: no IO, no event emitters. Drive it from a render
 * loop, a scrubber, a CLI, or a worker thread.
 */
export class GrowthEngine {
  private plants = new Map<number, PlantEntry>();
  private environment: Required<EnvironmentParams> = { ...DEFAULT_ENVIRONMENT };

  /** Replace the current environment. Pass partial → keys merged with current. */
  setEnvironment(env: EnvironmentParams): void {
    this.environment = { ...this.environment, ...env };
  }

  getEnvironment(): Required<EnvironmentParams> {
    return { ...this.environment };
  }

  /**
   * Register a plant. Returns the (possibly overridden) genome.
   *
   * The seed drives both the genome RNG and the GrowthEngine.computeState
   * lookup key. Use a unique seed per plant.
   */
  addPlant(input: PlantInput): PlantGenome {
    const base = generateGenome(input.seed);
    const genome: PlantGenome = input.genomeOverrides
      ? { ...base, ...input.genomeOverrides, seed: input.seed }
      : base;
    const cultivar = getCultivar(input.cultivarName ?? 'round-generic');
    this.plants.set(input.seed, { genome, cultivar });
    return genome;
  }

  /**
   * Replace the genome for an existing plant. Useful for live
   * parameter tweaking from a UI — e.g. dragging a slider for
   * `heightMaxCm` and re-rendering.
   */
  updateGenome(seed: number, overrides: Partial<PlantGenome>): PlantGenome {
    const entry = this.plants.get(seed);
    if (!entry) throw new Error(`Plant with seed ${seed} not registered`);
    entry.genome = { ...entry.genome, ...overrides, seed };
    return entry.genome;
  }

  removePlant(seed: number): void {
    this.plants.delete(seed);
  }

  clear(): void {
    this.plants.clear();
  }

  getGenome(seed: number): PlantGenome | undefined {
    return this.plants.get(seed)?.genome;
  }

  hasPlant(seed: number): boolean {
    return this.plants.has(seed);
  }

  get plantCount(): number {
    return this.plants.size;
  }

  getSeeds(): number[] {
    return Array.from(this.plants.keys());
  }

  /**
   * Compute the full state of a plant at a given day (fractional supported).
   *
   * The environment is applied to the genome at compute time, so changing
   * the environment between calls reflects on the next call without
   * mutating the stored genome.
   *
   * Throws if the seed is not registered.
   */
  computeState(
    seed: number,
    day: number,
    envOverride?: EnvironmentParams,
    stress?: PlantStressInputs
  ): PlantState {
    const entry = this.plants.get(seed);
    if (!entry) throw new Error(`Plant with seed ${seed} not registered`);

    const env: Required<EnvironmentParams> = envOverride
      ? { ...this.environment, ...envOverride }
      : this.environment;

    // Auto-derive waterStress from substrateWater unless caller overrode it.
    const autoStress: PlantStressInputs = {
      waterStress: stress?.waterStress ?? Math.max(0, (0.45 - env.substrateWater) / 0.45),
      diseaseLoad: stress?.diseaseLoad ?? 0,
    };

    const effectiveGenome = applyEnvironmentToGenome(entry.genome, env);
    const effectiveDay = Math.max(0, day - effectiveGenome.plantingDayOffset);
    return computePlantState(effectiveDay, effectiveGenome, autoStress, entry.cultivar);
  }

  /** Public read of a plant's cultivar (for callers that need its name). */
  getCultivarFor(seed: number): Cultivar | undefined {
    return this.plants.get(seed)?.cultivar;
  }

  /** Compute states for every registered plant at a given day. */
  computeAllStates(day: number, envOverride?: EnvironmentParams): PlantState[] {
    const out: PlantState[] = [];
    for (const seed of this.plants.keys()) {
      out.push(this.computeState(seed, day, envOverride));
    }
    return out;
  }

  /** Serializable snapshot for inspection or persistence. */
  getSnapshot(day: number, envOverride?: EnvironmentParams): SimulationSnapshot {
    const env: Required<EnvironmentParams> = envOverride
      ? { ...this.environment, ...envOverride }
      : this.environment;
    return {
      day,
      environment: env,
      plantCount: this.plants.size,
      plants: this.computeAllStates(day, envOverride),
    };
  }

  /** Round-trip the engine state through JSON (genomes + environment). */
  serialize(): SerializedEngine {
    return {
      version: 1,
      environment: { ...this.environment },
      plants: Array.from(this.plants.entries()).map(([seed, entry]) => ({
        seed,
        genome: { ...entry.genome },
      })),
    };
  }

  static fromSerialized(data: SerializedEngine): GrowthEngine {
    const engine = new GrowthEngine();
    engine.setEnvironment(data.environment);
    for (const p of data.plants) {
      // Cultivar isn't persisted in v1 SerializedEngine — fall back to default.
      engine.plants.set(p.seed, {
        genome: { ...p.genome },
        cultivar: getCultivar('round-generic'),
      });
    }
    return engine;
  }

  toJSON(): SerializedEngine {
    return this.serialize();
  }

  toJSONString(day?: number): string {
    return day == null
      ? JSON.stringify(this.serialize())
      : JSON.stringify(this.getSnapshot(day));
  }
}

export { generateGenome } from './PlantGenome';
export type { PlantGenome } from './PlantGenome';
export type { PlantState, NodeState, TrussState, FruitState, FlowerState } from './GrowthModel';
