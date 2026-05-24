import { SeededRandom } from './SeededRandom';

export interface PlantGenome {
  seed: number;

  // Growth curve
  heightMaxCm: number;
  heightSigmoidK: number;
  heightSigmoidMid: number;

  // Per-plant phyllotaxis jitter (degrees). Phytomer emergence rate
  // itself is owned by cultivar.phyllochronGDD; this only twists the
  // spiral angle for visual variation.
  phyllotaxisJitter: number;

  // Leaves
  leafSizeMultiplier: number;
  leafletCountBias: number; // -1, 0, or +1
  leafDroopMultiplier: number;
  leafHueBias: number; // color variation

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

  // Internode & leaf expansion (science-based)
  internodeLenCm: number;          // base internode length (cm), real data: 5-8cm
  leafExpansionRate: number;       // leaf expansion sigmoid steepness (k), 0.25-0.45

  // Apex-driven internode elongation (GA-mediated)
  // Real biology: leaf expands → produces GA → GA moves down → internode below elongates
  internodeElongDelay: number;     // delay before elongation starts (days), 3-6
  internodeElongMid: number;       // sigmoid midpoint for elongation (days after delay), 6-10

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

    phyllotaxisJitter: rng.gaussian(0, 8),

    // Leaves
    leafSizeMultiplier: clamp(rng.gaussian(1.0, 0.12), 0.7, 1.3),
    leafletCountBias: Math.round(clamp(rng.gaussian(0, 0.6), -1, 1)),
    leafDroopMultiplier: clamp(rng.gaussian(1.0, 0.15), 0.6, 1.4),
    leafHueBias: rng.gaussian(0, 0.05),

    // Truss/fruit architecture and visual sigmoid params have moved
    // from PlantGenome to cultivar (v3.0 Phase 2). Per-plant variation
    // is now sampled from cultivar.morphology distributions via
    // samplePlantArchitecture(cultivar, seed) in GrowthModel.

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

    // Internode & leaf expansion — based on real greenhouse tomato data
    // Real internode: mean 7.45cm (SD 0.8), range 3-8cm across genotypes
    internodeLenCm: clamp(rng.gaussian(6.5, 0.8), 4.5, 8.5),
    // Leaf expansion sigmoid k: higher = faster expansion
    // Real leaf takes 14-21 days to fully expand
    leafExpansionRate: clamp(rng.gaussian(0.35, 0.04), 0.25, 0.45),

    // Apex-driven internode elongation
    // Delay: leaf must expand and produce GA before internode elongates
    internodeElongDelay: clamp(rng.gaussian(4.0, 0.5), 3, 6),
    // Sigmoid midpoint: ~8 days after delay for half-elongation
    internodeElongMid: clamp(rng.gaussian(8, 1.0), 6, 10),

    // Planting offset: some plants are a few days ahead or behind
    plantingDayOffset: clamp(rng.gaussian(0, 2), -5, 5),
  };
}
