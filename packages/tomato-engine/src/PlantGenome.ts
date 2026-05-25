import { SeededRandom } from './SeededRandom';
import type { BotanicalSpec } from './BotanicalSpec';
import { ACTIVE_BOTANICAL } from './ModelRegistry';

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

/**
 * Default-botanical wrapper. Kept for backward compatibility with all
 * existing call sites (no botanical context). Uses ACTIVE_BOTANICAL.tomato.
 *
 * For cultivar-aware generation, prefer generateGenomeWithBotanical().
 */
export function generateGenome(seed: number): PlantGenome {
  return generateGenomeWithBotanical(seed, ACTIVE_BOTANICAL.tomato);
}

/**
 * Phase C: read distribution parameters (heightCurve, internode length,
 * elongation delay/midpoint) from the botanical spec. Other fields keep
 * their hardcoded distributions until later migration phases.
 *
 * RNG call order is preserved exactly so default-botanical results are
 * byte-identical to the pre-migration generateGenome(seed).
 */
export function generateGenomeWithBotanical(
  seed: number,
  b: BotanicalSpec,
): PlantGenome {
  const rng = new SeededRandom(seed);
  const hc = b.stemGrowth.heightCurve;
  const mi = b.stemGrowth.matureInternode.lengthDistribution;
  const eDelay = b.stemGrowth.elongation.delayDays;
  const eMid = b.stemGrowth.elongation.midpointDays;

  return {
    seed,

    // Growth curve: read from botanical (heightCurve)
    // NOTE: sigmoidK / sigmoidMid in botanical do not declare min/max
    // (MuSigma not ClampedMuSigma). Keep the legacy clamp ranges here
    // until Phase 2 promotes them to ClampedMuSigma.
    heightMaxCm: clamp(rng.gaussian(hc.maxCm.mu, hc.maxCm.sigma), hc.maxCm.min, hc.maxCm.max),
    heightSigmoidK: clamp(rng.gaussian(hc.sigmoidK.mu, hc.sigmoidK.sigma), 0.04, 0.10),
    heightSigmoidMid: clamp(rng.gaussian(hc.sigmoidMid.mu, hc.sigmoidMid.sigma), 35, 55),

    phyllotaxisJitter: rng.gaussian(0, 8),

    // Leaves (Phase 2 migration target — Leaf Module)
    leafSizeMultiplier: clamp(rng.gaussian(1.0, 0.12), 0.7, 1.3),
    leafletCountBias: Math.round(clamp(rng.gaussian(0, 0.6), -1, 1)),
    leafDroopMultiplier: clamp(rng.gaussian(1.0, 0.15), 0.6, 1.4),
    leafHueBias: rng.gaussian(0, 0.05),

    // Visual
    stemRadiusMultiplier: clamp(rng.gaussian(1.0, 0.1), 0.75, 1.25),
    fruitOblongFactor: clamp(rng.gaussian(1.0, 0.08), 0.82, 1.18),

    // Biomechanics (Phase 4 migration target)
    stemStrengthFactor: clamp(rng.gaussian(1.0, 0.1), 0.75, 1.25),
    stemYoungsModulusMPa: clamp(rng.gaussian(10, 2), 5, 15),
    stemWoodDensity: clamp(rng.gaussian(800, 50), 700, 900),
    wireAttachmentHeight: clamp(rng.gaussian(3.5, 0.1), 3.3, 3.7),

    // Leaf shape (Phase 2 migration target — Leaf Module)
    leafSerrationDepth: clamp(rng.gaussian(0.18, 0.03), 0.10, 0.25),
    leafSerrationFreq: clamp(rng.gaussian(10, 1.5), 7, 14),
    leafLobeDepth: clamp(rng.gaussian(0.08, 0.03), 0.0, 0.15),
    leafWaviness: clamp(rng.gaussian(0.003, 0.001), 0.0, 0.006),
    leafPetioleLength: clamp(rng.gaussian(0.10, 0.015), 0.06, 0.14),

    // Internode length: read from botanical (matureInternode.lengthDistribution)
    internodeLenCm: clamp(rng.gaussian(mi.mu, mi.sigma), mi.min, mi.max),
    // Leaf expansion (Phase 2 migration target)
    leafExpansionRate: clamp(rng.gaussian(0.35, 0.04), 0.25, 0.45),

    // Apex-driven internode elongation: read from botanical (elongation)
    internodeElongDelay: clamp(rng.gaussian(eDelay.mu, eDelay.sigma), eDelay.min, eDelay.max),
    internodeElongMid: clamp(rng.gaussian(eMid.mu, eMid.sigma), eMid.min, eMid.max),

    // Planting offset: some plants are a few days ahead or behind
    plantingDayOffset: clamp(rng.gaussian(0, 2), -5, 5),
  };
}
