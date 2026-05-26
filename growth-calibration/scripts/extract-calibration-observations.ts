// extract-calibration-observations — Simulation Output (Artifact #3)
// adapter that produces PlantObservation-shaped JSONs from the live engine.
//
// Different from `packages/tomato-engine/diagnostics/snapshot.ts`:
//   - snapshot.ts: legacy PlantSnapshot format (preserved untouched).
//   - this file:   PlantObservation (growthCalibration.v1) — directly
//                   comparable to Reference Pack observations.
//
// Output:
//   growth-calibration/experiments/{experimentId}/simulation/{modelVersion}/
//     day_{NNN}/sim_{plantId}.json
//
// Usage:
//   npx vite-node growth-calibration/scripts/extract-calibration-observations.ts \
//     --cultivar tomimaru-muchoo \
//     --experimentId tomato_calibration_baseline \
//     --modelVersion growthModel.tomato.baseline \
//     --ensemble 20 \
//     --baseSeed 20260520 \
//     --days 0,10,20,30,40,50,60,70,80,90,100,110,120,130,140,150
//
// Each (seed, day) cell → 1 PlantObservation file. Ensemble of N=20 covers
// gaussian genome variation per cultivar (same approach as
// scripts/extract-weekly-metrics.ts).

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { GrowthEngine } from '../../packages/tomato-engine/src/GrowthEngine';
import { getCultivar, CULTIVARS } from '../../packages/tomato-engine/src/Cultivar';
import { DEFAULT_CLIMATE } from '../../packages/tomato-engine/src/CoreModel';
import { ACTIVE_ENGINE_MODE } from '../../packages/tomato-engine/src/EngineMode';
import { ACTIVE_BOTANICAL, ACTIVE_MODEL } from '../../packages/tomato-engine/src/ModelRegistry';
import { computePlantGeometry } from '../../src/plant/PlantBase';
import type {
  PlantObservation,
  TrussObservation,
  LeafObservation,
  FruitObservation,
  TrussStatus,
  FruitStatus,
  Provenance,
} from '../schema/types';

// ── CLI ───────────────────────────────────────────────────────────────

const DEFAULT_DAYS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];

interface CliArgs {
  cultivar: string;
  experimentId: string;
  modelVersion: string;
  ensemble: number;
  baseSeed: number;
  days: number[];
  outRoot: string;
  /** Iter 6b — sweep harness가 child-process 격리에 사용. dump-growth-checkpoints와
   *  동일 패턴 (process-local mutation). format: "inflectionC=X,rateB=Y,exponentScaling=Z". */
  overrideGompertz?: { inflectionC?: number; rateB?: number; exponentScaling?: number };
  /** Iter 6c — phenology override (target cultivar only). */
  overridePhenology?: { cellDivisionDurationGDD?: number; cellExpansionDurationGDD?: number };
  /** Iter 6d — cohort override (target cultivar only, SSOT #53).
   *  format: "flowersPerTrussMu=7,fruitSetRate=0.75" */
  overrideCohort?: { flowersPerTrussMu?: number; fruitSetRate?: number };
  /** Iter 6f — abortion override (target cultivar only, SSOT #61).
   *  format: "thresholdRatio=0.18,lagDays=7" */
  overrideAbortion?: { thresholdRatio?: number; lagDays?: number };
  /** Iter 6h — visibility gate override (botanical-level, SSOT #74).
   *  format: "gateMode=phase_and_gdd,minFruitAgeGDDForVisible=80" */
  overrideVisibility?: { gateMode?: 'diameter_only' | 'phase' | 'phase_and_gdd'; minFruitAgeGDDForVisible?: number };
  /** Iter 6e — massFlow surplusPolicy override (botanical-level, SSOT #78).
   *  Iter 6e-2: surplusPolicy enum 확장 + fruitPriorityRedistributionFraction.
   *  Iter 6e-3 (SSOT #87): phase-aware cap multiplier (cellDivisionRelax/cellExpansionRelax/ripeningRelax). */
  overrideMassFlow?: {
    surplusPolicy?: 'unused_pool' | 'redistribute_to_vegetative' | 'fruit_priority_limited';
    fruitPriorityRedistributionFraction?: number;
    cellDivisionRelax?: number;
    cellExpansionRelax?: number;
    ripeningRelax?: number;
    // Iter 7b (SSOT #103) — phaseAwareMassGrowth fields
    phaseAwareEnabled?: boolean;
    phaseAwareDivisionFraction?: number;
    phaseAwareDivisionMaxDiameter?: number;
    phaseAwareExpansionMultiplier?: number;
    phaseAwareRipeningMultiplier?: number;
    // Iter 7c (SSOT #106/#107) — expansionClockMode
    phaseAwareClockMode?: 'fertilization_based' | 'expansion_start_based';
    // Iter 9 (SSOT #116) — cellDivisionStepDemandFraction
    phaseAwareCellDivStepDemandFraction?: number;  // 0..1
  };
  /** Iter 8 (SSOT #108) — source capacity override (photosynthesis layer, global).
   *  format: "lueScale=1.2". Multiplies ACTIVE_MODEL.photosynthesis.LUE_gDM_per_mol_PAR. */
  overrideSource?: { lueScale?: number };
  /** Iter 8 (SSOT #108) — canopy / sink balance override (cultivar-level, all cultivars).
   *  format: "slaScale=1.2,leafSinkScale=0.7". Multiplies SLA and sinkStrengthLeaf. */
  overrideCanopy?: { slaScale?: number; leafSinkScale?: number };
}

