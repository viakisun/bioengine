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
import type { SurplusAssimilatePolicy } from './BotanicalSpec';

export interface OrganAllocation {
  leafG: number;
  stemG: number;
  rootG: number;
  trussG: number[];        // per truss
  trussFruitsG: number[][]; // per truss → per live fruit
  /** Iter 5b — sink-demand clamp 잉여 (g DM/step). surplusPolicy='unused_pool' 일 때만 채워짐.
   *  진단/audit용. 'redistribute_to_vegetative' 일 때는 leafG/stemG/rootG로 흐름 → 여기는 0. */
  unusedAssimilateG?: number;
  /** Iter 5b — per-truss/fruit raw sink demand (clamp 적용 전). debug 출력용. */
  trussFruitsGRaw?: number[][];
  /** Iter 6e (SSOT #80) — source-sink audit metrics (per step). */
  totalAvailableDmG: number;                // = newDM input
  totalRawFruitDemandG: number;             // sum(trussFruitsGRaw) OR sum(trussFruitsG) if no cap
  totalLimitedFruitDemandG: number;         // sum(trussFruitsG) after clamp
  fruitDemandLimitedByCapG: number;         // = rawFruit - limitedFruit (Iter 5b cap 효과)
  totalVegetativeAllocatedG: number;        // leafG + stemG + rootG (after surplus redistribution)
}

/** Iter 5b — allocateDM options. */
export interface AllocateDmOptions {
  /** Per-fruit max dry-matter demand (g/step) ceiling. SinkAllocation
   *  clamps raw fruit demand to this value. 단위는 newDM과 같은 step duration.
   *  Sparse OK — undefined entry는 unlimited 의미. */
  perFruitMaxDemandG?: number[][];  // [trussIdx][fruitIdx]
  /** 'unused_pool' (Iter 5b 기본): clamp surplus는 어디로도 흐르지 않고
   *   unusedAssimilateG에만 기록.
   *  'redistribute_to_vegetative': surplus를 leaf pool에 합산 (Heuvelink hierarchy). */
  surplusPolicy?: SurplusAssimilatePolicy;
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

/** Compute organ allocation for a given step's new DM amount.
 *
 *  Step 1: compute all sink strengths (vegetative + per-truss)
 *  Step 2: proportional split
 *  Step 3: apply Heuvelink fruit-fraction cap to redistribute
 *          excess back to vegetative organs.
 *  Step 4: subdivide each truss allocation across its live fruits
 *          (by per-fruit sink strength).
 *  Step 5 (Iter 5b): if options.perFruitMaxDemandG is provided, clamp
 *          per-fruit allocation. Surplus handling per surplusPolicy.
 */
export function allocateDM(
  newDM: number,
  state: PlantPhysiologyState,
  cultivar: Cultivar,
  options?: AllocateDmOptions,
): OrganAllocation {
  if (newDM <= 0) {
    return {
      leafG: 0, stemG: 0, rootG: 0,
      trussG: state.trusses.map(() => 0),
      trussFruitsG: state.trusses.map((t) => t.fruits.map(() => 0)),
      // Iter 6e audit fields — zeroed (no allocation event)
      totalAvailableDmG: newDM,
      totalRawFruitDemandG: 0,
      totalLimitedFruitDemandG: 0,
      fruitDemandLimitedByCapG: 0,
      totalVegetativeAllocatedG: 0,
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
      // Iter 6e audit fields
      totalAvailableDmG: newDM,
      totalRawFruitDemandG: 0,
      totalLimitedFruitDemandG: 0,
      fruitDemandLimitedByCapG: 0,
      totalVegetativeAllocatedG: newDM,
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

  // Iter 5b — per-fruit demand clamp + surplus policy
  const perFruitMax = options?.perFruitMaxDemandG;
  const surplusPolicy = options?.surplusPolicy ?? 'unused_pool';
  let unusedAssimilateG = 0;
  let trussFruitsGRaw: number[][] | undefined;

  if (perFruitMax) {
    trussFruitsGRaw = trussFruitsG.map(row => [...row]);  // raw copy for debug

    for (let ti = 0; ti < trussFruitsG.length; ti++) {
      const rowMax = perFruitMax[ti];
      if (!rowMax) continue;
      for (let fi = 0; fi < trussFruitsG[ti].length; fi++) {
        const max = rowMax[fi];
        if (max === undefined || max === null || !Number.isFinite(max)) continue;
        const raw = trussFruitsG[ti][fi];
        if (raw > max) {
          const surplus = raw - max;
          trussFruitsG[ti][fi] = max;
          // truss-level subtotal도 동기화
          trussG[ti] -= surplus;
          unusedAssimilateG += surplus;
        }
      }
    }

    // surplus 처리
    if (unusedAssimilateG > 0 && surplusPolicy === 'redistribute_to_vegetative') {
      const PG_veg = PG_leaf + PG_stem + PG_root;
      if (PG_veg > 0) {
        leafG += unusedAssimilateG * (PG_leaf / PG_veg);
        stemG += unusedAssimilateG * (PG_stem / PG_veg);
        rootG += unusedAssimilateG * (PG_root / PG_veg);
      }
      unusedAssimilateG = 0;  // 모두 vegetative로 흘렸으므로 0
    }
    // 'unused_pool': unusedAssimilateG에 남겨두고 어디로도 안 보냄
  }

  // Iter 6e (SSOT #80) — audit metrics 계산
  const sum2d = (arr: number[][]): number => arr.reduce((a, row) => a + row.reduce((b, v) => b + v, 0), 0);
  const totalRawFruitDemandG = trussFruitsGRaw ? sum2d(trussFruitsGRaw) : sum2d(trussFruitsG);
  const totalLimitedFruitDemandG = sum2d(trussFruitsG);
  const fruitDemandLimitedByCapG = Math.max(0, totalRawFruitDemandG - totalLimitedFruitDemandG);

  return {
    leafG, stemG, rootG, trussG, trussFruitsG,
    unusedAssimilateG: perFruitMax ? unusedAssimilateG : undefined,
    trussFruitsGRaw,
    totalAvailableDmG: newDM,
    totalRawFruitDemandG,
    totalLimitedFruitDemandG,
    fruitDemandLimitedByCapG,
    totalVegetativeAllocatedG: leafG + stemG + rootG,
  };
}
