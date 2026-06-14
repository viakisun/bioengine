// Instrument Workstation — Right Inspector Panel
//
// Module tabs (Phenotyping / Navigation / Growth / Disease·SOON) + scrolling body
// with heatmap · targets · decision rule · verify metrics · robot summary.
//
// Collapses to 0 width when uiMode === 'drive'.

import { useEffect, useState } from 'react';
import type { ScenarioSpec } from '../../scenarios/types';
import { measureAllForScenario, type MetricResult } from '../../scenarios/metrics';
import { useTwinStore } from '../../state/twinStore';
import { railRef } from '../../scene/robot/robotControlState';
import { RipenessHistogram } from '../../hud/instrument/charts/RipenessHistogram';
import { BedZoneHeatmap, type ZoneCell } from '../../hud/instrument/charts/BedZoneHeatmap';
import { KpiCard } from '../../hud/instrument/charts/KpiCard';
import { ProgressBar } from '../../hud/instrument/charts/ProgressBar';

const DOMAIN_EN: Record<ScenarioSpec['domain'], string> = {
  'autonomous-driving': 'Navigation',
  thinning: 'Thinning',
  pruning: 'Pruning',
  spray: 'Spray',
  recognition: 'Recognition',
  phenotyping: 'Growth Analysis',
};

const TASK_EN: Record<ScenarioSpec['task']['type'], string> = {
  'drive-traverse': 'Rail traverse',
  'thinning-decision': 'Thinning decision',
  'pruning-sucker': 'Sucker removal',
  'pruning-apex': 'Apex cut',
  'spray-survey': 'Pest-zone identification',
  'recognition-capture': 'Recognition capture',
  noop: 'Idle',
};

// Sequential earth-tone palette (replaces rainbow heatmap)
//   low (ventilated) → green-ish charcoal
//   mid (caution)    → amber-clay
//   high (dense)     → muted red
function heatColor(v: number): string {
  if (v < 0.38) return '#2f6b47';
  if (v < 0.68) return '#8f7026';
  return '#a8463a';
}

interface TaskPanelProps {
  scenario: ScenarioSpec;
}

