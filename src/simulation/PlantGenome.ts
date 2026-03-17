import { SeededRandom } from '../utils/SeededRandom';

export interface PlantGenome {
  seed: number;

  // Growth curve
  heightMaxCm: number;
  heightSigmoidK: number;
  heightSigmoidMid: number;

  // Node creation
  nodeStartDay: number;
  nodeInterval: number;
  phyllotaxisJitter: number; // degrees offset per plant

  // Leaves
  leafSizeMultiplier: number;
  leafletCountBias: number; // -1, 0, or +1
  leafDroopMultiplier: number;
  leafHueBias: number; // color variation

  // Trusses / Fruits
  trussStartNode: number;
  trussInterval: number;
  flowersPerTruss: number;
  fruitMaxDiameterMm: number;
  fruitSigmoidK: number;
  fruitSigmoidMid: number;

  // Ripening
  ripenStartAge: number;
  ripenDuration: number;

  // Visual
  stemRadiusMultiplier: number;
  fruitOblongFactor: number;

  // Biomechanics
  stemStrengthFactor: number;      // overall stem structural strength
  stemYoungsModulusMPa: number;    // Young's modulus of stem tissue
  stemWoodDensity: number;         // stem tissue density kg/m³
  wireAttachmentHeight: number;    // training wire height (m)

  // Leaf shape
  leafSerrationDepth: number;      // serration tooth amplitude (fraction of width)
  leafSerrationFreq: number;       // teeth per leaflet edge
  leafLobeDepth: number;           // depth of lobing
  leafWaviness: number;            // surface bumpiness amplitude
  leafPetioleLength: number;       // petiole length (m)

  // Planting time offset (days)
  plantingDayOffset: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function generateGenome(seed: number): PlantGenome {
  const rng = new SeededRandom(seed);

  return {
    seed,

    // Growth curve: centered around defaults with natural variation
    heightMaxCm: clamp(rng.gaussian(200, 15), 160, 240),
    heightSigmoidK: clamp(rng.gaussian(0.07, 0.008), 0.04, 0.10),
    heightSigmoidMid: clamp(rng.gaussian(45, 4), 35, 55),

    // Node creation
    nodeStartDay: clamp(rng.gaussian(5, 0.5), 3.5, 6.5),
    nodeInterval: clamp(rng.gaussian(2.3, 0.2), 1.8, 2.8),
    phyllotaxisJitter: rng.gaussian(0, 8),

    // Leaves
    leafSizeMultiplier: clamp(rng.gaussian(1.0, 0.12), 0.7, 1.3),
    leafletCountBias: Math.round(clamp(rng.gaussian(0, 0.6), -1, 1)),
    leafDroopMultiplier: clamp(rng.gaussian(1.0, 0.15), 0.6, 1.4),
    leafHueBias: rng.gaussian(0, 0.05),

    // Trusses / Fruits
    trussStartNode: Math.round(clamp(rng.gaussian(10, 1), 8, 12)),
    trussInterval: rng.next() < 0.15 ? 2 : 3, // 15% chance of 2-node interval
    flowersPerTruss: Math.round(clamp(rng.gaussian(5, 1.0), 3, 8)),
    fruitMaxDiameterMm: clamp(rng.gaussian(75, 8), 55, 95),
    fruitSigmoidK: clamp(rng.gaussian(0.12, 0.015), 0.08, 0.16),
    fruitSigmoidMid: clamp(rng.gaussian(18, 2), 13, 23),

    // Ripening
    ripenStartAge: clamp(rng.gaussian(25, 3), 18, 32),
    ripenDuration: clamp(rng.gaussian(18, 2), 13, 23),

    // Visual
    stemRadiusMultiplier: clamp(rng.gaussian(1.0, 0.1), 0.75, 1.25),
    fruitOblongFactor: clamp(rng.gaussian(1.0, 0.08), 0.82, 1.18),

    // Biomechanics
    stemStrengthFactor: clamp(rng.gaussian(1.0, 0.1), 0.75, 1.25),
    stemYoungsModulusMPa: clamp(rng.gaussian(10, 2), 5, 15),
    stemWoodDensity: clamp(rng.gaussian(800, 50), 700, 900),
    wireAttachmentHeight: clamp(rng.gaussian(3.5, 0.1), 3.3, 3.7),

    // Leaf shape
    leafSerrationDepth: clamp(rng.gaussian(0.18, 0.03), 0.10, 0.25),
    leafSerrationFreq: clamp(rng.gaussian(10, 1.5), 7, 14),
    leafLobeDepth: clamp(rng.gaussian(0.08, 0.03), 0.0, 0.15),
    leafWaviness: clamp(rng.gaussian(0.003, 0.001), 0.0, 0.006),
    leafPetioleLength: clamp(rng.gaussian(0.10, 0.015), 0.06, 0.14),

    // Planting offset: some plants are a few days ahead or behind
    plantingDayOffset: clamp(rng.gaussian(0, 2), -5, 5),
  };
}