function parseOverride(s?: string): CliArgs['overrideGompertz'] {
  if (!s) return undefined;
  const out: { inflectionC?: number; rateB?: number; exponentScaling?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === 'inflectionC') out.inflectionC = n;
    else if (k === 'rateB') out.rateB = n;
    else if (k === 'exponentScaling') out.exponentScaling = n;
  }
  return out;
}

function parseOverridePhenology(s?: string): CliArgs['overridePhenology'] {
  if (!s) return undefined;
  const out: { cellDivisionDurationGDD?: number; cellExpansionDurationGDD?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === 'cellDivisionDurationGDD') out.cellDivisionDurationGDD = n;
    else if (k === 'cellExpansionDurationGDD') out.cellExpansionDurationGDD = n;
  }
  return out;
}

function parseOverrideCohort(s?: string): CliArgs['overrideCohort'] {
  if (!s) return undefined;
  const out: { flowersPerTrussMu?: number; fruitSetRate?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === 'flowersPerTrussMu') out.flowersPerTrussMu = n;
    else if (k === 'fruitSetRate') out.fruitSetRate = n;
  }
  return out;
}

function parseOverrideAbortion(s?: string): CliArgs['overrideAbortion'] {
  if (!s) return undefined;
  const out: { thresholdRatio?: number; lagDays?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === 'thresholdRatio') out.thresholdRatio = n;
    else if (k === 'lagDays') out.lagDays = n;
  }
  return out;
}

function parseOverrideVisibility(s?: string): CliArgs['overrideVisibility'] {
  if (!s) return undefined;
  const out: { gateMode?: 'diameter_only' | 'phase' | 'phase_and_gdd'; minFruitAgeGDDForVisible?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    if (k === 'gateMode') {
      if (v === 'diameter_only' || v === 'phase' || v === 'phase_and_gdd') out.gateMode = v;
    } else if (k === 'minFruitAgeGDDForVisible') {
      const n = Number(v);
      if (Number.isFinite(n)) out.minFruitAgeGDDForVisible = n;
    }
  }
  return out;
}

function parseOverrideMassFlow(s?: string): CliArgs['overrideMassFlow'] {
  if (!s) return undefined;
  const out: NonNullable<CliArgs['overrideMassFlow']> = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    if (k === 'surplusPolicy') {
      if (v === 'unused_pool' || v === 'redistribute_to_vegetative' || v === 'fruit_priority_limited') out.surplusPolicy = v;
    } else if (k === 'fruitPriorityRedistributionFraction' || k === 'fruitPriorityFraction') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 1) out.fruitPriorityRedistributionFraction = n;
    } else if (k === 'cellDivisionRelax') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.cellDivisionRelax = n;
    } else if (k === 'cellExpansionRelax') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.cellExpansionRelax = n;
    } else if (k === 'ripeningRelax') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.ripeningRelax = n;
    } else if (k === 'phaseAwareEnabled') {
      out.phaseAwareEnabled = (v === 'true' || v === '1');
    } else if (k === 'phaseAwareDivisionFraction' || k === 'divisionFraction') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 1) out.phaseAwareDivisionFraction = n;
    } else if (k === 'phaseAwareDivisionMaxDiameter' || k === 'divisionMaxDiameter') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.phaseAwareDivisionMaxDiameter = n;
    } else if (k === 'phaseAwareExpansionMultiplier' || k === 'expansionMultiplier') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.phaseAwareExpansionMultiplier = n;
    } else if (k === 'phaseAwareRipeningMultiplier' || k === 'ripeningMultiplier') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.phaseAwareRipeningMultiplier = n;
    } else if (k === 'phaseAwareClockMode' || k === 'clockMode') {
      if (v === 'fertilization_based' || v === 'expansion_start_based') out.phaseAwareClockMode = v;
    } else if (k === 'phaseAwareCellDivStepDemandFraction' || k === 'cellDivStepDemandFraction') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0 && n <= 1) out.phaseAwareCellDivStepDemandFraction = n;
    }
  }
  return out;
}

function parseOverrideSource(s?: string): CliArgs['overrideSource'] {
  if (!s) return undefined;
  const out: { lueScale?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (k === 'lueScale') out.lueScale = n;
  }
  return out;
}

function parseOverrideCanopy(s?: string): CliArgs['overrideCanopy'] {
  if (!s) return undefined;
  const out: { slaScale?: number; leafSinkScale?: number } = {};
  for (const pair of s.split(',')) {
    const [k, v] = pair.split('=').map(t => t.trim());
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (k === 'slaScale') out.slaScale = n;
    else if (k === 'leafSinkScale') out.leafSinkScale = n;
  }
  return out;
}