export function TaskPanel({ scenario }: TaskPanelProps) {
  const uiMode = useTwinStore((s) => s.uiMode);
  const drive = uiMode === 'drive';

  // W1.f verify metric re-measure on day change
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const [metrics, setMetrics] = useState<MetricResult[]>([]);
  useEffect(() => {
    setMetrics(measureAllForScenario(scenario, minute));
  }, [scenario, minute]);

  // Active module tab (phenotyping default if domain matches, else Navigation)
  const initialTab =
    scenario.domain === 'phenotyping' ? 'phenotyping'
    : scenario.domain === 'autonomous-driving' ? 'navigation'
    : 'phenotyping';
  const [tab, setTab] = useState<'phenotyping' | 'navigation' | 'growth'>(initialTab);

  // Robot speed/rail snapshot for ROBOT card
  const robotSpeed = useTwinStore((s) => s.robot.speedMps);
  // We can't safely subscribe to railRef (it's a ref), so we just snapshot on render.
  // Slight staleness is fine — for live readout user opens GimbalView / RobotTransport.
  const railX = railRef.current;

  const totalPass = metrics.filter((m) => m.passed === true).length;
  const totalFail = metrics.filter((m) => m.passed === false).length;
  const titleEN = DOMAIN_EN[scenario.domain];

  // Heatmap grid — same deterministic-ish source as before, but earth-tones.
  const heatGrid: number[] = [];
  for (let i = 0; i < 32; i++) {
    const density = 0.4 + 0.6 * Math.sin(i * 0.7 + scenario.crop.day * 0.05) * 0.5 + 0.3;
    heatGrid.push(Math.max(0, Math.min(1, density)));
  }

  return (
    <aside style={{
      ...wrapS,
      width: drive ? 0 : 344,
      borderLeft: drive ? '1px solid transparent' : '1px solid var(--iw-line-1)',
      opacity: drive ? 0 : 1,
      pointerEvents: drive ? 'none' : 'auto',
    }}>
      <div style={{ width: 344, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Tab strip */}
        <div style={tabStripS}>
          <TabBtn label="Phenotyping" active={tab === 'phenotyping'} onClick={() => setTab('phenotyping')} />
          <TabBtn label="Navigation" active={tab === 'navigation'} onClick={() => setTab('navigation')} />
          <TabBtn label="Growth" active={tab === 'growth'} onClick={() => setTab('growth')} />
          <TabBtn label="Disease" disabled badge="SOON" active={false} onClick={() => {}} />
        </div>

        <div style={bodyS}>
          {/* Header */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{titleEN}</div>
            <div className="iw-mono" style={{ fontSize: 11, color: 'var(--iw-fg-mute)', marginTop: 3 }}>
              {TASK_EN[scenario.task.type]} · Day {scenario.crop.day}
            </div>
          </div>

          {/* Phenotyping live survey results (replaces mock heatmap for phenotyping domain) */}
          {scenario.domain === 'phenotyping' && tab === 'phenotyping' ? (
            <PhenotypingLiveSection />
          ) : (scenario.task.type === 'spray-survey' || scenario.domain === 'phenotyping') && (
            <>
              <SubHead label="LEAF DENSITY ZONE" trailing="8×4 · mock" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, marginBottom: 9 }}>
                {heatGrid.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 3,
                      background: heatColor(v),
                      opacity: 0.55 + v * 0.45,
                    }}
                    title={`zone-${i}: ${v.toFixed(2)}`}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--iw-font-mono)', fontSize: 9, color: 'var(--iw-fg-dim)', marginBottom: 20 }}>
                <Legend color="#2f6b47" label="ventilated" />
                <Legend color="#8f7026" label="caution" />
                <Legend color="#a8463a" label="dense · pest-first" />
              </div>
            </>
          )}

          {/* Targets */}
          {scenario.task.targets && (
            <>
              <SubHead label="TARGETS" />
              <button style={selectorBtnS}>
                <span>{scenario.task.targets}</span>
                <span style={{ color: 'var(--iw-fg-mute)' }}>▾</span>
              </button>
            </>
          )}

          {/* Decision rule */}
          {scenario.task.rule && (
            <>
              <SubHead label="DECISION RULE" />
              <div className="iw-mono" style={ruleBoxS}>
                {scenario.task.rule.split(',').map((part, i) => (
                  <div key={i}>
                    {part.trim().replace(/^([a-z-]+?-bed)/, (m) => `__BED_${m}__`).split(/__BED_|__/).map((tok, j) =>
                      tok.endsWith('-bed') ? (
                        <span key={j} style={{ color: 'var(--iw-accent)' }}>{tok}</span>
                      ) : (
                        <span key={j}>{tok}</span>
                      )
                    )}{i < (scenario.task.rule!.split(',').length - 1) && ','}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Decision triggers */}
          {scenario.task.decisionTriggers && scenario.task.decisionTriggers.length > 0 && (
            <>
              <SubHead label="TRIGGERS" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 20 }}>
                {scenario.task.decisionTriggers.map((t) => (
                  <span key={t} style={triggerPillS}>{t}</span>
                ))}
              </div>
            </>
          )}

          {/* Verify */}
          <SubHead
            label={`VERIFY · ${metrics.length}`}
            trailing={
              <>
                {totalPass > 0 && <span style={{ color: 'var(--iw-ok)' }}>{totalPass} PASS</span>}
                {totalFail > 0 && (
                  <>
                    {totalPass > 0 && <span style={{ color: 'var(--iw-fg-mute)' }}> · </span>}
                    <span style={{ color: 'var(--iw-err)' }}>{totalFail} FAIL</span>
                  </>
                )}
                {totalPass === 0 && totalFail === 0 && <span style={{ color: 'var(--iw-fg-mute)' }}>—</span>}
              </>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 22 }}>
            {metrics.map((m, i) => {
              const c = scenario.verify.successCriteria[i];
              const bound = c.min !== undefined ? `≥ ${c.min}` : c.max !== undefined ? `≤ ${c.max}` : '—';
              const passColor =
                m.passed === true ? 'var(--iw-ok)'
                : m.passed === false ? 'var(--iw-err)'
                : 'var(--iw-fg-mute)';
              return (
                <div key={i} className="iw-mono" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                  background: 'var(--iw-bg-2)',
                  border: '1px solid var(--iw-line-1)',
                  borderRadius: 6,
                  padding: '9px 11px',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--iw-fg-mid)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: passColor }} />
                    {c.metric}
                  </span>
                  <span style={{ color: 'var(--iw-fg-mute)' }}>
                    {m.value !== null
                      ? typeof m.value === 'number'
                        ? m.value < 10 ? m.value.toFixed(2) : m.value.toFixed(0)
                        : String(m.value)
                      : '—'}{' '}
                    <span style={{ color: 'var(--iw-fg-dim)' }}>{bound}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Robot summary (merged) */}
          <SubHead label="ROBOT" />
          <div style={robotCardS}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--iw-fg-hi)', fontWeight: 500 }}>via-agv-6dof-v1</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--iw-ok)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--iw-ok)' }} />
                online
              </span>
            </div>
            <RobotRow k="sensor" v="Head RGB · 60° front" />
            <RobotRow k="speed" v={`${robotSpeed.toFixed(2)} m/s`} />
            <RobotRow k="rail-x" v={`${railX >= 0 ? '+' : ''}${railX.toFixed(2)} m`} />
          </div>

          <div style={footerNoteS}>
            W1.e mvp measure — some metrics from GrowthEngine, others estimated from scenario metadata.
          </div>
        </div>
      </div>
    </aside>
  );
}

