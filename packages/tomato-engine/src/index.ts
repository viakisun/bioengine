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
  StemAxis,
  BudState,
} from './GrowthModel';
export {
  TOTAL_DAYS,
  GROWTH_STAGES,
  STAGE_COLORS,
  RIPEN_NAMES,
  computePlantState,
  overlayPhysiologyFruits,
} from './GrowthModel';

export type { PlantGenome } from './PlantGenome';
export { generateGenome, generateGenomeWithBotanical } from './PlantGenome';

// Scientific tomato model (Phase 1 of plan a-drifting-wigderson.md)
// Reduced TOMGRO 5-state + Cultivar registry + 3-phase fruit growth.
export type {
  Cultivar,
  CultivarType,
  CultivarSample,
  GaussianDist,
} from './Cultivar';
export { CULTIVARS, DEFAULT_CULTIVAR_NAME, getCultivar, sampleCultivarGenome } from './Cultivar';

export type {
  DailyClimate,
  RipenStage,
  FruitCohort,
  TrussCohort,
  PlantPhysiologyState,
} from './CoreModel';
export { DEFAULT_CLIMATE, createPlant, stepDaily, stepHourly, stepMinutely, simulateToDay } from './CoreModel';

export type { HourlyClimate } from './DiurnalEnv';
export { diurnalEnv, parAtHour, tempAtHour, DEFAULT_TEMP_AMPLITUDE_C } from './DiurnalEnv';

export {
  canopyAbsorbedFraction,
  dailyGrossAssimilation,
  hourlyGrossAssimilation,
  maintenanceRespiration,
  dailyNetDM,
  hourlyNetDM,
} from './Photosynthesis';

export type { OrganAllocation } from './SinkAllocation';
export {
  trussSinkStrength,
  fruitSinkStrength,
  vegetativeSinkStrength,
  fruitFractionCap,
  allocateDM,
} from './SinkAllocation';

export {
  potentialFreshWeight,
  potentialDailyGrowthFW,
  updateAbortionTracker,
  acropetalGDDOffset,
  ABORTION_THRESHOLD,
  ABORTION_LAG_DAYS,
  // Iter 5b — sink-demand limit 전용
  potentialFreshMassG,
  potentialStepFreshGrowthG,
  potentialStepDryDemandG,
} from './FruitGrowth';
export type { AbortionState, GompertzMassParams } from './FruitGrowth';

export { computePhysics, computeTrussDroop } from './PhysicsModel';

export { getSunState, dayToHour } from './SunPosition';
export type { SunState } from './SunPosition';

export { SeededRandom } from './SeededRandom';

export { ACTIVE_ENGINE_MODE, setEngineMode } from './EngineMode';
export type { EngineMode } from './EngineMode';

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

// Cultivar JSON registry (incl. leafShape v1) — Plant Morphology Engine v0.1.
export { CULTIVAR_JSONS, ACTIVE_MODEL, ACTIVE_SCENARIO, ACTIVE_BOTANICAL } from './ModelRegistry';
export type { CultivarJson, LeafShapeJson } from './ModelRegistry';

// Botanical layer (botanical.v1) — Phase 1 migration.
export {
  resolveBotanical,
  loadBotanical,
  validateFull as validateBotanicalFull,
  validatePartial as validateBotanicalPartial,
  BotanicalValidationError,
} from './BotanicalSpec';
export type {
  BotanicalSpec,
  BotanicalPartial,
  BotanicalCrop,
  StemGrowthSpec,
  FruitDevelopmentSpec,
  Provenance,
  MuSigma,
  ClampedMuSigma,
  EnforcementStatus,
} from './BotanicalSpec';
