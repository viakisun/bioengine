// Phase B validation — confirm that stepHourly × 24 ≈ stepDaily and
// that the diurnal env profile preserves the daily totals.
//
// Run: npx tsx packages/tomato-engine/test-hourly-equivalence.ts

import { createPlant, stepDaily, stepHourly, DEFAULT_CLIMATE } from './src/CoreModel';
import { diurnalEnv, parAtHour, tempAtHour } from './src/DiurnalEnv';
import { getCultivar } from './src/Cultivar';
import { GrowthEngine } from './src/GrowthEngine';

const cultivar = getCultivar('tomimaru-muchoo');
const env = { ...DEFAULT_CLIMATE, T_avg: 22 };

// -- Test 1: Diurnal env integrals match daily totals --
console.log('=== Test 1: diurnal env preserves daily totals ===');
let parAccum = 0;
let tempSum = 0;
for (let h = 0; h < 24; h++) {
  parAccum += parAtHour(env.daylight_hours, env.PAR_integral_mol, h) * 3600 / 1e6;
  tempSum += tempAtHour(env.T_avg, h);
}
const tempAvg = tempSum / 24;
console.log(`  PAR daily integral target: ${env.PAR_integral_mol.toFixed(2)} mol/m²`);
console.log(`  PAR via 24-hour sum:       ${parAccum.toFixed(2)} mol/m²`);
console.log(`  PAR relative error:        ${(Math.abs(parAccum - env.PAR_integral_mol) / env.PAR_integral_mol * 100).toFixed(3)}%`);
console.log(`  T_avg target:              ${env.T_avg.toFixed(2)} °C`);
console.log(`  T_avg via 24-hour avg:     ${tempAvg.toFixed(2)} °C`);
console.log(`  T_avg abs error:           ${Math.abs(tempAvg - env.T_avg).toFixed(4)} °C`);
console.log('');

// -- Test 2: stepHourly × 24 == stepDaily (numerical parity) --
console.log('=== Test 2: stepHourly × 24 == stepDaily for 50 days ===');
const stateA = createPlant(42);
const stateB = createPlant(42);
for (let d = 0; d < 50; d++) {
  stepDaily(stateA, cultivar, env);
  for (let h = 0; h < 24; h++) {
    stepHourly(stateB, cultivar, diurnalEnv(env, h));
  }
}
const fields: (keyof typeof stateA)[] = ['day', 'TT', 'N', 'LAI', 'W', 'W_f', 'W_m', 'heightCm'];
let maxRelDiff = 0;
for (const f of fields) {
  const a = stateA[f] as number;
  const b = stateB[f] as number;
  const rel = Math.abs(a) > 1e-6 ? Math.abs(a - b) / Math.abs(a) : Math.abs(a - b);
  maxRelDiff = Math.max(maxRelDiff, rel);
  console.log(`  ${f.padEnd(10)}  stepDaily=${a.toFixed(3).padStart(10)}  24×stepHourly=${b.toFixed(3).padStart(10)}  Δ=${(rel * 100).toFixed(4)}%`);
}
console.log(`  trusses: stepDaily=${stateA.trusses.length}  24×stepHourly=${stateB.trusses.length}`);
console.log(`  MAX rel diff: ${(maxRelDiff * 100).toFixed(4)}%`);
console.log('');

// -- Test 3: GrowthEngine.simulatePlantToHour reproducibility --
console.log('=== Test 3: GrowthEngine.simulatePlantToHour determinism + scrub ===');
const engine1 = new GrowthEngine();
engine1.addPlant({ seed: 100, cultivarName: 'tomimaru-muchoo' });
const r1 = engine1.simulatePlantToHour(100, 45, 14, env);

const engine2 = new GrowthEngine();
engine2.addPlant({ seed: 100, cultivarName: 'tomimaru-muchoo' });
// Stop along the way to test continued forward stepping
engine2.simulatePlantToHour(100, 20, 0, env);
engine2.simulatePlantToHour(100, 30, 6, env);
const r2 = engine2.simulatePlantToHour(100, 45, 14, env);

const engine3 = new GrowthEngine();
engine3.addPlant({ seed: 100, cultivarName: 'tomimaru-muchoo' });
// Jump backward in time mid-simulation (forces a reset+resim)
engine3.simulatePlantToHour(100, 60, 0, env);
const r3 = engine3.simulatePlantToHour(100, 45, 14, env);

console.log(`  Day 45, 14:00 direct       W=${r1.W.toFixed(2)}  W_f=${r1.W_f.toFixed(2)}  TT=${r1.TT.toFixed(2)}`);
console.log(`  Day 45, 14:00 multi-step   W=${r2.W.toFixed(2)}  W_f=${r2.W_f.toFixed(2)}  TT=${r2.TT.toFixed(2)}`);
console.log(`  Day 45, 14:00 after rewind W=${r3.W.toFixed(2)}  W_f=${r3.W_f.toFixed(2)}  TT=${r3.TT.toFixed(2)}`);
const determ_ok = Math.abs(r1.W - r2.W) < 1e-6 && Math.abs(r1.W - r3.W) < 1e-6;
console.log(`  Determinism: ${determ_ok ? '✓ all three runs match exactly' : '✗ FAIL — runs differ'}`);

// -- Final summary --
const ok = maxRelDiff < 0.001 && determ_ok;
console.log('');
if (ok) {
  console.log('✓ Phase B validation passed');
} else {
  console.error('✗ Phase B validation failed');
  process.exit(1);
}
