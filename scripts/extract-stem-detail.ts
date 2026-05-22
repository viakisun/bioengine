// Detail on stem radius distribution across base / mid / top of plant
// at week 4, 8, 12, 16. Goal: see whether MAX_RADIUS_MM cap is being
// hit consistently and how mass-only pipe model behaves vs reality.

import { GrowthEngine, type PlantState } from '../packages/tomato-engine/src';

const SAMPLE_SIZE = 30;
const SEED_BASE = 20260520;

const engine = new GrowthEngine();
engine.setEnvironment({
  temperatureC: 23, humidity: 0.7, lightHoursPerDay: 14,
  co2ppm: 800, substrateWater: 0.6, nutrientEC: 3.0,
});
for (let i = 0; i < SAMPLE_SIZE; i++) engine.addPlant({ seed: SEED_BASE + i });

function pct(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[idx];
}

const weeks = [2, 4, 6, 8, 10, 12, 14, 16];
console.log('week\tday\tbaseMin\tbase50\tbase95\tatCap%\tmidMean\ttopMean\tmassAboveKg');

for (const w of weeks) {
  const day = w * 7;
  const baseDiams: number[] = [];
  const midDiams: number[] = [];
  const topDiams: number[] = [];
  const massesAtBase: number[] = [];
  let atCap = 0;

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const s: PlantState = engine.computeState(SEED_BASE + i, day);
    if (s.nodes.length === 0) continue;
    const base = s.nodes[0];
    const mid = s.nodes[Math.floor(s.nodes.length / 2)];
    const top = s.nodes[s.nodes.length - 1];
    baseDiams.push(base.stemRadiusMm * 2);
    midDiams.push(mid.stemRadiusMm * 2);
    topDiams.push(top.stemRadiusMm * 2);
    massesAtBase.push(base.massAboveKg);
    if (base.stemRadiusMm >= 11.9) atCap++;
  }

  const baseMin = Math.min(...baseDiams);
  const base50 = pct(baseDiams, 0.5);
  const base95 = pct(baseDiams, 0.95);
  const midMean = midDiams.reduce((a, b) => a + b, 0) / midDiams.length;
  const topMean = topDiams.reduce((a, b) => a + b, 0) / topDiams.length;
  const meanMass = massesAtBase.reduce((a, b) => a + b, 0) / massesAtBase.length;
  const capPct = (atCap / SAMPLE_SIZE) * 100;

  console.log(`W${w}\t${day}\t${baseMin.toFixed(1)}\t${base50.toFixed(1)}\t${base95.toFixed(1)}\t${capPct.toFixed(0)}%\t${midMean.toFixed(1)}\t${topMean.toFixed(1)}\t${meanMass.toFixed(2)}`);
}
