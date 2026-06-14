// Phenotyping survey — Zone plan.
//
// Decomposes a phenotyping scenario into a sequence of waypoint zones the
// robot should stop at, each annotated with the bed-of-interest (Layer 1
// detection filter) and the gimbal side to face.
//
// rule "left-bed-on-forward,right-bed-on-return"  ⇒  forward pass scans left
// bed, return pass scans right bed.  At each zone the robot pauses, gimbal
// faces target, detection runs, then advances.

import type { ScenarioSpec } from '../types';
import { PlantManager } from '../../scene/PlantManager';

export interface Zone {
  /** Stable id like 'z-00f-left' or 'z-02r-right'. */
  id: string;
  /** Sequential index in the zone sequence (0 = first). */
  index: number;
  /** Rail X (m) the robot must reach before capturing. */
  railX: number;
  /** Which traverse pass this zone belongs to. */
  direction: 'forward' | 'return';
  /** Which side of the aisle the gimbal scans. */
  bedSide: 'left' | 'right';
  /** Absolute bed index whose plants are the detection target (L1 filter). */
  targetBedId: number;
  /** Plant indices belonging to this zone's target bed (for expectedFruits). */
  targetPlantIdxs: number[];
}

export interface PlanOpts {
  scenario: ScenarioSpec;
  plantManager: PlantManager;
  /** Rail traverse half-range in meters. Read from sceneOptions if not given. */
  railRangeM?: number;
  /** Number of stops per direction along the rail. default 12 (~24 zones total). */
  stopsPerPass?: number;
  /** Aisle z (passage center). Default -0.8 per scenario convention. */
  aisleZ?: number;
}

/**
 * Build the zone sequence for a phenotyping survey.
 *
 * Algorithm:
 *  1. Read active bed Z positions from PlantManager.
 *  2. Classify each active bed as 'left' (z > aisleZ) or 'right' (z < aisleZ).
 *  3. Pick nearestLeftBed / nearestRightBed (smallest |z - aisleZ|).
 *  4. Parse rule string to confirm forward→left, return→right mapping.
 *  5. Generate stopsPerPass evenly-spaced railX positions from -range..+range.
 *  6. Forward pass: railX -range..+range, bedSide='left', targetBedId=nearestLeftBed.
 *  7. Return pass: railX +range..-range, bedSide='right', targetBedId=nearestRightBed.
 */
export function planSurveyZones(opts: PlanOpts): Zone[] {
  const {
    scenario,
    plantManager,
    railRangeM = 14,
    stopsPerPass = 12,
    aisleZ = -0.8,
  } = opts;

  const activeBeds = plantManager.getActiveBedIndices();
  if (activeBeds.length === 0) return [];

  const bedsWithZ = activeBeds.map((bedIdx) => ({
    bedIdx,
    z: plantManager.getBedZ(bedIdx),
  }));

  const leftBeds = bedsWithZ.filter((b) => b.z > aisleZ);
  const rightBeds = bedsWithZ.filter((b) => b.z < aisleZ);

  const nearestLeft = leftBeds.length
    ? leftBeds.slice().sort((a, b) => (a.z - aisleZ) - (b.z - aisleZ))[0].bedIdx
    : null;
  const nearestRight = rightBeds.length
    ? rightBeds.slice().sort((a, b) => (aisleZ - a.z) - (aisleZ - b.z))[0].bedIdx
    : null;

  // Honor rule string but fall back to defaults if missing.
  const rule = (scenario.task.rule ?? 'left-bed-on-forward,right-bed-on-return')
    .toLowerCase()
    .replace(/\s+/g, '');
  const fwdLeft = rule.includes('left-bed-on-forward');
  const retRight = rule.includes('right-bed-on-return');

  const fwdSide: 'left' | 'right' = fwdLeft ? 'left' : 'right';
  const retSide: 'left' | 'right' = retRight ? 'right' : 'left';

  const fwdTargetBed = fwdSide === 'left' ? nearestLeft : nearestRight;
  const retTargetBed = retSide === 'left' ? nearestLeft : nearestRight;

  // No target bed on a side? Skip that pass entirely.
  const zones: Zone[] = [];
  let seq = 0;

  // Forward pass: railX from -range to +range
  if (fwdTargetBed != null) {
    const targetPlantIdxs = plantManager.getPlantsInBed(fwdTargetBed);
    for (let i = 0; i < stopsPerPass; i++) {
      const t = stopsPerPass === 1 ? 0.5 : i / (stopsPerPass - 1);
      const railX = -railRangeM + t * (2 * railRangeM);
      zones.push({
        id: `z-${String(i).padStart(2, '0')}f-${fwdSide}`,
        index: seq++,
        railX,
        direction: 'forward',
        bedSide: fwdSide,
        targetBedId: fwdTargetBed,
        targetPlantIdxs,
      });
    }
  }

  // Return pass: railX from +range to -range
  if (retTargetBed != null) {
    const targetPlantIdxs = plantManager.getPlantsInBed(retTargetBed);
    for (let i = 0; i < stopsPerPass; i++) {
      const t = stopsPerPass === 1 ? 0.5 : i / (stopsPerPass - 1);
      const railX = railRangeM - t * (2 * railRangeM);
      zones.push({
        id: `z-${String(i).padStart(2, '0')}r-${retSide}`,
        index: seq++,
        railX,
        direction: 'return',
        bedSide: retSide,
        targetBedId: retTargetBed,
        targetPlantIdxs,
      });
    }
  }

  return zones;
}
