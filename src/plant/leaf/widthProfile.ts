import { createLogger } from '../../utils/logger';

const log = createLogger('leaf');

// widthProfile — beta evaluator + bezier/sampled stubs.
//
// v0.1: 'beta' mode only.
//   halfWidth(t) = peakHalfWidthM × normalize(t^a × (1-t)^b)
//   a = max(0.3, peakT × sharpness)
//   b = max(0.3, (1 - peakT) × sharpness)
//   peak position of the un-normalized beta is at t = a / (a + b).
//   normalize divides by peak value so output peak == 1.0 at peak_t_actual.
//
// peak_t_actual may drift slightly from authored peakT for tiny powers — the
// max(0.3, ...) floor keeps base/tip from going singular near t=0/t=1.
//
// Returned by evaluateWidthProfileT in [0, 1]: relative half-width (multiply
// by maxHalfWidthM in the caller).

import type { WidthProfileSpec } from './LeafOrganGraph';

const MIN_POWER = 0.3;

/** Derive (basePower, tipPower) from authoring schema. */
export function deriveBetaPowers(p: WidthProfileSpec): { a: number; b: number } {
  const a = Math.max(MIN_POWER, p.peakT * p.sharpness);
  const b = Math.max(MIN_POWER, (1 - p.peakT) * p.sharpness);
  return { a, b };
}

/**
 * Evaluate beta width profile at t ∈ [0, 1]. Returns relative half-width in [0, 1]
 * (peak = 1.0). t=0 and t=1 always yield 0 (degenerate row → no gap with stem).
 */
export function evaluateWidthProfileT(profile: WidthProfileSpec, t: number): number {
  if (t <= 0 || t >= 1) return 0;

  switch (profile.mode) {
    case 'beta': {
      const { a, b } = deriveBetaPowers(profile);
      const peakT = a / (a + b);
      const peakValue = Math.pow(peakT, a) * Math.pow(1 - peakT, b);
      if (peakValue <= 0) return 0;
      const raw = Math.pow(t, a) * Math.pow(1 - t, b);
      return raw / peakValue;
    }
    case 'bezier':
    case 'sampled':
      // v0.1 stub — fall back to beta. v2 implements proper evaluators.
      log.warn(`mode='${profile.mode}' not implemented in v0.1, falling back to 'beta'.`);
      return evaluateWidthProfileT({ ...profile, mode: 'beta' }, t);
  }
}

/**
 * Closed-form integral of normalized beta(t; a, b) from 0 to 1, useful for
 * leaflet polygon area approximation in the botanical metric harness:
 *   area ≈ 2 × maxHalfWidthM × lengthM × betaIntegralNormalized(profile)
 *
 * Returns ∫₀¹ t^a × (1-t)^b dt / peakValue.
 *
 * Implementation: Gauss-Legendre 8-point quadrature on [0, 1]. Exact for a,b
 * up to power-15 polynomials; for the (0.3, 6.0) range we use, error < 1e-4.
 */
export function betaIntegralNormalized(profile: WidthProfileSpec): number {
  const { a, b } = deriveBetaPowers(profile);
  const peakT = a / (a + b);
  const peakValue = Math.pow(peakT, a) * Math.pow(1 - peakT, b);
  if (peakValue <= 0) return 0;

  // Gauss-Legendre nodes/weights on [-1, 1], mapped to [0, 1] below.
  const xs = [
    -0.9602898564975363, -0.7966664774136267, -0.5255324099163290,
    -0.1834346424956498,  0.1834346424956498,  0.5255324099163290,
     0.7966664774136267,  0.9602898564975363,
  ];
  const ws = [
    0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
    0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
  ];

  let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    const t = 0.5 * (xs[i] + 1); // map [-1,1] → [0,1]
    acc += ws[i] * Math.pow(t, a) * Math.pow(1 - t, b);
  }
  return 0.5 * acc / peakValue; // 0.5 = (1-0)/2 Jacobian
}
