// Phenotyping survey — Ground-truth fruit detection with 3-layer filter.
//
// Without a stereo/depth camera, simply running frustum culling on every
// fruit produces false positives from background beds visible through gaps.
// We apply three principled filters:
//
//   Layer 1 — Bed-of-interest: keep only fruits whose parent plant belongs
//             to the bed the robot has been calibrated to scan in this zone.
//             This models how phenotyping rigs actually operate.
//
//   Layer 2 — Working-distance gate: discard fruits outside the camera's
//             optical working distance (0.3 ~ 3.0 m default). Mimics real
//             lens spec; sanity backup for L1.
//
//   Layer 3 — Apparent solid-angle confidence: each detection carries a
//             confidence ∈ [0,1] = clamp(solidAngle / refSolidAngle, 0.1, 1.0).
//             Coverage and bin counts are weighted by this for ML-style
//             realism (not a binary yes/no on size).

import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { PlantManager } from '../../scene/PlantManager';
import type { GrowthEngine, PlantPhysiologyState } from '@farmsim/tomato-engine';

export type RipenessBin = 'green' | 'breaker' | 'turning' | 'pink' | 'red';

export const RIPENESS_BINS: readonly RipenessBin[] = ['green', 'breaker', 'turning', 'pink', 'red'] as const;

export interface FruitDetection {
  /** Stable id 'plant-{plantIdx}-truss-{trussIdx}-fruit-{fruitIdx}'. */
  fruitId: string;
  plantIdx: number;
  bedId: number;
  trussIdx: number;
  fruitIdx: number;
  /** Approximate world position (plant root + truss stem height). */
  worldPos: { x: number; y: number; z: number };
  /** Camera→fruit distance (m). */
  distanceM: number;
  /** Apparent solid angle (steradian). */
  solidAngleSr: number;
  /** L3 confidence ∈ [0.1, 1.0]. */
  confidence: number;
  /** USDA stage 0..5. */
  ripenStage: number;
  /** Continuous fraction within stage, 0..1. */
  ripenFraction: number;
  /** Equatorial diameter (mm). */
  diameterMm: number;
  /** Ripeness bucket (5-bin coarse classification). */
  bin: RipenessBin;
}

export interface DetectOpts {
  scene: Scene;
  camera: Camera;
  /** PhytoSim total minute (day × 1440 + minuteOfDay). */
  minute: number;
  /** L1 — only fruits whose plant.bedId === this are kept. */
  targetBedId: number;
  /** Plant index whitelist (typically the zone's targetPlantIdxs). */
  candidatePlantIdxs: readonly number[];
  plantManager: PlantManager;
  growthEngine: GrowthEngine;
  /** L2 — working-distance gate (m). */
  workingDistanceM?: { min: number; max: number };
  /** L3 — reference solid angle for confidence = 1.0. default 4e-4 sr
   *  (≈ 2.3 cm fruit at 1 m). */
  referenceSolidAngleSr?: number;
}

const DEFAULT_WD = { min: 0.3, max: 3.0 };
const DEFAULT_REF_SR = 4e-4;

/** Map USDA stage 0..5 to coarse 5-bin classification. */
export function binFromStage(stage: number): RipenessBin {
  if (stage <= 0) return 'green';
  if (stage === 1) return 'breaker';
  if (stage === 2) return 'turning';
  if (stage === 3) return 'pink';
  return 'red';
}

/** Detect every visible+countable fruit at the current moment.
 *  Pure read-only on the scene + engine; safe to call inside render loops. */
