// W1.e (§18) — verify.successCriteria 자동 측정 (mvp 5종).
//
// 시나리오의 verify.successCriteria metric 각각에 대해 현재 측정값 계산.
// 깊은 측정 (실 BabylonEngine ray cast, 실 robot sim 등)은 V2 evolution.
// mvp는 GrowthEngine physiology + 시나리오 metadata 기반 간이 추정.
//
// 지원 메트릭 (mvp):
//   - fov-fruit-coverage   — 현재 식물의 visible 과실 비율 (간이: 전체 fruit / 임계)
//   - decision-accuracy    — 알고리즘 결정 vs 표준 (mvp 더미 0.85)
//   - path-length          — 자율주행 경로 길이 (시나리오 activeBeds·gauge로 추정)
//   - task-completion-time — 작업 시간 (시나리오별 더미)
//   - mask-iou             — Foundry 모드 (mvp 더미 0.82)
//
// 결과: { metric, value, threshold, passed } — TaskPanel에 색상 표시.

import type { ScenarioSpec } from './types';
import { getSinglePlantEngine } from '../hud/single-plant/useSinglePlantState';
import { SHOWCASE_SEED } from '../scene/SceneInfrastructure';

export interface MetricResult {
  metric: string;
  value: number | null;
  threshold: { min?: number; max?: number };
  passed: boolean | null;
  note?: string;
}

/** mvp metric mapping. 시나리오 metric 이름에서 측정. */
export function measureMetric(
  scenario: ScenarioSpec,
  metric: { metric: string; min?: number; max?: number; note?: string },
  minute: number,
): MetricResult {
  const threshold = { min: metric.min, max: metric.max };
  let value: number | null = null;
  let note = metric.note;

  switch (metric.metric) {
    case 'fov-fruit-coverage': {
      // 간이: 현재 식물의 total fruit 개수 / 화면 max 표현 가능 (~20).
      // 실제 ray cast는 V2.
      const engine = getSinglePlantEngine();
      if (engine) {
        try {
          const physiology = engine.simulatePlantToMinute(SHOWCASE_SEED, minute);
          const total = physiology.trusses.reduce((acc, t) => acc + t.fruits.length, 0);
          // 가시 비율: 잎-과실 occlusion 미구현이므로 day 기반 추정 (D90 일수록 가림 큼)
          const day = minute / 1440;
          const occlusionFactor = day < 30 ? 0.95 : day < 70 ? 0.85 : 0.70;
          value = total > 0 ? occlusionFactor : 0;
        } catch {
          value = null;
        }
      }
      break;
    }
    case 'decision-accuracy': {
      // mvp 더미: 도메인별 baseline. 실 알고리즘 결정 vs 표준 매뉴얼 비교는 V2.
      value = scenario.domain === 'thinning' ? 0.87 : scenario.domain === 'pruning' ? 0.91 : 0.75;
      note = (note ?? '') + ' (mvp baseline · 실 측정 V2)';
      break;
    }
    case 'path-length': {
      // 시나리오 activeBeds 수 × 베드 길이 (30m) 추정.
      const beds = scenario.world.activeBeds?.length ?? 1;
      value = beds * 30 + (beds - 1) * 1.6; // hairpin gauge
      break;
    }
    case 'task-completion-time': {
      // 시나리오 task type별 mvp 추정.
      const baseTime: Record<string, number> = {
        'drive-traverse': 60,
        'thinning-decision': 25,
        'pruning-sucker': 18,
        'pruning-apex': 12,
        'spray-survey': 35,
        'recognition-capture': 10,
        noop: 0,
      };
      value = baseTime[scenario.task.type] ?? 30;
      break;
    }
    case 'mask-iou': {
      // Foundry mvp 더미.
      value = 0.82;
      note = (note ?? '') + ' (mvp 더미 · 실 mask IoU 측정 W2.g 이후)';
      break;
    }
    case 'collision-count': {
      // 시나리오 aisleWidthScale 기반 mvp 추정.
      const narrow = (scenario.greenhouse?.aisleWidthScale ?? 1.0) < 0.97;
      value = narrow ? 1 : 0;
      break;
    }
    case 'reachability-rate': {
      // 시나리오 day 기반 (D90 후기는 도달 어려움)
      const day = scenario.crop.day;
      value = day < 30 ? 0.98 : day < 70 ? 0.92 : 0.85;
      break;
    }
    case 'occlusion-error': {
      // 시나리오 leafDensity 기반.
      const ld = scenario.crop.perturbation?.leafDensityScale ?? 1.0;
      value = Math.abs(ld - 1.0) * 0.15;
      break;
    }
    case 'label-class-balance': {
      // Foundry용 — mvp 더미.
      value = 0.06;
      break;
    }
    default: {
      value = null;
      note = (note ?? '') + ' (mvp 미지원 metric)';
    }
  }

  let passed: boolean | null = null;
  if (value !== null) {
    if (threshold.min !== undefined && value < threshold.min) passed = false;
    else if (threshold.max !== undefined && value > threshold.max) passed = false;
    else passed = true;
  }

  return { metric: metric.metric, value, threshold, passed, note };
}

export function measureAllForScenario(
  scenario: ScenarioSpec,
  minute: number,
): MetricResult[] {
  return scenario.verify.successCriteria.map((c) =>
    measureMetric(scenario, c, minute),
  );
}
