// Physics model for tomato plant structural mechanics
// Zero Three.js dependencies — pure computation

import type { PlantGenome } from './PlantGenome';
import type { NodeState } from './GrowthModel';

const GRAVITY = 9.81; // m/s²
const TOMATO_FRUIT_DENSITY = 1050; // kg/m³ (≈ water)
const STEM_DENSITY = 800; // kg/m³ (green stem tissue)
// Leaf mass is now computed per-node from leafMassG field (science-based)
const LEAF_MASS_FALLBACK_KG = 0.025; // fallback ~25g if leafMassG not available
const MIN_RADIUS_MM = 2; // growing tip minimum (~4mm diameter)
const MAX_RADIUS_MM = 12; // mature base max (~24mm diameter; real data: stem 10-16mm dia)
const WIRE_HEIGHT_CM = 350; // training wire at 3.5m

/**
 * Compute physics for all nodes: mass accumulation, stem radius, bending.
 * Modifies nodes in place (adds physics fields).
 * Runs a single top-down pass for mass, then bottom-up for radius/bending.
 */
export function computePhysics(
  nodes: NodeState[],
  genome: PlantGenome,
): void {
  if (nodes.length === 0) return;

  const wireHeightCm = (genome.wireAttachmentHeight ?? 3.5) * 100;
  const E = (genome.stemYoungsModulusMPa ?? 10) * 1e6; // Pa
  const strengthFactor = genome.stemStrengthFactor ?? 1.0;

  // --- Pass 1: Compute mass at each node (top → bottom accumulation) ---
  // Walk from top to bottom, accumulating massAbove
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];

    // Node's own contributions
    let nodeMass = 0;

    // Leaf mass — science-based: scales with leaf area (sizeFactor²)
    if (node.leafMaturity > 0.1) {
      const leafMassKg = (node.leafMassG != null && node.leafMassG > 0)
        ? node.leafMassG / 1000
        : LEAF_MASS_FALLBACK_KG * node.leafSizeFactor * node.leafMaturity;
      nodeMass += leafMassKg;
    }

    // Truss/fruit mass
    if (node.truss) {
      for (const fruit of node.truss.fruits) {
        const radiusM = (fruit.diameterMm / 2) / 1000;
        const volume = (4 / 3) * Math.PI * radiusM * radiusM * radiusM;
        nodeMass += TOMATO_FRUIT_DENSITY * volume;
      }
      // Flower mass negligible
    }

    // Stem segment mass (internode)
    const internodeLenM = i < nodes.length - 1
      ? (nodes[i + 1].heightCm - node.heightCm) / 100
      : 0.03; // tip segment ~3cm

    // Use approximate radius for segment mass (will refine)
    const approxRadiusM = 0.01; // ~10mm initial estimate
    const stemSegMass = STEM_DENSITY * Math.PI * approxRadiusM * approxRadiusM * internodeLenM;
    nodeMass += stemSegMass;

    // Accumulate: this node's mass + everything above
    const massFromAbove = i < nodes.length - 1 ? nodes[i + 1].massAboveKg : 0;
    node.massAboveKg = massFromAbove + nodeMass;
  }

  // --- Pass 2: Compute stem radius from mass (Pipe Model) ---
  // Cross-section area ∝ mass supported
  // radius = sqrt(mass × supportFactor + minRadius²)
  const supportCoeff = 0.000025 * strengthFactor; // tuned for herbaceous vine (2-12mm radius, real data)

  for (const node of nodes) {
    const rawRadius = Math.sqrt(node.massAboveKg * supportCoeff + (MIN_RADIUS_MM / 1000) ** 2) * 1000;
    node.stemRadiusMm = clamp(rawRadius, MIN_RADIUS_MM, MAX_RADIUS_MM);
  }

  // --- Pass 3: Compute bending moment and deflection ---
  // Each truss creates a lateral force (gravity on fruit cluster offset from stem)
  // Simplified: accumulate bending from trusses below wire

  // Find dominant truss direction for bending
  let totalMomentX = 0;
  let totalMomentZ = 0;

  for (const node of nodes) {
    if (!node.truss || node.truss.fruits.length === 0) continue;
    if (node.heightCm > wireHeightCm) continue; // wire supports above

    const trussAngleRad = (node.phyllotaxisAngle + 180) * Math.PI / 180; // opposite to leaf
    const armLength = 0.08; // ~8cm horizontal offset of fruit cluster

    let trussMass = 0;
    for (const fruit of node.truss.fruits) {
      const r = (fruit.diameterMm / 2) / 1000;
      trussMass += TOMATO_FRUIT_DENSITY * (4 / 3) * Math.PI * r * r * r;
    }

    const moment = trussMass * GRAVITY * armLength;
    totalMomentX += moment * Math.cos(trussAngleRad);
    totalMomentZ += moment * Math.sin(trussAngleRad);
  }

  const totalMoment = Math.sqrt(totalMomentX * totalMomentX + totalMomentZ * totalMomentZ);
  const bendAzimuth = Math.atan2(totalMomentZ, totalMomentX);

  for (const node of nodes) {
    const isAboveWire = node.heightCm > wireHeightCm;
    const radiusM = node.stemRadiusMm / 1000;
    const I = (Math.PI / 4) * radiusM * radiusM * radiusM * radiusM; // second moment of area

    if (isAboveWire || totalMoment < 0.001 || I < 1e-12) {
      node.bendingMomentNm = 0;
      node.deflectionRad = 0;
      node.deflectionAzimuth = 0;
    } else {
      // Fraction of moment felt at this height (more at base, less near wire)
      const wireFrac = node.heightCm / wireHeightCm;
      const momentHere = totalMoment * (1 - wireFrac);

      node.bendingMomentNm = momentHere;

      // Deflection angle: θ = M × L / (E × I)
      const segLen = 0.05; // representative segment length
      const deflection = (momentHere * segLen) / (E * I);
      node.deflectionRad = clamp(deflection, 0, 0.15); // max ~8.5° lean
      node.deflectionAzimuth = bendAzimuth;
    }
  }
}

/**
 * Compute physics-based droop for a truss peduncle.
 * Returns droop amount in meters.
 */
export function computeTrussDroop(
  truss: { fruits: Array<{ diameterMm: number }>; flowers: Array<unknown> },
  genome: PlantGenome,
): number {
  let totalMass = 0;
  for (const fruit of truss.fruits) {
    const r = (fruit.diameterMm / 2) / 1000;
    totalMass += TOMATO_FRUIT_DENSITY * (4 / 3) * Math.PI * r * r * r;
  }

  // Peduncle as cantilever beam
  const pedRadiusM = 0.003; // 3mm peduncle
  const pedLenM = 0.12;
  const I = (Math.PI / 4) * Math.pow(pedRadiusM, 4);
  const E = ((genome.stemYoungsModulusMPa ?? 10) * 1e6) * 0.5; // peduncle is softer than main stem

  // Tip deflection of cantilever: δ = F × L³ / (3 × E × I)
  const F = totalMass * GRAVITY;
  const deflection = (F * Math.pow(pedLenM, 3)) / (3 * E * I);

  return clamp(deflection, 0.01, 0.15); // min 1cm, max 15cm droop
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