function parseArgs(argv: string[]): CliArgs {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) opts[key] = 'true';
      else { opts[key] = val; i++; }
    }
  }
  return {
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    experimentId: opts.experimentId ?? 'tomato_calibration_baseline',
    modelVersion: opts.modelVersion ?? 'growthModel.tomato.baseline',
    ensemble: opts.ensemble ? Number(opts.ensemble) : 20,
    baseSeed: opts.baseSeed ? Number(opts.baseSeed) : 20260520,
    days: opts.days
      ? opts.days.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0)
      : DEFAULT_DAYS,
    outRoot: opts.outRoot ?? join(__dirname, '..', 'experiments'),
    overrideGompertz: parseOverride(opts.overrideGompertz),
    overridePhenology: parseOverridePhenology(opts.overridePhenology),
    overrideCohort: parseOverrideCohort(opts.overrideCohort),
    overrideAbortion: parseOverrideAbortion(opts.overrideAbortion),
    overrideVisibility: parseOverrideVisibility(opts.overrideVisibility),
    overrideMassFlow: parseOverrideMassFlow(opts.overrideMassFlow),
    overrideSource: parseOverrideSource(opts.overrideSource),
    overrideCanopy: parseOverrideCanopy(opts.overrideCanopy),
  };
}

/** Iter 6b — process-local Gompertz mutation (child-process per candidate, SSOT #48).
 *  ACTIVE_BOTANICAL + CULTIVARS derived fields 둘 다 mutate. */
function applyOverrideGompertz(args: CliArgs): void {
  const ov = args.overrideGompertz;
  if (!ov) return;
  const fg = ACTIVE_BOTANICAL.tomato.fruitDevelopment.gompertz;
  if (ov.inflectionC !== undefined) fg.inflectionC.mu = ov.inflectionC;
  if (ov.rateB !== undefined) fg.rateB.mu = ov.rateB;
  if (ov.exponentScaling !== undefined) fg.exponentScaling = ov.exponentScaling;
  for (const c of Object.values(CULTIVARS)) {
    if (ov.inflectionC !== undefined) {
      c.gompertzInflectionC = ov.inflectionC;
      c.resolvedBotanical.fruitDevelopment.gompertz.inflectionC.mu = ov.inflectionC;
    }
    if (ov.rateB !== undefined) {
      c.gompertzRateB = ov.rateB;
      c.resolvedBotanical.fruitDevelopment.gompertz.rateB.mu = ov.rateB;
    }
    if (ov.exponentScaling !== undefined) {
      c.resolvedBotanical.fruitDevelopment.gompertz.exponentScaling = ov.exponentScaling;
    }
  }
  console.log(`[extract override] gompertz: inflectionC=${ov.inflectionC ?? '-'}, rateB=${ov.rateB ?? '-'}, exp=${ov.exponentScaling ?? '-'}`);
}

/** Iter 6c — phenology override (target cultivar only, SSOT #49). */
function applyOverridePhenology(args: CliArgs): void {
  const ov = args.overridePhenology;
  if (!ov) return;
  const c = CULTIVARS[args.cultivar];
  if (!c) {
    console.warn(`[extract override phenology] cultivar ${args.cultivar} not found — skip`);
    return;
  }
  if (ov.cellDivisionDurationGDD !== undefined) c.cellDivisionDurationGDD = ov.cellDivisionDurationGDD;
  if (ov.cellExpansionDurationGDD !== undefined) c.cellExpansionDurationGDD = ov.cellExpansionDurationGDD;
  console.log(`[extract override] phenology: cultivar=${args.cultivar} cellDiv=${ov.cellDivisionDurationGDD ?? '-'}, cellExp=${ov.cellExpansionDurationGDD ?? '-'}`);
}

/** Iter 6d — cohort override (target cultivar only, SSOT #53).
 *  c.flowersPerTruss + c.reproductive.trussOrderProfile[*] + c.scenarios[*].reproductive.trussOrderProfile[*]
 *  모두 in-place mutate (CoreModel.emergeTruss는 rule?.flowersPerTruss ?? cultivar.flowersPerTruss). */
function applyOverrideCohort(args: CliArgs): void {
  const ov = args.overrideCohort;
  if (!ov) return;
  const c = CULTIVARS[args.cultivar];
  if (!c) {
    console.warn(`[extract override cohort] cultivar ${args.cultivar} not found — skip`);
    return;
  }
  if (ov.fruitSetRate !== undefined) c.fruitSetRate = ov.fruitSetRate;
  if (ov.flowersPerTrussMu !== undefined) {
    const mu = ov.flowersPerTrussMu;
    c.flowersPerTruss.mu = mu;
    for (const rule of c.reproductive.trussOrderProfile) {
      rule.flowersPerTruss.mu = mu;
    }
    for (const sc of Object.values(c.scenarios)) {
      for (const rule of sc.reproductive.trussOrderProfile) {
        rule.flowersPerTruss.mu = mu;
      }
    }
  }
  console.log(`[extract override] cohort: cultivar=${args.cultivar} flowersPerTrussMu=${ov.flowersPerTrussMu ?? '-'}, fruitSetRate=${ov.fruitSetRate ?? '-'}`);
}

/** Iter 6f — abortion / starvation override (target cultivar only, SSOT #61). */
function applyOverrideAbortion(args: CliArgs): void {
  const ov = args.overrideAbortion;
  if (!ov) return;
  const c = CULTIVARS[args.cultivar];
  if (!c) {
    console.warn(`[extract override abortion] cultivar ${args.cultivar} not found — skip`);
    return;
  }
  if (ov.thresholdRatio !== undefined) c.abortionThresholdRatio = ov.thresholdRatio;
  if (ov.lagDays !== undefined) c.abortionLagDays = ov.lagDays;
  console.log(`[extract override] abortion: cultivar=${args.cultivar} thresholdRatio=${ov.thresholdRatio ?? '-'}, lagDays=${ov.lagDays ?? '-'}`);
}

