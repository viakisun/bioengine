// S6.a~g + D8 (RFP §15·§17) — Twin Mode page.
//
// docs/proposal/05-wire-protocol.md (WS 토픽) + §3.6 와이어프레임 §3.3.6.
// D8: 진입 시 Picker → 시나리오 선택 → scenario.world.activeBeds 기반 zone 강조.

import { useEffect, useRef, useState } from 'react';
import { ValueChip } from '../../hud/ValueChip';
import { MODES } from '../registry';
import { Picker } from '../scenarios/Picker';
import type { ScenarioSpec } from '../../scenarios/types';
import {
  getBus,
  startSimulation,
  stopSimulation,
  type RobotState,
  type AnomalyEvent,
} from '../../../packages/phytosim-api/inAppBus';

interface TwinProps {
  onCancel?: () => void;
}

interface Zone {
  bed: number;
  day: number;
  /** 0~1, 작업 가능. */
  workable: number;
  /** 0~1, 잎 가림. */
  occlusion: number;
  /** 0~1, 잎 밀도. */
  density: number;
  /** anomaly 표시. */
  anomaly?: boolean;
}

function genZones(): Zone[] {
  // mvp: 13 베드 fake 데이터.
  const out: Zone[] = [];
  for (let bed = 1; bed <= 13; bed++) {
    out.push({
      bed,
      day: 60 + Math.round((bed * 7) % 40),
      workable: 0.4 + ((bed * 31) % 60) / 100,
      occlusion: 0.2 + ((bed * 17) % 50) / 100,
      density: 0.5 + ((bed * 23) % 40) / 100,
      anomaly: bed === 5 || bed === 11,
    });
  }
  return out;
}

const ZONES = genZones();

const KPIS = [
  { key: 'scenarios', label: '활성 시나리오 카탈로그', value: '20', threshold: '≥20', pass: true },
  { key: 'passRate', label: '시나리오 검증 통과율', value: '—', threshold: '≥90%', pass: null },
  { key: 'uptime', label: 'Twin 임베드 uptime', value: '99.4%', threshold: '≥99%', pass: true },
  { key: 'foundry', label: 'Foundry 처리량 (mock)', value: '12.8k/d', threshold: '≥10k/d', pass: true },
  { key: 'refTruth', label: 'Reference Truth 통과 변수', value: '—', threshold: '100%', pass: null },
  { key: 'consortium', label: '컨소시엄 환류 사례', value: '—', threshold: '≥5/Q', pass: null },
  { key: 'onboarding', label: '신규 사용자 5분 도달율', value: '—', threshold: '≥80%', pass: null },
  { key: 'schema', label: '메시지 스키마 안정성', value: 'v1', threshold: '6개월', pass: true },
] as const;

