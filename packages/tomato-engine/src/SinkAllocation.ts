// SinkAllocation — Marcelis (1996) / Heuvelink (1995, 1996) sink-strength
// dry-matter partitioning.
//
// References:
//   - Marcelis 1996, J. Exp. Bot. 47:1281-1291 (sink strength concept)
//   - Heuvelink 1995, Physiol. Plant. 94:447-452 (per-organ ratios)
//   - Heuvelink 1996, Ann. Bot. 77:71-80 (TOMSIM saturation curve)
//
// Sink strength = potential growth rate at non-limiting assimilate
// supply. Per-organ sink strengths (relative): fruit truss 1.0, leaf
// 0.35, stem 0.15, root 0.07.
//
// Allocation rule: when total assimilate supply is less than total
// potential demand, each organ gets supply × (PG_i / ΣPG) — strictly
// proportional, no priority hierarchy.
//
// Heuvelink (TOMSIM) saturation override:
//   F_fruits_max = 0.660 · (1 - exp(-0.341 · N_active_fruits))
// caps the fruit fraction even when many fruits compete for assimilates.

import type { Cultivar } from './Cultivar';
import type { PlantPhysiologyState, TrussCohort, FruitCohort } from './CoreModel';

export interface OrganAllocation {
  leafG: number;
  stemG: number;
  rootG: number;
  trussG: number[];        // per truss
  trussFruitsG: number[][]; // per truss → per live fruit
}

/** Truss sink strength as a Gaussian function of (TT - TT_anthesis).
 *  Peak at the cell-expansion midpoint.
 *  PG_j(t) = N_fruits · w_max · exp(-b·(TT - TT_peak)²)
 *  Reference: Heuvelink 1996 + Marcelis 1996.
 */
export function trussSinkStrength(
  truss: TrussCohort,
  currentTT: number,
  cultivar: Cultivar,
): number {
  if (truss.fruitCount === 0) return 0;

  // Peak roughly at fertilization + cellDiv + half of expansion
  const peakTT =
    truss.anthesisTT +
    cultivar.cellDivisionDurationGDD +
    0.5 * cultivar.cellExpansionDurationGDD;

  const deltaTT = currentTT - peakTT;
  // Gaussian falloff over ±0.5 × expansion duration
  const sigma = 0.5 * cultivar.cellExpansionDurationGDD;
  const gauss = Math.exp(-(deltaTT * deltaTT) / (2 * sigma * sigma));

  const w_max = cultivar.potentialFruitMassG.mu; // mean potential mass
  // Convert FW → DM (~6%): the sink-strength formula in TOMSIM is in DM,
  // but our potentialFruitMassG.mu is FW. Use 0.06 DM%.
  const w_max_dm = w_max * 0.06;

  return truss.fruitCount * w_max_dm * gauss;
}

/** Per-fruit sink strength within a truss — also Gaussian on age, scaled
 *  by per-fruit potentialMassG. Used to subdivide truss allocation
 *  across its live fruits.
 */
export function fruitSinkStrength(
  fruit: FruitCohort,
  currentTT: number,
  cultivar: Cultivar,
): number {
  if (fruit.aborted || fruit.harvested || fruit.fertilizationTT < 0) return 0;
  const peakTT =
    fruit.fertilizationTT +
    cultivar.cellDivisionDurationGDD +
    0.5 * cultivar.cellExpansionDurationGDD;
  const sigma = 0.5 * cultivar.cellExpansionDurationGDD;
  const deltaTT = currentTT - peakTT;
  const gauss = Math.exp(-(deltaTT * deltaTT) / (2 * sigma * sigma));

  const w_max_dm = fruit.genome.potentialMassG * 0.06;
  return w_max_dm * gauss * fruit.genome.ripeningSpeedFactor;
}

/** Vegetative (leaf/stem/root) potential sink — scales with current
 *  leaf area. Until LAI hits a ceiling (~3.5), vegetative growth keeps
 *  pulling. After that, the LAI cap idles vegetative sink and pushes
 *  more to fruit (consistent with Heuvelink's vegetative-saturation
 *  observations).
 */