/** Iter 6h — visibility gate override (botanical-level, SSOT #74/76).
 *  ACTIVE_BOTANICAL + 모든 CULTIVARS.resolvedBotanical mutate (global, calibration-only). */
function applyOverrideVisibility(args: CliArgs): void {
  const ov = args.overrideVisibility;
  if (!ov) return;
  const mf = ACTIVE_BOTANICAL.tomato.fruitDevelopment.massFlow;
  if (ov.gateMode !== undefined) mf.visibilityGateMode = ov.gateMode;
  if (ov.minFruitAgeGDDForVisible !== undefined) mf.minFruitAgeGDDForVisible = ov.minFruitAgeGDDForVisible;
  for (const c of Object.values(CULTIVARS)) {
    const mf2 = c.resolvedBotanical.fruitDevelopment.massFlow;
    if (ov.gateMode !== undefined) mf2.visibilityGateMode = ov.gateMode;
    if (ov.minFruitAgeGDDForVisible !== undefined) mf2.minFruitAgeGDDForVisible = ov.minFruitAgeGDDForVisible;
  }
  console.log(`[extract override] visibility: gateMode=${ov.gateMode ?? '-'}, minFruitAgeGDDForVisible=${ov.minFruitAgeGDDForVisible ?? '-'}`);
}

/** Iter 6e — massFlow surplusPolicy override (botanical-level, SSOT #78).
 *  Iter 6e-3 (SSOT #87): + phase-aware cap multiplier (cellDivisionRelax/cellExpansionRelax/ripeningRelax). */
function applyOverrideMassFlow(args: CliArgs): void {
  const ov = args.overrideMassFlow;
  if (!ov) return;
  const mf = ACTIVE_BOTANICAL.tomato.fruitDevelopment.massFlow;
  if (ov.surplusPolicy !== undefined) mf.surplusPolicy = ov.surplusPolicy;
  if (ov.fruitPriorityRedistributionFraction !== undefined) mf.fruitPriorityRedistributionFraction = ov.fruitPriorityRedistributionFraction;
  if (ov.cellDivisionRelax !== undefined) mf.capRelaxationByPhase.cellDivision = ov.cellDivisionRelax;
  if (ov.cellExpansionRelax !== undefined) mf.capRelaxationByPhase.cellExpansion = ov.cellExpansionRelax;
  if (ov.ripeningRelax !== undefined) mf.capRelaxationByPhase.ripening = ov.ripeningRelax;
  // Iter 7b (SSOT #103) — phaseAwareMassGrowth override
  if (ov.phaseAwareEnabled !== undefined) mf.phaseAwareMassGrowth.enabled = ov.phaseAwareEnabled;
  if (ov.phaseAwareDivisionFraction !== undefined) mf.phaseAwareMassGrowth.divisionPhaseMassFraction = ov.phaseAwareDivisionFraction;
  if (ov.phaseAwareDivisionMaxDiameter !== undefined) mf.phaseAwareMassGrowth.divisionPhaseMaxDiameterMm = ov.phaseAwareDivisionMaxDiameter;
  if (ov.phaseAwareExpansionMultiplier !== undefined) mf.phaseAwareMassGrowth.expansionPhaseGrowthMultiplier = ov.phaseAwareExpansionMultiplier;
  if (ov.phaseAwareRipeningMultiplier !== undefined) mf.phaseAwareMassGrowth.ripeningPhaseGrowthMultiplier = ov.phaseAwareRipeningMultiplier;
  if (ov.phaseAwareClockMode !== undefined) mf.phaseAwareMassGrowth.expansionClockMode = ov.phaseAwareClockMode;
  if (ov.phaseAwareCellDivStepDemandFraction !== undefined) mf.phaseAwareMassGrowth.cellDivisionStepDemandFraction = ov.phaseAwareCellDivStepDemandFraction;
  for (const c of Object.values(CULTIVARS)) {
    const mf2 = c.resolvedBotanical.fruitDevelopment.massFlow;
    if (ov.surplusPolicy !== undefined) mf2.surplusPolicy = ov.surplusPolicy;
    if (ov.fruitPriorityRedistributionFraction !== undefined) mf2.fruitPriorityRedistributionFraction = ov.fruitPriorityRedistributionFraction;
    if (ov.cellDivisionRelax !== undefined) mf2.capRelaxationByPhase.cellDivision = ov.cellDivisionRelax;
    if (ov.cellExpansionRelax !== undefined) mf2.capRelaxationByPhase.cellExpansion = ov.cellExpansionRelax;
    if (ov.ripeningRelax !== undefined) mf2.capRelaxationByPhase.ripening = ov.ripeningRelax;
    if (ov.phaseAwareEnabled !== undefined) mf2.phaseAwareMassGrowth.enabled = ov.phaseAwareEnabled;
    if (ov.phaseAwareDivisionFraction !== undefined) mf2.phaseAwareMassGrowth.divisionPhaseMassFraction = ov.phaseAwareDivisionFraction;
    if (ov.phaseAwareDivisionMaxDiameter !== undefined) mf2.phaseAwareMassGrowth.divisionPhaseMaxDiameterMm = ov.phaseAwareDivisionMaxDiameter;
    if (ov.phaseAwareExpansionMultiplier !== undefined) mf2.phaseAwareMassGrowth.expansionPhaseGrowthMultiplier = ov.phaseAwareExpansionMultiplier;
    if (ov.phaseAwareRipeningMultiplier !== undefined) mf2.phaseAwareMassGrowth.ripeningPhaseGrowthMultiplier = ov.phaseAwareRipeningMultiplier;
    if (ov.phaseAwareClockMode !== undefined) mf2.phaseAwareMassGrowth.expansionClockMode = ov.phaseAwareClockMode;
    if (ov.phaseAwareCellDivStepDemandFraction !== undefined) mf2.phaseAwareMassGrowth.cellDivisionStepDemandFraction = ov.phaseAwareCellDivStepDemandFraction;
  }
  console.log(`[extract override] massFlow: surplusPolicy=${ov.surplusPolicy ?? '-'}, fruitPriorityRedistributionFraction=${ov.fruitPriorityRedistributionFraction ?? '-'}, capRelaxByPhase cellDiv/Exp/Ripen=${ov.cellDivisionRelax ?? '-'}/${ov.cellExpansionRelax ?? '-'}/${ov.ripeningRelax ?? '-'}, phaseAware enabled=${ov.phaseAwareEnabled ?? '-'} divFrac=${ov.phaseAwareDivisionFraction ?? '-'} expMul=${ov.phaseAwareExpansionMultiplier ?? '-'} clockMode=${ov.phaseAwareClockMode ?? '-'} cellDivStepDemandFrac=${ov.phaseAwareCellDivStepDemandFraction ?? '-'}`);
}

