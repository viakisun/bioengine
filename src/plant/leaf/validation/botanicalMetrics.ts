// botanicalMetrics — V9 report harness (Leaf Module v0.1).
//
// REPORT MODE only. Hard pass/fail thresholds arrive with M1 Research
// calibration pack. v0.1 emits per-metric reports with sanity-check ranges
// (literature midpoints) so calibration loops in Phase F have something to
// read.
//
// Target ranges are sanity-check, NOT absolute truth. They will be replaced
// with cultivar-specific measured ranges in M1.

import type { CompoundLeafOrgan, LeafOrganGraph } from '../LeafOrganGraph';

export type MetricStatus = 'within_range' | 'below_range' | 'above_range' | 'no_target';

export interface BotanicalMetricReport {
  metric: string;
  value: number;
  /** Sanity-check range — literature midpoint. Not absolute. */
  targetRange: [number, number] | null;
  status: MetricStatus;
  /** Provenance hint: 'estimated' / 'literature' / 'measured' etc. */
  confidence: 'estimated' | 'literature' | 'measured' | 'calibrated' | 'unknown';
  cultivar?: string;
  ageDays?: number;
  compoundLeafId?: string;
  leafletId?: string;
}

export interface BotanicalReportBundle {
  reports: BotanicalMetricReport[];
  aggregated: {
    leafCount: number;
    leafletCount: number;
    totalLeafAreaM2: number;
    meanLeafletAspect: number;
    meanRachisDroopDeg: number;
  };
  generatedAt: string;
}

// ── v0.1 sanity-check ranges (literature midpoints; replace with M1 measured) ─

const RANGE_LEAF_AREA_M2: [number, number] = [0.015, 0.040];
const RANGE_LEAFLET_ASPECT: [number, number] = [1.5, 2.5];
const RANGE_RACHIS_DROOP_DEG: [number, number] = [5, 25];
const RANGE_MATURE_LEAFLET_COUNT: [number, number] = [7, 9];

const MATURE_AGE_DAYS = 60;

export interface BotanicalHarnessOptions {
  cultivar?: string;
  confidence?: BotanicalMetricReport['confidence'];
}

/**
 * Compute and report all v0.1 botanical metrics for a LeafOrganGraph.
 *
 * Status semantics:
 *   - 'within_range': metric ∈ targetRange
 *   - 'below_range' / 'above_range': metric outside, but report only — not a fail
 *   - 'no_target': metric emitted without a target (e.g. immature leaflet count)
 */
export function computeBotanicalReports(
  graph: LeafOrganGraph,
  opts: BotanicalHarnessOptions = {},
): BotanicalReportBundle {
  const confidence: BotanicalMetricReport['confidence'] = opts.confidence ?? 'estimated';
  const reports: BotanicalMetricReport[] = [];

  let leafCount = 0;
  let leafletCount = 0;
  let totalLeafAreaM2 = 0;
  let aspectSum = 0;
  let aspectN = 0;
  let droopSum = 0;
  let droopN = 0;

  for (const compound of graph.compoundLeaves) {
    leafCount++;
    leafletCount += compound.leaflets.length;
    totalLeafAreaM2 += compound.leafAreaM2Computed;

    // Per-compound metrics
    reports.push(metric({
      metric: 'leafAreaM2',
      value: compound.leafAreaM2Computed,
      target: RANGE_LEAF_AREA_M2,
      confidence,
      cultivar: opts.cultivar,
      ageDays: compound.ageDays,
      compoundLeafId: compound.id,
    }));

    reports.push(metric({
      metric: 'rachisDroopAngleDeg',
      value: compound.rachisGuide.droopAngleDeg,
      target: RANGE_RACHIS_DROOP_DEG,
      confidence,
      cultivar: opts.cultivar,
      ageDays: compound.ageDays,
      compoundLeafId: compound.id,
    }));
    droopSum += compound.rachisGuide.droopAngleDeg;
    droopN++;

    // Mature plants only — leaflet count target range
    if (compound.ageDays >= MATURE_AGE_DAYS) {
      reports.push(metric({
        metric: 'leafletCountMature',
        value: compound.leaflets.length,
        target: RANGE_MATURE_LEAFLET_COUNT,
        confidence,
        cultivar: opts.cultivar,
        ageDays: compound.ageDays,
        compoundLeafId: compound.id,
      }));
    } else {
      reports.push({
        metric: 'leafletCount',
        value: compound.leaflets.length,
        targetRange: null,
        status: 'no_target',
        confidence,
        cultivar: opts.cultivar,
        ageDays: compound.ageDays,
        compoundLeafId: compound.id,
      });
    }

    // Per-leaflet aspect
    for (const leaflet of compound.leaflets) {
      const aspect = leaflet.maxHalfWidthM > 0
        ? leaflet.lengthM / (2 * leaflet.maxHalfWidthM)
        : 0;
      aspectSum += aspect;
      aspectN++;

      reports.push(metric({
        metric: 'leafletAspect',
        value: aspect,
        target: RANGE_LEAFLET_ASPECT,
        confidence,
        cultivar: opts.cultivar,
        ageDays: compound.ageDays,
        compoundLeafId: compound.id,
        leafletId: leaflet.id,
      }));
    }
  }

  return {
    reports,
    aggregated: {
      leafCount,
      leafletCount,
      totalLeafAreaM2,
      meanLeafletAspect: aspectN > 0 ? aspectSum / aspectN : 0,
      meanRachisDroopDeg: droopN > 0 ? droopSum / droopN : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Console-friendly summary line — useful for Playwright report capture. */
export function summarizeBotanicalReports(bundle: BotanicalReportBundle): string {
  const within = bundle.reports.filter((r) => r.status === 'within_range').length;
  const below = bundle.reports.filter((r) => r.status === 'below_range').length;
  const above = bundle.reports.filter((r) => r.status === 'above_range').length;
  const noTarget = bundle.reports.filter((r) => r.status === 'no_target').length;
  const a = bundle.aggregated;
  return (
    `[V9] leaves=${a.leafCount} leaflets=${a.leafletCount} ` +
    `areaTotal=${a.totalLeafAreaM2.toFixed(4)}m² ` +
    `aspect̄=${a.meanLeafletAspect.toFixed(2)} ` +
    `droop̄=${a.meanRachisDroopDeg.toFixed(1)}° ` +
    `| reports within/below/above/no-tgt = ${within}/${below}/${above}/${noTarget}`
  );
}

// ── Implementation ────────────────────────────────────────────────────

function metric(p: {
  metric: string;
  value: number;
  target: [number, number];
  confidence: BotanicalMetricReport['confidence'];
  cultivar?: string;
  ageDays?: number;
  compoundLeafId?: string;
  leafletId?: string;
}): BotanicalMetricReport {
  let status: MetricStatus = 'within_range';
  if (p.value < p.target[0]) status = 'below_range';
  else if (p.value > p.target[1]) status = 'above_range';
  return {
    metric: p.metric,
    value: p.value,
    targetRange: p.target,
    status,
    confidence: p.confidence,
    cultivar: p.cultivar,
    ageDays: p.ageDays,
    compoundLeafId: p.compoundLeafId,
    leafletId: p.leafletId,
  };
}

// Type alias used above for cleaner imports
export type _LeafOrganGraphRef = CompoundLeafOrgan; // (keeps tree-shake happy)
