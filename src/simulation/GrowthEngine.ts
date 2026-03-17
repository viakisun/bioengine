// Client-agnostic growth data engine
// Zero Three.js dependencies — pure data layer

import { type PlantGenome, generateGenome } from './PlantGenome';
import { computePlantState, type PlantState } from './GrowthModel';

export interface SimulationSnapshot {
  day: number;
  plantCount: number;
  plants: PlantState[];
}

export class GrowthEngine {
  private plants = new Map<number, { genome: PlantGenome }>();

  addPlant(seed: number): PlantGenome {
    const genome = generateGenome(seed);
    this.plants.set(seed, { genome });
    return genome;
  }

  removePlant(seed: number): void {
    this.plants.delete(seed);
  }

  getGenome(seed: number): PlantGenome | undefined {
    return this.plants.get(seed)?.genome;
  }

  get plantCount(): number {
    return this.plants.size;
  }

  /** Compute state for a single plant at a given day (supports fractional days) */
  computeState(seed: number, day: number): PlantState {
    const entry = this.plants.get(seed);
    if (!entry) throw new Error(`Plant with seed ${seed} not found`);

    // Apply planting day offset
    const effectiveDay = Math.max(0, day - entry.genome.plantingDayOffset);
    return computePlantState(effectiveDay, entry.genome);
  }

  /** Compute states for all plants at a given day */
  computeAllStates(day: number): PlantState[] {
    const states: PlantState[] = [];
    for (const [seed] of this.plants) {
      states.push(this.computeState(seed, day));
    }
    return states;
  }

  /** Get a full serializable snapshot of the simulation */
  getSnapshot(day: number): SimulationSnapshot {
    return {
      day,
      plantCount: this.plants.size,
      plants: this.computeAllStates(day),
    };
  }

  /** Export simulation state as JSON string */
  toJSON(day: number): string {
    return JSON.stringify(this.getSnapshot(day));
  }

  /** Get all seeds */
  getSeeds(): number[] {
    return Array.from(this.plants.keys());
  }
}