/** Iter 8 (SSOT #108) — source override (LUE × scale). global, photosynthesis layer. */
function applyOverrideSource(args: CliArgs): void {
  const ov = args.overrideSource;
  if (!ov) return;
  if (ov.lueScale !== undefined) {
    ACTIVE_MODEL.photosynthesis.LUE_gDM_per_mol_PAR *= ov.lueScale;
  }
  console.log(`[extract override] source: lueScale=${ov.lueScale ?? '-'} → LUE=${ACTIVE_MODEL.photosynthesis.LUE_gDM_per_mol_PAR.toFixed(4)}`);
}

/** Iter 8 (SSOT #108) — canopy override (SLA × scale, sinkStrengthLeaf × scale).
 *  Mirrors gompertz pattern: all cultivars mutated (calibration-only). */
function applyOverrideCanopy(args: CliArgs): void {
  const ov = args.overrideCanopy;
  if (!ov) return;
  for (const c of Object.values(CULTIVARS)) {
    if (ov.slaScale !== undefined) c.SLA *= ov.slaScale;
    if (ov.leafSinkScale !== undefined) c.sinkStrengthLeaf *= ov.leafSinkScale;
  }
  const target = CULTIVARS[args.cultivar];
  console.log(`[extract override] canopy: slaScale=${ov.slaScale ?? '-'} leafSinkScale=${ov.leafSinkScale ?? '-'} → cultivar=${args.cultivar} SLA=${target?.SLA.toFixed(4) ?? '-'} sinkStrengthLeaf=${target?.sinkStrengthLeaf.toFixed(4) ?? '-'}`);
}

// ── Status mapping (engine → schema enum) ─────────────────────────────

/** Iter 6 — fruit phase derivation (SSOT #6: expansion 분기는 diameter + phase 둘 다).
 *  CoreModel TT-based: fertilizationTT가 set된 후 gddSinceFert로 cell_division
 *  → cell_expansion → ripening 단계 도출. */
type FruitPhaseLite =
  | 'aborted' | 'pre_fertilization' | 'cell_division'
  | 'cell_expansion' | 'ripening_early' | 'ripening_late';

function derivePhase(
  f: { fertilizationTT: number; ripenStage: number; aborted: boolean; harvested: boolean },
  currentTT: number,
  cellDivisionDurationGDD: number,
  cellExpansionDurationGDD: number,
): FruitPhaseLite {
  if (f.aborted) return 'aborted';
  if (f.fertilizationTT < 0) return 'pre_fertilization';
  const gddSinceFert = currentTT - f.fertilizationTT;
  if (gddSinceFert < cellDivisionDurationGDD) return 'cell_division';
  if (gddSinceFert < cellDivisionDurationGDD + cellExpansionDurationGDD) return 'cell_expansion';
  if (f.ripenStage < 4) return 'ripening_early';
  return 'ripening_late';
}

const EXPANSION_OR_LATER = new Set<FruitPhaseLite>(['cell_expansion', 'ripening_early', 'ripening_late']);

/**
 * Map a physiology TrussCohort to TrussStatus.
 * Iter 6: minExpandingDiameterMm은 botanical에서 read, phase도 함께 검사.
 */
