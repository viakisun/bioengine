// events.ts — derive timeline event markers from the showcase cultivar's
// phenology parameters. The GrowthEngine state machine is GDD-driven; for
// the marker overlay we project predicted event days using the cultivar's
// GDD constants and a greenhouse-typical thermal average. This is a
// best-effort projection — it does not require re-running the simulation.
//
// As the user scrubs, the live PlantPhysiologyState may reveal that an
// event occurred slightly earlier or later. Phase E+ may replace this
// projection with a recorded phenology trace from the engine.

import type { Cultivar } from '@farmsim/tomato-engine';

export type EventType = 'truss-emerge' | 'flowering' | 'fruit-set' | 'ripening' | 'harvest';

export interface TimelineEvent {
  day: number;
  type: EventType;
  label: string;
  trussIndex?: number;
}

/** Marker color per directive 7.3절. */
export const EVENT_COLOR: Record<EventType, string> = {
  'truss-emerge': '#16a34a',   // 초록
  flowering:      '#eab308',   // 노랑
  'fruit-set':    '#84cc16',   // 연두
  ripening:       '#f97316',   // 주황
  harvest:        '#dc2626',   // 빨강
};

export const EVENT_LABEL: Record<EventType, string> = {
  'truss-emerge': 'truss emergence',
  flowering:      'flowering',
  'fruit-set':    'fruit set',
  ripening:       'ripening',
  harvest:        'harvest',
};

// Greenhouse-typical: T_avg ≈ 23°C, T_base = 10°C → ~13 GDD/day.
// Tracks roughly what stepMinutely accumulates under DEFAULT_CLIMATE.
const GDD_PER_DAY = 13;

/** Project event days from cultivar phenology over [0, totalDays]. */
export function buildSinglePlantEvents(cultivar: Cultivar, totalDays = 120): TimelineEvent[] {
  if (!cultivar) return [];

  const events: TimelineEvent[] = [];
  const trussIntervalDays = cultivar.GDD_per_truss / GDD_PER_DAY;
  const firstFlowerDay = cultivar.GDD_to_first_flower / GDD_PER_DAY;
  const flowerToRedDays = cultivar.GDD_flower_to_red / GDD_PER_DAY;

  // Truss 0 emerges around the first-flower threshold. Subsequent trusses
  // follow at GDD_per_truss intervals. Each truss bears: emerge → flower
  // (next phytomer's emergence) → fruit set (a few days later) → ripening
  // (~flower + flower_to_red) → harvest (a few days after first red).
  let ti = 0;
  let emergeDay = firstFlowerDay - 3; // truss bud visible ~3 days before flower
  while (emergeDay <= totalDays && ti < 30) {
    const floweringDay = emergeDay + 3;
    const fruitSetDay = floweringDay + 5;
    const ripeningDay = floweringDay + flowerToRedDays;
    const harvestDay = ripeningDay + 4;

    const push = (day: number, type: EventType) => {
      if (day >= 0 && day <= totalDays) {
        events.push({ day: Math.round(day), type, label: `T${ti + 1} ${EVENT_LABEL[type]}`, trussIndex: ti });
      }
    };
    push(emergeDay, 'truss-emerge');
    push(floweringDay, 'flowering');
    push(fruitSetDay, 'fruit-set');
    push(ripeningDay, 'ripening');
    push(harvestDay, 'harvest');

    ti += 1;
    emergeDay += trussIntervalDays;
  }

  events.sort((a, b) => a.day - b.day);
  return events;
}
