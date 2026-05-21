// Dump per-node leaf state for one plant at day 114 (= W16+ end-of-scenario)
// to see exactly how many leaves render and where they are on the stem.

import { GrowthEngine } from '../packages/tomato-engine/src';

const engine = new GrowthEngine();
engine.setEnvironment({
  temperatureC: 23, humidity: 0.7, lightHoursPerDay: 14,
  co2ppm: 800, substrateWater: 0.6, nutrientEC: 3.0,
});
engine.addPlant({ seed: 20260520 });
const s = engine.computeState(20260520, 114);

console.log(`day=114, total nodes=${s.nodes.length}, plant height=${s.heightCm.toFixed(0)}cm`);
console.log(`leafCount (engine, mat>0.2): ${s.leafCount}`);
console.log('');
console.log('idx  age   h_cm   mat     size   isPruned  isSenescing');
let renderableTotal = 0;
let renderableInSupporting = 0; // i % 2 == 0 + maturity > 0.1
for (let i = 0; i < s.nodes.length; i++) {
  const n = s.nodes[i];
  const willRenderShowcase = n.leafMaturity > 0.1;
  const willRenderSupporting = i % 2 === 0 && n.leafMaturity > 0.1;
  if (willRenderShowcase) renderableTotal++;
  if (willRenderSupporting) renderableInSupporting++;
  const mark = willRenderSupporting ? '★' : willRenderShowcase ? '·' : ' ';
  console.log(
    `${mark} ${i.toString().padStart(3)} ${n.age.toFixed(0).padStart(4)} ` +
    `${n.heightCm.toFixed(0).padStart(5)} ${n.leafMaturity.toFixed(2)}  ` +
    `${n.leafSizeFactor.toFixed(2)}    ` +
    `${(n.leafMaturity < 0.01 && n.age > 70 ? '(sen.)' : n.leafMaturity < 0.01 ? '(pruned)' : '       ').padEnd(8)}` +
    `${(n.age > 50 && n.leafMaturity > 0.01 ? 'fading' : '')}`
  );
}
console.log('');
console.log(`Showcase renders ${renderableTotal} leaves (mat > 0.1)`);
console.log(`Supporting (every-other + mat > 0.1) renders ${renderableInSupporting} leaves`);