function mapTrussStatus(
  t: { emergenceTT: number; fruits: ReadonlyArray<{ fertilizationTT: number; ripenStage: number; aborted: boolean; harvested: boolean; diameter: number }> },
  currentTT: number,
  cultivar: { resolvedBotanical: { fruitDevelopment: { massFlow: { minExpandingDiameterMm: number } } }; cellDivisionDurationGDD: number; cellExpansionDurationGDD: number },
): TrussStatus {
  if (t.emergenceTT > currentTT) return 'not_visible';
  const liveFruits = t.fruits.filter(f => !f.aborted && !f.harvested);
  if (liveFruits.length === 0) {
    return currentTT - t.emergenceTT < 50 ? 'visible_bud' : 'flowering';
  }
  const minExpand = cultivar.resolvedBotanical.fruitDevelopment.massFlow.minExpandingDiameterMm;

  const setCount = liveFruits.filter(f =>
    f.fertilizationTT > 0 && f.diameter < minExpand,
  ).length;
  // SSOT #6 — expansion 판정은 diameter + phase 둘 다
  const expandingCount = liveFruits.filter(f => {
    if (f.diameter < minExpand) return false;
    if (f.ripenStage !== 0) return false;  // 이미 ripening은 별도 카운트
    const phase = derivePhase(f, currentTT, cultivar.cellDivisionDurationGDD, cultivar.cellExpansionDurationGDD);
    return EXPANSION_OR_LATER.has(phase);
  }).length;
  const breakerCount = liveFruits.filter(f => f.ripenStage >= 1 && f.ripenStage < 4).length;
  const redCount = liveFruits.filter(f => f.ripenStage >= 4).length;
  const allHarvested = liveFruits.length === 0 && t.fruits.some(f => f.harvested);

  if (allHarvested) return 'senescent';
  if (redCount > liveFruits.length / 2) return 'red';
  if (breakerCount > liveFruits.length / 2) return 'breaker';
  if (expandingCount > liveFruits.length / 2) return 'green_expanding';
  if (setCount > liveFruits.length / 2) return 'fruit_set';
  return 'flowering';
}

/**
 * Map a single PhysiologyFruit to FruitStatus.
 */
function mapFruitStatus(
  f: { fertilizationTT: number; ripenStage: number; aborted: boolean; harvested: boolean; diameter: number },
): FruitStatus {
  if (f.harvested) return 'harvested';
  if (f.aborted) return 'aborted';
  if (f.fertilizationTT <= 0) return 'flower';
  if (f.ripenStage >= 4) return 'red';
  if (f.ripenStage >= 3) return 'turning';
  if (f.ripenStage >= 1) return 'breaker';
  if (f.diameter >= 30) return 'green_expanding';
  if (f.diameter >= 5)  return 'small_green';
  return 'fruit_set';
}

// ── PlantObservation builder ──────────────────────────────────────────

const TWO_PI = Math.PI * 2;
const RAD_TO_DEG = 180 / Math.PI;

function rad2deg(rad: number): number {
  return ((rad % TWO_PI) + TWO_PI) % TWO_PI * RAD_TO_DEG;
}

interface BuildArgs {
  experimentId: string;
  modelVersion: string;
  cultivarName: string;
  seed: number;
  day: number;
}