export function vegetativeSinkStrength(state: PlantPhysiologyState): {
  leaf: number;
  stem: number;
  root: number;
} {
  // base "potential" tied to LAI; with LAI_max 3.5, sink falls to 0
  const LAI_max = 3.5;
  const veg = Math.max(0, 1 - state.LAI / LAI_max);
  // Reasonable absolute scale: at LAI=0, veg potential ≈ 5 g DM/day per
  // organ component (calibrated so that early seedling grows ~5g/day).
  return {
    leaf: 5 * veg,
    stem: 5 * veg,
    root: 5 * veg,
  };
}

/** Heuvelink (1996) saturating fruit-fraction cap. */
export function fruitFractionCap(N_active_fruits: number): number {
  return 0.660 * (1 - Math.exp(-0.341 * N_active_fruits));
}

/** Compute organ allocation for a given daily new DM amount.
 *
 *  Step 1: compute all sink strengths (vegetative + per-truss)
 *  Step 2: proportional split
 *  Step 3: apply Heuvelink fruit-fraction cap to redistribute
 *          excess back to vegetative organs.
 *  Step 4: subdivide each truss allocation across its live fruits
 *          (by per-fruit sink strength).
 */
export function allocateDM(
  newDM: number,
  state: PlantPhysiologyState,
  cultivar: Cultivar,
): OrganAllocation {
  if (newDM <= 0) {
    return {
      leafG: 0, stemG: 0, rootG: 0,
      trussG: state.trusses.map(() => 0),
      trussFruitsG: state.trusses.map((t) => t.fruits.map(() => 0)),
    };
  }

  const veg = vegetativeSinkStrength(state);
  const PG_leaf = cultivar.sinkStrengthLeaf * veg.leaf;
  const PG_stem = cultivar.sinkStrengthStem * veg.stem;
  const PG_root = cultivar.sinkStrengthRoot * veg.root;

  const PG_trusses = state.trusses.map((t) =>
    trussSinkStrength(t, state.TT, cultivar),
  );
  const PG_total = PG_leaf + PG_stem + PG_root + PG_trusses.reduce((a, b) => a + b, 0);

  if (PG_total <= 0) {
    // Fallback: equal split to vegetative
    return {
      leafG: newDM / 3, stemG: newDM / 3, rootG: newDM / 3,
      trussG: state.trusses.map(() => 0),
      trussFruitsG: state.trusses.map((t) => t.fruits.map(() => 0)),
    };
  }

  // Initial proportional split
  let leafG = (PG_leaf / PG_total) * newDM;
  let stemG = (PG_stem / PG_total) * newDM;
  let rootG = (PG_root / PG_total) * newDM;
  const trussG = PG_trusses.map((pg) => (pg / PG_total) * newDM);

  // Heuvelink fruit-fraction cap
  let totalFruits = 0;
  for (const t of state.trusses) totalFruits += t.fruitCount;
  if (totalFruits > 0) {
    const cap = fruitFractionCap(totalFruits);
    const currentFruitFrac =
      trussG.reduce((a, b) => a + b, 0) / Math.max(1e-9, newDM);
    if (currentFruitFrac > cap) {
      // Redistribute excess fruit allocation to vegetative organs
      const targetFruitDM = cap * newDM;
      const actualFruitDM = trussG.reduce((a, b) => a + b, 0);
      const excess = actualFruitDM - targetFruitDM;
      const scale = targetFruitDM / actualFruitDM;
      for (let i = 0; i < trussG.length; i++) trussG[i] *= scale;
      // distribute excess across vegetative in their PG ratio
      const PG_veg = PG_leaf + PG_stem + PG_root;
      if (PG_veg > 0) {
        leafG += excess * (PG_leaf / PG_veg);
        stemG += excess * (PG_stem / PG_veg);
        rootG += excess * (PG_root / PG_veg);
      }
    }
  }

  // Subdivide each truss allocation across its live fruits
  const trussFruitsG: number[][] = state.trusses.map((truss, ti) => {
    const trussTotal = trussG[ti];
    if (trussTotal <= 0) return truss.fruits.map(() => 0);
    const perFruitSinks = truss.fruits.map((f) =>
      fruitSinkStrength(f, state.TT, cultivar),
    );
    const sumSinks = perFruitSinks.reduce((a, b) => a + b, 0);
    if (sumSinks <= 0) return truss.fruits.map(() => 0);
    return perFruitSinks.map((s) => (s / sumSinks) * trussTotal);
  });

  return { leafG, stemG, rootG, trussG, trussFruitsG };
}
