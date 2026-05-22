// Per-day leaf count + ripe-truss-onset timeline for 5 plants.
// Reveals exactly when (and why) leaf count dips/rebounds during
// the 16-week cycle.

import { GrowthEngine } from '../packages/tomato-engine/src';

const engine = new GrowthEngine();
engine.setEnvironment({
  temperatureC: 23, humidity: 0.7, lightHoursPerDay: 14,
  co2ppm: 800, substrateWater: 0.6, nutrientEC: 3.0,
});
const seeds = [20260520, 20260521, 20260522, 20260523, 20260524];
for (const s of seeds) engine.addPlant({ seed: s });

console.log('day\t' + seeds.map((s) => `seed_${s % 10000}_leaf`).join('\t') + '\tavgLeaf\tfirstRipeDay');
const firstRipe: Record<number, number | null> = {};
for (const s of seeds) firstRipe[s] = null;

for (let day = 5; day <= 120; day += 1) {
  const counts: number[] = [];
  const ripes: string[] = [];
  for (const seed of seeds) {
    const state = engine.computeState(seed, day);
    counts.push(state.leafCount);
    if (firstRipe[seed] === null && state.maxRipenStage >= 4) {
      firstRipe[seed] = day;
    }
    ripes.push((firstRipe[seed] !== null && day === firstRipe[seed]) ? '★' : '');
  }
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  // Highlight days where avg drops vs previous day (sign of pruning event)
  const marker = ripes.some((r) => r === '★') ? '←ripe' : '';
  if (day % 3 === 0 || marker) {
    console.log(`${day}\t${counts.join('\t')}\t${avg.toFixed(1)}\t${marker}`);
  }
}
console.log('---');
console.log('First ripe-truss day per plant:');
for (const seed of seeds) console.log(`  seed ${seed}: ${firstRipe[seed]}`);