function buildObservation(args: BuildArgs): PlantObservation {
  const cultivar = getCultivar(args.cultivarName);
  const engine = new GrowthEngine();
  engine.setEnvironment({
    temperatureC: DEFAULT_CLIMATE.T_avg,
    lightHoursPerDay: DEFAULT_CLIMATE.daylight_hours,
    co2ppm: DEFAULT_CLIMATE.CO2_ppm,
  });
  engine.addPlant({ seed: args.seed, cultivarName: args.cultivarName });
  engine.simulatePlantToHour(args.seed, args.day, 0, DEFAULT_CLIMATE);

  const physiology = engine.getPhysiologyState(args.seed)!;
  const state = engine.computeState(args.seed, args.day);
  const genome = engine.getGenome(args.seed)!;
  const plantBase = computePlantGeometry(state, { genome, cultivar, physiologyState: physiology });

  // ── Truss + Fruit observation building ──────────────────────────
  const trusses: TrussObservation[] = [];
  const fruits: FruitObservation[] = [];
  for (let i = 0; i < physiology.trusses.length; i++) {
    const t = physiology.trusses[i];
    const live = t.fruits.filter(f => !f.aborted && !f.harvested && f.fertilizationTT > 0);
    const largestDiam = live.length > 0 ? Math.max(...live.map(f => f.diameter)) : 0;
    const trussId = `T${i + 1}`;

    trusses.push({
      trussId,
      trussIndex: i + 1,
      attachedNodeIndex: 0,                          // not directly available — TODO Phase C
      status: mapTrussStatus(t, physiology.TT, cultivar),
      ageDays: physiology.TT > t.emergenceTT ? (physiology.TT - t.emergenceTT) / 12 : 0,
      peduncleLengthCm: 0,
      rachisLengthCm: 0,
      flowerBudCount: t.flowerCount,
      openFlowerCount: t.fruits.filter(f => f.fertilizationTT <= 0).length,
      fruitSetCount: t.fruits.filter(f => f.fertilizationTT > 0 && !f.aborted).length,
      visibleFruitCount: live.length,
      largestFruitDiameterMm: largestDiam,
      orientation: { azimuthDeg: 0, elevationDeg: -10, droopAngleDeg: 15 },
      phenology: {
        visibleDay: null, firstFlowerOpenDay: null, firstFruitSetDay: null,
        firstFruitVisibleDay: null, firstRipeDay: null,
      },
    });

    // Iter 5b — visibility threshold from botanical massFlow
    const minVisibleDiameterMm =
      cultivar.resolvedBotanical?.fruitDevelopment.massFlow.minVisibleDiameterMm ?? 0;
    // Iter 6h (SSOT #74) — 3-mode visibility gate
    const visibilityGateMode =
      cultivar.resolvedBotanical?.fruitDevelopment.massFlow.visibilityGateMode ?? 'diameter_only';
    const minFruitAgeGDDForVisible =
      cultivar.resolvedBotanical?.fruitDevelopment.massFlow.minFruitAgeGDDForVisible ?? 0;

    // Per-fruit observations
    for (let j = 0; j < t.fruits.length; j++) {
      const f = t.fruits[j];
      let isVisible = !f.aborted && !f.harvested && f.diameter >= minVisibleDiameterMm;
      if (isVisible && visibilityGateMode !== 'diameter_only') {
        const phase = derivePhase(f, physiology.TT, cultivar.cellDivisionDurationGDD, cultivar.cellExpansionDurationGDD);
        isVisible = phase !== 'cell_division' && phase !== 'pre_fertilization' && phase !== 'aborted';
        if (isVisible && visibilityGateMode === 'phase_and_gdd') {
          const gddSinceFert = physiology.TT - f.fertilizationTT;
          isVisible = gddSinceFert >= minFruitAgeGDDForVisible;
        }
      }
      fruits.push({
        fruitId: `F${i + 1}_${j + 1}`,
        trussId,
        trussIndex: i + 1,
        positionInTruss: j + 1,
        status: mapFruitStatus(f),
        diameterMm: f.diameter,
        heightMm: f.diameter * 0.95,                 // crude — Phase C 보강
        estimatedWeightG: f.W_fruit_fresh,
        colorStage: f.ripenStage >= 4 ? 'red' : f.ripenStage >= 1 ? 'turning' : 'green',
        visibility: { visible: isVisible, occlusionRatio: 0 },
        phenology: {
          flowerOpenDay: null, fruitSetDay: null, visibleFruitDay: null,
          breakerDay: null, ripeDay: null,
        },
      });
    }
  }

  // ── Leaf observation building (from plantBase) ──────────────────
  const leaves: LeafObservation[] = [];
  const allAxes = [plantBase.mainAxis, ...plantBase.sideShoots];
  for (let axisIdx = 0; axisIdx < allAxes.length; axisIdx++) {
    const axis = allAxes[axisIdx];
    for (const leaf of axis.leaves) {
      if (!leaf.visibility.visible) continue;
      leaves.push({
        leafId: `L_a${axisIdx}_n${leaf.nodeIdx}`,
        nodeIndex: leaf.nodeIdx,
        status: leaf.yellowing > 0.5 ? 'senescing' : leaf.sizeFactor < 0.5 ? 'expanding' : 'expanded',
        ageDays: 0,                                  // not directly available
        compoundLeaf: leaf.leafletCount > 1,
        leafletCount: leaf.leafletCount,
        petioleLengthCm: leaf.petioleLengthM * 100,
        rachisLengthCm: 0,                           // not in PlantBase.LeafBase directly
        leafLengthCm: 0,                             // TODO derive
        leafWidthCm: 0,
        leafAreaCm2: 0,                              // TODO derive from sizeFactor
        orientation: {
          azimuthDeg: rad2deg(leaf.azimuthRad),
          // Iter 5 prep — elevationDeg + lateralSpreadDeg는 PlantBase의 ESTIMATE
          // proxy. lateralSpread is leaflet_count_estimate, elevation is droop_rad_proxy.
          // 정식 mesh-derived 구현은 후속 plan.
          elevationDeg: leaf.elevationDeg,
          droopAngleDeg: leaf.droopRad * RAD_TO_DEG,
          rollDeg: 0,
          lateralSpreadDeg: leaf.lateralSpreadDeg,
        },
        shape: { averageLeafletAspect: 1.8, serrationLevel: 'medium', curlLevel: 'low' },
        health: {
          colorStage: leaf.yellowing > 0.5 ? 'yellowing' : 'green',
          senescence: leaf.yellowing,
          damageRatio: leaf.diseaseLoad,
        },
      });
    }
  }

  // ── Plant overall ───────────────────────────────────────────────
  const allLeavesActive = leaves.filter(l => l.status !== 'senescing' && l.status !== 'shed');
  const leavesExpanded = leaves.filter(l => l.status === 'expanded' || l.status === 'mature');
  const trussesFlowering = trusses.filter(t => t.status === 'flowering').length;
  const trussesFruiting = trusses.filter(t => ['fruit_set','small_green','green_expanding','fruit_expanding','breaker','ripening','red','harvest_ready'].includes(t.status)).length;
  const fruitsVisible = fruits.filter(f => f.visibility.visible && !['flower'].includes(f.status));
  const maxFruitDiamMm = fruitsVisible.length > 0 ? Math.max(...fruitsVisible.map(f => f.diameterMm)) : 0;

  // Iter 6 — cohort / expanding count (botanical threshold + phase-aware)
  const minExpand = cultivar.resolvedBotanical.fruitDevelopment.massFlow.minExpandingDiameterMm;
  let fruitCohortCount = 0;
  let expandingFruitCount = 0;
  for (const t of physiology.trusses) {
    for (const f of t.fruits) {
      if (f.aborted || f.harvested) continue;
      if (f.fertilizationTT <= 0) continue;
      fruitCohortCount++;
      if (f.diameter >= minExpand) {
        const phase = derivePhase(
          f, physiology.TT,
          cultivar.cellDivisionDurationGDD,
          cultivar.cellExpansionDurationGDD,
        );
        if (EXPANSION_OR_LATER.has(phase)) expandingFruitCount++;
      }
    }
  }

  const provenance: Provenance = {
    sourceType: 'simulation',
    confidence: 'high',                              // engine deterministic per seed
    sourceRefs: [`engineMode:${ACTIVE_ENGINE_MODE}`],
    notes: `Generated by GrowthEngine for cultivar=${args.cultivarName} seed=${args.seed} day=${args.day}`,
  };

  const accumulatedGdd = physiology.TT;
  const dailyGdd = args.day > 0 ? accumulatedGdd / args.day : 12;

  return {
    schemaVersion: 'growthCalibration.v1',
    provenance,
    experimentId: args.experimentId,
    plantId: `SIM_seed${args.seed}`,
    modelVersion: args.modelVersion,
    parameterSetId: args.cultivarName,
    seed: args.seed,
    day: args.day,
    observationDate: `simulated_day_${args.day}`,
    plantAgeDays: args.day,
    thermalTime: {
      baseTemperatureC: 10,
      dailyGdd,
      accumulatedGdd,
      method: 'simple_average',
    },
    overall: {
      heightCm: state.heightCm,
      mainStemLengthCm: state.heightCm,
      mainStemDiameterMm: 0,                          // not directly available
      nodeCount: state.nodeCount,
      visibleLeafCount: allLeavesActive.length,
      expandedLeafCount: leavesExpanded.length,
      visibleTrussCount: trusses.filter(t => t.status !== 'not_visible').length,
      floweringTrussCount: trussesFlowering,
      fruitingTrussCount: trussesFruiting,
      fruitCountTotal: fruitsVisible.length,           // SSOT #40 — visible alias
      maxFruitDiameterMm: maxFruitDiamMm,
      // Iter 6 — 분리 metric
      fruitCohortCount,
      expandingFruitCount,
      laiCanopy: physiology.LAI,
    },
    phenology: {
      vegetativeStage: args.day < 10 ? 'germination' : args.day < 30 ? 'juvenile' : args.day < 90 ? 'active_growth' : 'mature',
      reproductiveStage: trussesFruiting > 0 ? 'fruit_expansion' : trussesFlowering > 0 ? 'flowering' : trusses.length > 0 ? 'truss_initiation' : 'none',
      firstVisibleTrussDay: null,
      firstFlowerOpenDay: null,
      firstFruitSetDay: null,
      firstFruitVisibleDay: null,
      firstRipeFruitDay: null,
    },
    nodes: [],
    leaves,
    trusses,
    fruits,
    qualityFlags: { missingMeasurement: false, occludedOrgans: false, imageQuality: 'good' },
  };
}