function PhenotypingLiveSection() {
  const sv = useTwinStore((s) => s.phenotypingSurvey);
  const completed = Object.values(sv.zones);

  // Aggregate totals across captured zones
  const totals = aggregateTotals(sv.zones);
  const progress = sv.totalZones === 0 ? 0 : sv.completedZones / sv.totalZones;
  const elapsedSec = sv.elapsedMs / 1000;
  const eta = sv.completedZones > 0 && sv.totalZones > sv.completedZones
    ? Math.round(elapsedSec / sv.completedZones * (sv.totalZones - sv.completedZones))
    : null;

  if (sv.status === 'idle' && completed.length === 0) {
    return (
      <div style={{ marginBottom: 22 }}>
        <SubHead label="PHENOTYPING SURVEY" trailing="idle" />
        <div style={{
          padding: '14px 12px',
          background: 'var(--iw-bg-2)',
          border: '1px dashed var(--iw-line-2)',
          borderRadius: 6,
          color: 'var(--iw-fg-mute)',
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          Press <span style={{ color: 'var(--iw-accent)', fontWeight: 600 }}>START SURVEY</span> in the
          robot transport dock to begin zone-by-zone fruit recognition. Results appear here in real time.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 22 }}>
      {/* Progress */}
      <SubHead
        label="SURVEY PROGRESS"
        trailing={
          <span>
            {sv.completedZones}/{sv.totalZones} · {sv.status}
            {eta != null && <span style={{ color: 'var(--iw-fg-faint)' }}> · ETA {eta}s</span>}
          </span>
        }
      />
      <div style={{ marginBottom: 14 }}>
        <ProgressBar value={progress} />
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        <KpiCard label="Fruits (raw)" value={totals.fruitCount} />
        <KpiCard
          label="Weighted"
          value={totals.weightedCount.toFixed(1)}
          color="var(--iw-accent)"
        />
        <KpiCard
          label="Coverage"
          value={(totals.coverage * 100).toFixed(0)}
          unit="%"
          color={totals.coverage >= 0.85 ? 'var(--iw-ok)' : totals.coverage >= 0.6 ? 'var(--iw-warn)' : 'var(--iw-err)'}
        />
        <KpiCard
          label="Avg conf"
          value={totals.avgConfidence.toFixed(2)}
        />
      </div>

      {/* Ripeness histogram */}
      <SubHead label="RIPENESS DISTRIBUTION" />
      <div style={{ marginBottom: 14 }}>
        <RipenessHistogram bins={totals.bins} weightedBins={totals.weightedBins} height={110} />
      </div>

      {/* Bed × Zone heatmap */}
      <SubHead label="BED × ZONE" />
      <div style={{ marginBottom: 14 }}>
        <BedZoneHeatmap
          zones={completed
            .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
            .map((z, i): ZoneCell => ({
              zoneId: Object.keys(sv.zones).find((k) => sv.zones[k] === z) ?? `z-${i}`,
              bedId: z.targetBedId,
              index: i,
              bedSide: z.bedSide,
              weightedCount: z.weightedCount,
              bins: z.bins,
            }))}
        />
      </div>

      {/* Last zone card */}
      {sv.currentZoneId && sv.zones[sv.currentZoneId] && (
        <>
          <SubHead label="LAST CAPTURE" trailing={sv.currentZoneId} />
          <div style={{
            background: 'var(--iw-bg-2)',
            border: '1px solid var(--iw-line-1)',
            borderRadius: 6,
            padding: '10px 11px',
            fontFamily: 'var(--iw-font-mono)',
            fontSize: 11,
          }}>
            {(() => {
              const z = sv.zones[sv.currentZoneId];
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--iw-fg-mid)', margin: '3px 0' }}>
                    <span style={{ color: 'var(--iw-fg-mute)' }}>bed</span>
                    {z.targetBedId} · {z.bedSide}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--iw-fg-mid)', margin: '3px 0' }}>
                    <span style={{ color: 'var(--iw-fg-mute)' }}>fruits</span>
                    {z.fruitCount} <span style={{ color: 'var(--iw-fg-faint)' }}>/ {z.expectedFruitCount} expected</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--iw-fg-mid)', margin: '3px 0' }}>
                    <span style={{ color: 'var(--iw-fg-mute)' }}>weighted</span>
                    {z.weightedCount.toFixed(2)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--iw-fg-mid)', margin: '3px 0' }}>
                    <span style={{ color: 'var(--iw-fg-mute)' }}>coverage</span>
                    {(z.coverage * 100).toFixed(0)}%
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

function aggregateTotals(zones: Record<string, {
  fruitCount: number;
  weightedCount: number;
  expectedFruitCount: number;
  coverage: number;
  avgConfidence: number;
  bins: Record<'green' | 'breaker' | 'turning' | 'pink' | 'red', number>;
  weightedBins: Record<'green' | 'breaker' | 'turning' | 'pink' | 'red', number>;
}>) {
  const arr = Object.values(zones);
  const totals = {
    fruitCount: 0,
    weightedCount: 0,
    coverage: 0,
    avgConfidence: 0,
    bins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 },
    weightedBins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 },
  };
  for (const z of arr) {
    totals.fruitCount += z.fruitCount;
    totals.weightedCount += z.weightedCount;
    (Object.keys(totals.bins) as Array<keyof typeof totals.bins>).forEach((b) => {
      totals.bins[b] += z.bins[b] ?? 0;
      totals.weightedBins[b] += z.weightedBins[b] ?? 0;
    });
  }
  totals.coverage = arr.length === 0 ? 0 : arr.reduce((a, z) => a + z.coverage, 0) / arr.length;
  totals.avgConfidence = arr.length === 0 ? 0 : arr.reduce((a, z) => a + z.avgConfidence, 0) / arr.length;
  return totals;
}

function TabBtn({ label, active, disabled, badge, onClick }: {
  label: string; active: boolean; disabled?: boolean; badge?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: 11,
      fontWeight: active ? 600 : 500,
      color: disabled ? 'var(--iw-fg-ghost)' : active ? 'var(--iw-fg-hi)' : 'var(--iw-fg-mute)',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid var(--iw-accent)' : '2px solid transparent',
      padding: '7px 9px 9px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--iw-font-ui)',
    }}>
      {label}
      {badge && (
        <span className="iw-mono" style={{
          fontSize: 8,
          border: '1px solid var(--iw-line-2)',
          borderRadius: 3,
          padding: '0 3px',
          color: 'var(--iw-fg-faint)',
        }}>{badge}</span>
      )}
    </button>
  );
}

function SubHead({ label, trailing }: { label: string; trailing?: React.ReactNode }) {
  return (
    <div className="iw-mono" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      fontSize: 10,
      letterSpacing: '0.1em',
      color: 'var(--iw-fg-mute)',
      marginBottom: 9,
      marginTop: 0,
    }}>
      <span>{label}</span>
      {trailing && <span style={{ color: 'var(--iw-fg-faint)' }}>{trailing}</span>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

function RobotRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="iw-mono" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--iw-fg-dim)', margin: '4px 0' }}>
      <span style={{ color: 'var(--iw-fg-mute)' }}>{k}</span>
      {v}
    </div>
  );
}

