// @farmsim/tomato-engine — public façade
//
// Zero-dependency tomato growth simulation. Engine-agnostic — works in
// Node, browser, worker, or any rendering pipeline.
//
// Quick example:
//   import { GrowthEngine } from '@farmsim/tomato-engine';
//   const engine = new GrowthEngine();
//   engine.setEnvironment({ temperatureC: 23, lightHoursPerDay: 14 });
//   engine.addPlant({ seed: 42 });
//   const state = engine.computeState(42, 75);
//   // state.nodes[*].{droopExtra, stemRadiusMm, leafMassG, deflectionRad, ...}

export { GrowthEngine } from './GrowthEngine';
export type {
  EnvironmentParams,
  PlantInput,
  SimulationSnapshot,
  SerializedEngine,
} from './GrowthEngine';
export { environmentStressFactor, applyEnvironmentToGenome } from './GrowthEngine';

export type {
  PlantState,
  PlantStressInputs,
  NodeState,
  TrussState,
  FruitState,
  FlowerState,
} from './GrowthModel';
export {
  TOTAL_DAYS,
  GROWTH_STAGES,
  STAGE_COLORS,
  RIPEN_NAMES,
  computePlantState,
} from './GrowthModel';

export type { PlantGenome } from './PlantGenome';
export { generateGenome } from './PlantGenome';

export { computePhysics, computeTrussDroop } from './PhysicsModel';

export { getSunState, dayToHour } from './SunPosition';
export type { SunState } from './SunPosition';

export { SeededRandom } from './SeededRandom';

export { LeafStage, getLeafStage } from './LeafStage';
export type { LeafStageInfo } from './LeafStage';

export {
  LEAF_COLOR_YOUNG,
  LEAF_COLOR_MATURE,
  LEAF_COLOR_STRESS,
  LEAF_COLOR_SENESCENCE,
  getLeafBlendedColor,
} from './LeafColors';
export type { LeafColorRGB } from './LeafColors';