// ── Run ───────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  applyOverrideGompertz(args);  // Iter 6b — child-process Gompertz mutation
  applyOverridePhenology(args); // Iter 6c — phenology mutation
  applyOverrideCohort(args);    // Iter 6d — cohort mutation
  applyOverrideAbortion(args);  // Iter 6f — abortion mutation
  applyOverrideVisibility(args); // Iter 6h — visibility gate mutation
  applyOverrideMassFlow(args);  // Iter 6e — surplusPolicy mutation
  applyOverrideSource(args);    // Iter 8 (SSOT #108) — LUE override
  applyOverrideCanopy(args);    // Iter 8 (SSOT #108) — SLA / sinkStrengthLeaf override
  const simRoot = join(args.outRoot, args.experimentId, 'simulation', args.modelVersion);

  process.stdout.write(
    `[extract-calibration-observations] cultivar=${args.cultivar} ensemble=${args.ensemble} ` +
    `baseSeed=${args.baseSeed} days=${args.days.length} → ${simRoot}\n`,
  );

  let wrote = 0;
  for (let n = 0; n < args.ensemble; n++) {
    const seed = args.baseSeed + n;
    for (const day of args.days) {
      const dayDir = join(simRoot, `day_${day.toString().padStart(3, '0')}`);
      ensureDir(dayDir);
      try {
        const obs = buildObservation({
          experimentId: args.experimentId,
          modelVersion: args.modelVersion,
          cultivarName: args.cultivar,
          seed,
          day,
        });
        const outFile = join(dayDir, `sim_SIM_seed${seed}.json`);
        writeFileSync(outFile, JSON.stringify(obs, null, 2));
        wrote++;
      } catch (e) {
        process.stdout.write(`  ✗ seed=${seed} day=${day}: ${(e as Error).message}\n`);
      }
    }
    if ((n + 1) % 5 === 0) process.stdout.write(`  seed ${n + 1}/${args.ensemble} done\n`);
  }

  process.stdout.write(`\n[done] wrote ${wrote} observation files\n`);
}

main();