const wrapS: React.CSSProperties = {
  position: 'fixed',
  top: 46,
  right: 0,
  bottom: 54,
  background: 'var(--iw-bg-2)',
  overflow: 'hidden',
  transition: 'width 0.28s ease, opacity 0.2s ease',
  zIndex: 1000,
  fontFamily: 'var(--iw-font-ui)',
  color: 'var(--iw-fg-hi)',
};

const tabStripS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '8px 10px 0',
  borderBottom: '1px solid var(--iw-line-1)',
};

const bodyS: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 14,
};

const selectorBtnS: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 12,
  color: 'var(--iw-fg-hi)',
  background: 'var(--iw-bg-3)',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 6,
  padding: '9px 11px',
  cursor: 'pointer',
  marginBottom: 20,
};

const ruleBoxS: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--iw-fg-mid)',
  background: 'var(--iw-bg-2)',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 6,
  padding: '10px 11px',
  lineHeight: 1.6,
  marginBottom: 20,
};

const triggerPillS: React.CSSProperties = {
  padding: '2px 6px',
  background: 'var(--iw-accent-soft)',
  border: '1px solid var(--iw-accent-line)',
  borderRadius: 999,
  fontSize: 10,
  color: 'var(--iw-accent)',
  fontFamily: 'var(--iw-font-mono)',
};

const robotCardS: React.CSSProperties = {
  background: 'var(--iw-bg-2)',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 8,
  padding: 11,
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 11,
};

const footerNoteS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 9,
  color: 'var(--iw-fg-faint)',
  lineHeight: 1.6,
  marginTop: 16,
  paddingTop: 14,
  borderTop: '1px solid var(--iw-line-1)',
};