export function detectVisibleFruits(opts: DetectOpts): FruitDetection[] {
  const wd = opts.workingDistanceM ?? DEFAULT_WD;
  const refSr = opts.referenceSolidAngleSr ?? DEFAULT_REF_SR;
  const camWorld = opts.camera.globalPosition ?? opts.camera.position;
  const out: FruitDetection[] = [];

  for (const plantIdx of opts.candidatePlantIdxs) {
    // L1 — bed-of-interest. Plants in other beds skipped completely.
    if (opts.plantManager.getPlantBedIdx(plantIdx) !== opts.targetBedId) continue;

    const plant = opts.plantManager.getPlants()[plantIdx];
    if (!plant) continue;

    // Frustum quick reject at plant level (cheap — bounding sphere).
    if (!opts.camera.isInFrustum(plant.root as unknown as Parameters<typeof opts.camera.isInFrustum>[0])) continue;

    const seed = opts.plantManager.getPlantSeed(plantIdx);
    if (seed == null) continue;

    let phys: PlantPhysiologyState;
    try {
      phys = opts.growthEngine.simulatePlantToMinute(seed, opts.minute);
    } catch {
      continue; // plant not registered (race during shutdown etc.)
    }

    const plantPos = plant.root.absolutePosition;

    for (const truss of phys.trusses) {
      // World position: plant root + truss stem height above bed top.
      const fruitWorld = new Vector3(plantPos.x, plantPos.y + truss.stemHeight_m, plantPos.z);
      const dist = Vector3.Distance(camWorld, fruitWorld);
      if (dist < wd.min || dist > wd.max) continue;

      for (const fruit of truss.fruits) {
        if (fruit.aborted || fruit.harvested) continue;
        // Diameter (mm) → m, then solid angle = π · r² / d²
        const r = (fruit.diameter / 1000) / 2;
        const solidAngleSr = (Math.PI * r * r) / (dist * dist);
        const confidence = Math.max(0.1, Math.min(1.0, solidAngleSr / refSr));

        out.push({
          fruitId: `plant-${plantIdx}-truss-${truss.index}-fruit-${fruit.index}`,
          plantIdx,
          bedId: opts.targetBedId,
          trussIdx: truss.index,
          fruitIdx: fruit.index,
          worldPos: { x: fruitWorld.x, y: fruitWorld.y, z: fruitWorld.z },
          distanceM: dist,
          solidAngleSr,
          confidence,
          ripenStage: fruit.ripenStage,
          ripenFraction: fruit.ripenFraction,
          diameterMm: fruit.diameter,
          bin: binFromStage(fruit.ripenStage),
        });
      }
    }
  }

  return out;
}

/** Expected ground-truth fruit count for a zone — sum of live fruits across
 *  all candidate plants. Used as denominator for coverage-pct. */
export function countExpectedFruits(opts: {
  candidatePlantIdxs: readonly number[];
  plantManager: PlantManager;
  growthEngine: GrowthEngine;
  minute: number;
}): number {
  let total = 0;
  for (const plantIdx of opts.candidatePlantIdxs) {
    const seed = opts.plantManager.getPlantSeed(plantIdx);
    if (seed == null) continue;
    try {
      const phys = opts.growthEngine.simulatePlantToMinute(seed, opts.minute);
      for (const truss of phys.trusses) {
        for (const fruit of truss.fruits) {
          if (!fruit.aborted && !fruit.harvested) total++;
        }
      }
    } catch { /* */ }
  }
  return total;
}

/** Aggregate detections into bin counts (raw + confidence-weighted). */
export interface BinSummary {
  rawCount: number;
  weightedCount: number;
  bins: Record<RipenessBin, number>;
  weightedBins: Record<RipenessBin, number>;
  avgConfidence: number;
}

export function summarizeDetections(detections: readonly FruitDetection[]): BinSummary {
  const bins: Record<RipenessBin, number> = { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 };
  const weightedBins: Record<RipenessBin, number> = { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 };
  let weightedCount = 0;
  let confSum = 0;
  for (const d of detections) {
    bins[d.bin]++;
    weightedBins[d.bin] += d.confidence;
    weightedCount += d.confidence;
    confSum += d.confidence;
  }
  return {
    rawCount: detections.length,
    weightedCount,
    bins,
    weightedBins,
    avgConfidence: detections.length === 0 ? 0 : confSum / detections.length,
  };
}
