// Smoke test for CoreModel — Phase 1 validation.
//
// Validates that the GDD-driven Reduced TOMGRO 5-state model produces
// numbers within the literature-cited bounds at constant 22°C (typical
// greenhouse setpoint). References cited in plan a-drifting-wigderson.md.
//
// Run: node packages/tomato-engine/test-coremodel.mjs
//
// Expected (literature):
//   - GDD per truss ≈ 120 (1 truss/week at 22°C → eff = 12°C → 10 days)
//   - Days to first flower at 22°C ≈ 21 (GDD_to_first_flower 250 / T_eff 12)
//   - Total cycle GDD ~1800-2200 → ~150-180 days at 22°C
//   - Trusses in 120 days ≈ (120·12 - 250) / 120 + 1 ≈ 10-11

import { createPlant, stepDaily, DEFAULT_CLIMATE } from './src/CoreModel';
import { getCultivar } from './src/Cultivar';

const env = { ...DEFAULT_CLIMATE, T_avg: 22 };
const cultivar = getCultivar('tomimaru-muchoo');
const state = createPlant(42);

for (let day = 0; day < 120; day++) {
  stepDaily(state, cultivar, env);
}

console.log('=== day 120 @ 22°C constant, Tomimaru Muchoo ===');
console.log(`TT (GDD):                  ${state.TT.toFixed(1)}`);
console.log(`Node count (N):            ${state.N}`);
console.log(`LAI:                       ${state.LAI.toFixed(2)}`);
console.log(`Plant DM (W) g:            ${state.W.toFixed(1)}`);
console.log(`Fruit DM (W_f) g:          ${state.W_f.toFixed(1)}`);
console.log(`Mature fruit DM (W_m) g:   ${state.W_m.toFixed(1)}`);
console.log(`Height cm:                 ${state.heightCm.toFixed(1)}`);
console.log(`Truss count:               ${state.trusses.length}`);

let totalFruits = 0;
let totalFresh = 0;
let stageHistogram = [0, 0, 0, 0, 0, 0];
for (const truss of state.trusses) {
  totalFruits += truss.fruitCount;
  for (const fruit of truss.fruits) {
    if (fruit.aborted || fruit.fertilizationTT < 0) continue;
    totalFresh += fruit.W_fruit_fresh;
    stageHistogram[fruit.ripenStage]++;
  }
}
console.log(`Live fruit count:          ${totalFruits}`);
console.log(`Total fruit FW g:          ${totalFresh.toFixed(1)} (= ${(totalFresh/1000).toFixed(2)} kg)`);
console.log(`Stage histogram (0..5):    ${stageHistogram.join(', ')}`);

// Acropetal ripening: pick a mid-cycle truss (not too early — would be
// all red; not too late — would be all green) to see the spread.
{
  const midIdx = Math.min(state.trusses.length - 1, Math.max(0, Math.floor(state.trusses.length * 0.55)));
  const tm = state.trusses[midIdx];
  const active = tm.fruits.filter((f) => !f.aborted && f.fertilizationTT > 0);
  if (active.length >= 2) {
    const basal = active[0];
    const distal = active[active.length - 1];
    const stageSpread = basal.ripenStage - distal.ripenStage;
    console.log(`Acropetal check (truss ${midIdx}, mid-cycle): basal stage=${basal.ripenStage} (frac ${basal.ripenFraction.toFixed(2)}) vs distal stage=${distal.ripenStage} (frac ${distal.ripenFraction.toFixed(2)})  spread=${stageSpread}`);
  }
}
// Also harvest index
console.log(`Harvest index (W_f / W):   ${(state.W_f / state.W).toFixed(3)} (target 0.55-0.65 — Phase 3 tightening)`);

// Sanity assertions vs literature ranges
const errors = [];
if (state.TT < 1200 || state.TT > 2500) errors.push(`TT ${state.TT} outside expected ~1440 at 22°C`);
if (state.trusses.length < 5 || state.trusses.length > 15) errors.push(`Truss count ${state.trusses.length} outside ~10`);
if (state.LAI < 1 || state.LAI > 4) errors.push(`LAI ${state.LAI} outside 1-4`);
if (errors.length) {
  console.error('VALIDATION ERRORS:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
} else {
  console.log('\n✓ All literature-range checks passed (Phase 1 placeholder; Phase 2 will tighten)');
}
