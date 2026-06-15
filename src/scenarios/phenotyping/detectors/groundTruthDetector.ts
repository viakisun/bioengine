// Phenotyping survey v2 — Ground-truth detector (baseline).
//
// Skips pixel work — reads the simulator's internal fruit state directly.
// Useful as a "perfect oracle" baseline to compare against HSV/ONNX.

import type { Detector, DetectorContext, FruitDetection, RipenessBin } from './types';

function binFromStage(stage: number): RipenessBin {
  if (stage <= 0) return 'green';
  if (stage === 1) return 'breaker';
  if (stage === 2) return 'turning';
  if (stage === 3) return 'pink';
  return 'red';
}

export const groundTruthDetector: Detector = {
  id: 'ground-truth',
  label: 'Ground Truth (oracle)',
  source: 'gt',
  async detect(panorama: ImageData, ctx: DetectorContext): Promise<FruitDetection[]> {
    const out: FruitDetection[] = [];
    const { plantManager, growthEngine, targetBedId, minute } = ctx;
    const { pxPerM, railStartX } = ctx.panorama;
    const plantIdxs = plantManager.getPlantsInBed(targetBedId);
    for (const plantIdx of plantIdxs) {
      const seed = plantManager.getPlantSeed(plantIdx);
      if (seed == null) continue;
      const plants = plantManager.getPlants();
      const plant = plants[plantIdx];
      if (!plant) continue;
      try {
        const phys = growthEngine.simulatePlantToMinute(seed, minute);
        const plantX = plant.root.absolutePosition.x;
        // Plant X within panorama range?
        if (plantX < railStartX - 1 || plantX > ctx.panorama.railEndX + 1) continue;
        const panX = (plantX - railStartX) * pxPerM;
        const trussCount = phys.trusses.length;
        // Distribute fruits vertically along truss heights (rough mapping)
        for (let ti = 0; ti < trussCount; ti++) {
          const truss = phys.trusses[ti];
          // Vertical: lower trusses = higher Y in panorama (panorama Y inverted)
          const panY = panorama.height * (1 - (ti + 0.5) / Math.max(1, trussCount));
          for (const fruit of truss.fruits) {
            if (fruit.aborted || fruit.harvested) continue;
            // bbox size ≈ fruit diameter mapped to px
            const diamPx = Math.max(8, (fruit.diameter / 1000) * pxPerM);
            out.push({
              bbox: {
                x: Math.max(0, panX - diamPx / 2),
                y: Math.max(0, panY - diamPx / 2),
                w: diamPx,
                h: diamPx,
              },
              worldX: plantX,
              bin: binFromStage(fruit.ripenStage),
              confidence: 1.0, // oracle = perfect
              source: 'gt',
            });
          }
        }
      } catch {
        // plant not registered or simulation failure — skip silently
      }
    }
    return out;
  },
};