export function Twin({ onCancel }: TwinProps) {
  // D8 (RFP §17) — Picker 진입 + 시나리오 기반 활성 zone.
  const [active, setActive] = useState<ScenarioSpec | null>(null);
  const [showPicker, setShowPicker] = useState(true);

  const valueProps = MODES.twin.valueProps ?? [];
  // mvp WireStatus — fake latency tick.
  const [latency, setLatency] = useState(142);
  const [seq, setSeq] = useState(19384);
  const [connected, setConnected] = useState(true);

  // W3.a~e — in-app pub/sub로 실 메시지 흐름.
  const [robotX, setRobotX] = useState(0);
  const trailRef = useRef<number[]>([]);
  const [recentEvents, setRecentEvents] = useState<AnomalyEvent[]>([]);
  const [msgCount, setMsgCount] = useState({ world: 0, robot: 0, plant: 0, anomaly: 0 });

  useEffect(() => {
    if (!active) return;
    const bus = getBus();
    startSimulation({
      scenarioId: active.id,
      activeBeds: active.world.activeBeds,
      speedMps: active.task.speedMps ?? 0.2,
    });

    const unsubs: Array<() => void> = [];
    unsubs.push(
      bus.subscribe<unknown>('/world/state', (msg) => {
        setMsgCount((p) => ({ ...p, world: msg.seq }));
        // Latency: 실제는 클라이언트↔서버 RTT. mvp는 ts 기반 시뮬.
        const sentMs = new Date(msg.ts).getTime();
        const latencyMs = Math.max(50, Date.now() - sentMs + Math.round(Math.random() * 30));
        setLatency(latencyMs);
        setSeq(msg.seq);
        setConnected(true);
      }),
    );
    unsubs.push(
      bus.subscribe<RobotState>('/robot/state', (msg) => {
        setMsgCount((p) => ({ ...p, robot: msg.seq }));
        const x = msg.payload.x;
        setRobotX(x);
        trailRef.current.push(x);
        if (trailRef.current.length > 50) trailRef.current.shift();
      }),
    );
    unsubs.push(
      bus.subscribe<unknown>('/plant/state', (msg) => {
        setMsgCount((p) => ({ ...p, plant: msg.seq }));
      }),
    );
    unsubs.push(
      bus.subscribe<AnomalyEvent>('/anomaly/event', (msg) => {
        setMsgCount((p) => ({ ...p, anomaly: msg.seq }));
        setRecentEvents((prev) => [msg.payload, ...prev].slice(0, 5));
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
      stopSimulation();
    };
  }, [active]);

  function handleSelectScenario(s: ScenarioSpec) {
    setActive(s);
    setShowPicker(false);
  }

  if (showPicker) {
    return (
      <Picker
        onSelect={handleSelectScenario}
        onCancel={active ? () => setShowPicker(false) : onCancel}
        modeFilter="Twin"
      />
    );
  }

  // D9·D10 — 시나리오의 activeBeds 강조
  const activeBedsSet = new Set<number>(active?.world.activeBeds ?? []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--p-bg, #111)',
        color: 'var(--p-fg, #ddd)',
        overflow: 'auto',
        padding: '32px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header — WireStatus + ValueChip */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
              color: 'var(--p-fg-dim, #888)',
              marginBottom: 6,
            }}
          >
            Twin Mode (S6 mvp)
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
            Mirror Twin · 실시간 미러 <ValueChip active={valueProps} compact />
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--p-fg-muted, #aaa)' }}>
            {active ? <>scenario: <strong className="p-mono">{active.id}</strong> · D8 — activeBeds {Array.from(activeBedsSet).join(',')} 강조</> : 'WS+REST mock · S6+ 통합'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="p-btn"
            onClick={() => setShowPicker(true)}
            style={{ padding: '4px 10px', fontSize: 11 }}
            title="다른 시나리오 선택"
          >
            ▼ 시나리오 변경
          </button>
          <div
            className="p-mono"
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              background: connected ? 'rgba(80,200,120,0.1)' : 'rgba(220,80,80,0.1)',
              color: connected ? 'rgb(80,200,120)' : 'rgb(220,80,80)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="WireStatus — WS 연결 + latency + seq"
            onClick={() => setConnected((c) => !c)}
          >
            <span>{connected ? '●' : '○'}</span>
            WS
            <span style={{ fontWeight: 600 }}>{latency}ms</span>
            <span style={{ color: 'var(--p-fg-dim, #888)' }}>seq</span>
            <span>{seq.toLocaleString()}</span>
          </div>
          {onCancel && (
            <button className="p-btn" onClick={onCancel} style={{ padding: '6px 14px' }}>
              ← 뒤로
            </button>
          )}
        </div>
      </div>

      {/* Zone heatmap */}
      <section
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          Zone Heatmap · 13 beds (생육 단계 색상 + ⚠ anomaly)
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(13, 1fr)',
            gap: 4,
          }}
        >
          {ZONES.map((z) => {
            const stage =
              z.day < 30 ? 'early' : z.day < 70 ? 'mid' : 'late';
            const baseColor =
              stage === 'early'
                ? 'rgba(80,180,80,0.4)'
                : stage === 'mid'
                ? 'rgba(220,180,60,0.4)'
                : 'rgba(220,80,80,0.4)';
            // D9 — 시나리오 activeBeds 강조 (다른 베드는 dim)
            const inActive = activeBedsSet.size === 0 || activeBedsSet.has(z.bed);
            const color = inActive ? baseColor : 'rgba(80,80,80,0.15)';
            return (
              <div
                key={z.bed}
                title={`Bed ${z.bed} · D${z.day} · workable ${(z.workable * 100).toFixed(0)}% · occlusion ${(z.occlusion * 100).toFixed(0)}%`}
                style={{
                  padding: '10px 6px',
                  borderRadius: 6,
                  background: color,
                  border: z.anomaly
                    ? '2px solid rgb(255,180,0)'
                    : inActive
                    ? '1px solid var(--p-border, #333)'
                    : '1px solid rgba(60,60,60,0.5)',
                  textAlign: 'center',
                  fontSize: 11,
                  cursor: 'pointer',
                  position: 'relative',
                  opacity: inActive ? 1 : 0.4,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--p-fg, #ddd)' }}>B{z.bed}</div>
                <div className="p-mono" style={{ fontSize: 9, color: 'var(--p-fg-dim, #888)' }}>
                  D{z.day}
                </div>
                {z.anomaly && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 4,
                      fontSize: 10,
                      color: 'rgb(255,180,0)',
                    }}
                  >
                    ⚠
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 10, color: 'var(--p-fg-dim, #888)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(80,180,80,0.4)', marginRight: 4 }} />초기 D0~30</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(220,180,60,0.4)', marginRight: 4 }} />중기 D30~70</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(220,80,80,0.4)', marginRight: 4 }} />후기 D70~120</span>
          <span><span style={{ color: 'rgb(255,180,0)' }}>⚠</span> anomaly (표준 ±20% 초과)</span>
        </div>

        {/* W3.d — Robot 위치 + 이동 trail (rail X 기준 시각화) */}
        <div style={{ marginTop: 16, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--p-fg-dim, #888)', marginBottom: 6 }}>
            Robot rail position (실시간 /robot/state 10Hz)
          </div>
          <svg viewBox="0 0 600 32" style={{ width: '100%', height: 32, display: 'block' }}>
            {/* Rail line */}
            <line x1={20} y1={16} x2={580} y2={16} stroke="#444" strokeWidth={2} strokeDasharray="3,2" />
            {/* Trail */}
            {trailRef.current.map((tx, i) => {
              const screenX = 300 + (tx / 14) * 280;
              const opacity = (i + 1) / trailRef.current.length;
              return (
                <circle key={i} cx={screenX} cy={16} r={2} fill={`rgba(64,200,140,${opacity * 0.6})`} />
              );
            })}
            {/* Current robot dot */}
            <circle cx={300 + (robotX / 14) * 280} cy={16} r={5} fill="rgb(64,200,140)" stroke="#000" strokeWidth={1.5} />
            {/* Position label */}
            <text x={300 + (robotX / 14) * 280} y={8} fontSize={9} fill="rgb(64,200,140)" textAnchor="middle" className="p-mono">
              {robotX.toFixed(1)}m
            </text>
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--p-fg-dim, #888)', marginTop: 2 }}>
            <span>−14m</span>
            <span>baseline (0)</span>
            <span>+14m</span>
          </div>
        </div>

        {/* W3.e — Recent anomaly events */}
        {recentEvents.length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,180,0,0.05)', borderRadius: 6, border: '1px solid rgba(255,180,0,0.2)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgb(255,180,0)', marginBottom: 6 }}>
              ⚠ Recent anomaly events ({recentEvents.length})
            </div>
            {recentEvents.map((ev, i) => (
              <div key={i} className="p-mono" style={{ fontSize: 10, color: 'var(--p-fg-muted, #aaa)', padding: '2px 0' }}>
                <strong style={{ color: 'rgb(255,180,0)' }}>{ev.zoneId}</strong> · {ev.reason}
                {ev.deviationPct !== undefined && <> · dev <strong>{ev.deviationPct}%</strong></>}
              </div>
            ))}
          </div>
        )}

        {/* W3.a~e — Bus 메시지 카운트 */}
        <div style={{ marginTop: 12, display: 'flex', gap: 14, fontSize: 10, color: 'var(--p-fg-dim, #888)' }}>
          <span className="p-mono">/world {msgCount.world}</span>
          <span className="p-mono">/robot {msgCount.robot}</span>
          <span className="p-mono">/plant {msgCount.plant}</span>
          <span className="p-mono" style={{ color: msgCount.anomaly > 0 ? 'rgb(255,180,0)' : undefined }}>
            /anomaly {msgCount.anomaly}
          </span>
        </div>
      </section>

      {/* KPI dashboard */}
      <section
        style={{
          padding: 16,
          border: '1px solid var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>KPI Dashboard (8개)</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
          }}
        >
          {KPIS.map((k) => (
            <div
              key={k.key}
              style={{
                padding: 12,
                borderRadius: 6,
                border: '1px solid var(--p-border, #333)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', textTransform: 'uppercase' }}>
                {k.label}
              </div>
              <div
                className="p-mono"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  marginTop: 4,
                  color:
                    k.pass === true
                      ? 'rgb(80,200,120)'
                      : k.pass === false
                      ? 'rgb(220,80,80)'
                      : 'var(--p-fg-dim, #888)',
                }}
              >
                {k.value}
              </div>
              <div style={{ fontSize: 10, color: 'var(--p-fg-dim, #888)', marginTop: 4 }}>
                임계 {k.threshold}
                {k.pass === true && <span style={{ marginLeft: 6, color: 'rgb(80,200,120)' }}>PASS</span>}
                {k.pass === null && <span style={{ marginLeft: 6 }}>측정 대기</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Embed placeholder */}
      <section
        style={{
          padding: 24,
          border: '2px dashed var(--p-border, #333)',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center',
          color: 'var(--p-fg-dim, #888)',
          fontSize: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p-fg, #ddd)', marginBottom: 4 }}>
          &lt;phytosim-twin&gt; web component embed slot
        </div>
        <div className="p-mono" style={{ fontSize: 11 }}>
          src="wss://twin/v1/embed?zone=bed-3" · token="&lt;jwt&gt;" · S6+에서 비아 관제 iframe 통합
        </div>
      </section>
    </div>
  );
}
