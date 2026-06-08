// D1 + W1.f (RFP §17·§18) — TaskPanel.
//
// Workbench 우측 패널 — 활성 시나리오의 작업 정보 + W1.e 자동 측정 메트릭 현재값.

import { useEffect, useState } from 'react';
import type { ScenarioSpec } from '../../scenarios/types';
import { measureAllForScenario, type MetricResult } from '../../scenarios/metrics';
import { useTwinStore } from '../../state/twinStore';

const DOMAIN_KO: Record<ScenarioSpec['domain'], string> = {
  'autonomous-driving': '자율주행',
  thinning: '적과 (Thinning)',
  pruning: '적심 (Pruning)',
  spray: '방제 (Spray)',
  recognition: '인식 (Recognition)',
  phenotyping: '생육 분석 (Phenotyping)',
};

const TASK_KO: Record<ScenarioSpec['task']['type'], string> = {
  'drive-traverse': '레일 주행',
  'thinning-decision': '적과 의사결정',
  'pruning-sucker': '곁순 제거',
  'pruning-apex': '생장점 절단',
  'spray-survey': '방제 zone 식별',
  'recognition-capture': '인식 캡처',
  noop: '대기',
};

interface TaskPanelProps {
  scenario: ScenarioSpec;
}

export function TaskPanel({ scenario }: TaskPanelProps) {
  const stage =
    scenario.crop.day < 30 ? '초기' : scenario.crop.day < 70 ? '중기' : '후기';

  // W1.f — verify metric 자동 측정 + 현재 day 변화 시 재측정.
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const [metrics, setMetrics] = useState<MetricResult[]>([]);
  useEffect(() => {
    setMetrics(measureAllForScenario(scenario, minute));
  }, [scenario, minute]);

  const totalPass = metrics.filter((m) => m.passed === true).length;
  const totalFail = metrics.filter((m) => m.passed === false).length;

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        right: 12,
        width: 280,
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        padding: 14,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        zIndex: 999,
        color: 'var(--p-fg, #ddd)',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--p-fg-dim, #888)',
          marginBottom: 6,
        }}
      >
        Task Panel
      </div>

      {/* Domain + stage */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--p-fg, #ddd)' }}>
          {DOMAIN_KO[scenario.domain]}
        </div>
        <div style={{ fontSize: 11, color: 'var(--p-fg-muted, #aaa)', marginTop: 2 }}>
          Day {scenario.crop.day} · {stage} 생육
        </div>
      </div>

      {/* Task */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 10,
            color: 'var(--p-fg-dim, #888)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 2,
          }}
        >
          Task
        </div>
        <div style={{ fontWeight: 500 }}>{TASK_KO[scenario.task.type]}</div>
        {scenario.task.speedMps > 0 && (
          <div className="p-mono" style={{ fontSize: 11, color: 'var(--p-fg-muted, #aaa)' }}>
            speed: {scenario.task.speedMps} m/s
          </div>
        )}
      </div>

      {/* W2.c — spray task type 시 leafDensity zone mini-heatmap (cuttable mvp). */}
      {scenario.task.type === 'spray-survey' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Leaf Density Zone (mock)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
            {Array.from({ length: 32 }, (_, i) => {
              const density = 0.4 + 0.6 * Math.sin(i * 0.7 + scenario.crop.day * 0.05) * 0.5 + 0.3;
              const clamped = Math.max(0, Math.min(1, density));
              const hue = 120 - clamped * 120;
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1',
                    background: `hsl(${hue}, 70%, ${30 + clamped * 30}%)`,
                    borderRadius: 2,
                  }}
                  title={`zone-${i}: density=${clamped.toFixed(2)}`}
                />
              );
            })}
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--p-fg-muted, #aaa)',
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
              통풍 양호
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
              주의
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
              고밀도 (방제 우선)
            </span>
          </div>
        </div>
      )}

      {/* Targets */}
      {scenario.task.targets && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--p-fg-dim, #888)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 2,
            }}
          >
            Targets (filter)
          </div>
          <div
            className="p-mono"
            style={{
              fontSize: 11,
              padding: '4px 8px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--p-border, #333)',
              borderRadius: 4,
              wordBreak: 'break-word',
            }}
          >
            {scenario.task.targets}
          </div>
        </div>
      )}

      {/* Rule */}
      {scenario.task.rule && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--p-fg-dim, #888)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 2,
            }}
          >
            Rule (의사결정)
          </div>
          <div style={{ fontSize: 11, color: 'var(--p-fg-muted, #ccc)' }}>{scenario.task.rule}</div>
        </div>
      )}

      {/* Decision triggers */}
      {scenario.task.decisionTriggers && scenario.task.decisionTriggers.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--p-fg-dim, #888)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 4,
            }}
          >
            Decision Triggers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {scenario.task.decisionTriggers.map((t) => (
              <span
                key={t}
                style={{
                  padding: '2px 6px',
                  background: 'rgba(64,128,208,0.15)',
                  border: '1px solid rgba(64,128,208,0.4)',
                  borderRadius: 999,
                  fontSize: 10,
                  color: 'rgb(140,180,240)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verify metrics — W1.e·f 자동 측정 + PASS/FAIL */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--p-fg-dim, #888)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 4,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Verify ({metrics.length})</span>
          <span>
            <span style={{ color: 'rgb(80,200,120)' }}>{totalPass} PASS</span>
            {totalFail > 0 && (
              <>
                {' · '}
                <span style={{ color: 'rgb(220,80,80)' }}>{totalFail} FAIL</span>
              </>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {metrics.map((m, i) => {
            const c = scenario.verify.successCriteria[i];
            const bound = c.min !== undefined ? `≥ ${c.min}` : c.max !== undefined ? `≤ ${c.max}` : '—';
            const passColor =
              m.passed === true
                ? 'rgb(80,200,120)'
                : m.passed === false
                ? 'rgb(220,80,80)'
                : 'var(--p-fg-dim, #888)';
            const passBg =
              m.passed === true
                ? 'rgba(80,200,120,0.06)'
                : m.passed === false
                ? 'rgba(220,80,80,0.08)'
                : 'rgba(255,255,255,0.02)';
            return (
              <div
                key={i}
                className="p-mono"
                style={{
                  fontSize: 10,
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px 50px 16px',
                  gap: 4,
                  alignItems: 'center',
                  padding: '4px 6px',
                  background: passBg,
                  borderRadius: 3,
                  borderLeft: `2px solid ${passColor}`,
                }}
                title={m.note ?? c.note}
              >
                <span style={{ color: 'var(--p-fg-muted, #aaa)' }}>{c.metric}</span>
                <span
                  style={{
                    color: passColor,
                    fontWeight: 600,
                    textAlign: 'right',
                  }}
                >
                  {m.value !== null
                    ? typeof m.value === 'number'
                      ? m.value < 10
                        ? m.value.toFixed(2)
                        : m.value.toFixed(0)
                      : String(m.value)
                    : '—'}
                </span>
                <span style={{ color: 'var(--p-fg-dim, #888)', textAlign: 'right' }}>
                  {bound}
                </span>
                <span style={{ color: passColor, fontWeight: 700, textAlign: 'center' }}>
                  {m.passed === true ? '✓' : m.passed === false ? '✗' : '—'}
                </span>
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            color: 'var(--p-fg-dim, #888)',
            fontStyle: 'italic',
          }}
        >
          W1.e mvp 측정 — 일부 메트릭은 GrowthEngine 실측, 일부는 시나리오 metadata 기반 추정.
        </div>
      </div>
    </div>
  );
}
