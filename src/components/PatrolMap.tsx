/**
 * PatrolMap — top-down "patrol report" view of the bed.
 *
 * Inspired by hike/trail tracker apps: a continuous trail with numbered
 * waypoint markers along it, each marker colored by status. Adapted to
 * our greenhouse data:
 *
 *   • Bed outline (30m × 7m, light beige fill).
 *   • Zone bands (6 colored stripes by current health).
 *   • Plant row (small dots at z = 0).
 *   • Robot aisle trail (z = 1.5) — past portion green (already covered),
 *     future portion neutral grey.
 *   • Capture-session markers numbered 1..N along the trail.
 *     Color = the captured plant's health on the capture day:
 *       cyan (정상)   warn-orange (이상/생육저하)   red (병해/심각)
 *   • Live robot position dot.
 *
 * Used in the sidebar "경로" tab.
 */

import { useMemo } from 'react';
import {
  SCENARIO,
  getDailySnapshot,
  zoneHealthMix,
} from '../data/mockScenario';
import type { HealthLabel } from '../data/mockScenario';
import { useTwinStore } from '../store/twinStore';

// World → SVG: 1 m = 10 svg-units. Bed 30 × 7m → 300 × 70.
const VB_W = 320;
const VB_H = 90;
const PAD_X = 10;
const PAD_Z_TOP = 6;

const BED_LEN = SCENARIO.bedLengthM;
const BED_W = 7;
const ROBOT_Z = 1.5;

function worldToSvg(worldX: number, worldZ: number) {
  const u = (worldX + BED_LEN / 2) * 10 + PAD_X;
  const v = worldZ * 10 + PAD_Z_TOP;
  return { u, v };
}

function healthTone(h: HealthLabel): 'ok' | 'warn' | 'bad' {
  if (h === 'normal') return 'ok';
  if (h === 'disease') return 'bad';
  return 'warn';
}

const TONE_FILL: Record<'ok' | 'warn' | 'bad', string> = {
  ok: '#22c2c8', // cyan (matches reference screenshot)
  warn: '#f59e0b',
  bad: '#dc2626',
};

const TONE_BAND: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'var(--ok-soft)',
  warn: 'var(--warn-soft)',
  bad: 'var(--bad-soft)',
};

const HEALTH_LABEL_KO: Record<HealthLabel, string> = {
  normal: '정상',
  weak: '생육 부진',
  disease: '병해',
  'water-stress': '수분 스트레스',
};

interface MarkerSpec {
  index: number;        // 1-based number shown on the chip
  worldX: number;
  worldZ: number;
  health: HealthLabel;
  tone: 'ok' | 'warn' | 'bad';
  hour: number;
  zoneId: number;
}

interface HistoryDot {
  worldX: number;
  tone: 'ok' | 'warn' | 'bad';
  daysAgo: number; // for opacity fade
}

export function PatrolMap() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const robotX = useTwinStore((s) => s.robotX);
  const robotZ = useTwinStore((s) => s.robotZ);

  const { markers, history, recentDay, zoneTones } = useMemo(() => {
    // Find the most recent patrol day (captures happen every 3 days).
    // If the current day has its own captures we use those; otherwise
    // fall back to the previous patrol so the map is never empty.
    const dayFloor = Math.max(0, Math.floor(currentDay));
    let recentDay = -1;
    for (let d = dayFloor; d >= 0; d--) {
      if (SCENARIO.captureSessions.some((s) => s.day === d)) {
        recentDay = d;
        break;
      }
    }
    const todays = recentDay >= 0
      ? SCENARIO.captureSessions.filter((s) => s.day === recentDay).sort((a, b) => a.hour - b.hour)
      : [];
    const markers: MarkerSpec[] = todays.map((s, i) => {
      const plant = SCENARIO.plants[s.targetPlantId];
      const snap = getDailySnapshot(plant, currentDay);
      return {
        index: i + 1,
        worldX: s.robotPosition[0],
        worldZ: s.robotPosition[2],
        health: snap.health,
        tone: healthTone(snap.health),
        hour: s.hour,
        zoneId: s.zoneId,
      };
    });

    // History: small dots from the previous ~9 days of patrols
    // (3 previous patrol days). Older dots fade out.
    const history: HistoryDot[] = [];
    if (recentDay > 0) {
      for (let back = 3; back <= 9; back += 3) {
        const d = recentDay - back;
        if (d < 0) break;
        const sessions = SCENARIO.captureSessions.filter((s) => s.day === d);
        for (const s of sessions) {
          const snap = getDailySnapshot(SCENARIO.plants[s.targetPlantId], d);
          history.push({
            worldX: s.robotPosition[0],
            tone: healthTone(snap.health),
            daysAgo: back,
          });
        }
      }
    }

    const zoneTones = SCENARIO.zones.map((z) => healthTone(zoneHealthMix(z, currentDay).dominant));

    return { markers, history, recentDay, zoneTones };
  }, [currentDay]);

  // Robot trail end-to-end (the patrol path along z = 1.5).
  const trailStart = worldToSvg(-BED_LEN / 2, ROBOT_Z);
  const trailEnd = worldToSvg(BED_LEN / 2, ROBOT_Z);
  const robotS = worldToSvg(robotX, robotZ || ROBOT_Z);
  // Past portion = from trailStart to current robot x.
  const pastEndX = Math.max(trailStart.u, Math.min(trailEnd.u, robotS.u));

  return (
    <div
      className="panel"
      style={{
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)' }}>
          오늘의 patrol 경로
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>
          {recentDay >= 0 ? `Day ${recentDay}` : '대기 중'}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: '100%',
          height: 'auto',
          background: '#efece2',
          borderRadius: 8,
          border: '1px solid var(--bd)',
        }}
      >
        {/* Bed mat */}
        <rect
          x={PAD_X}
          y={PAD_Z_TOP}
          width={BED_LEN * 10}
          height={BED_W * 10}
          fill="#dad5c2"
          rx={3}
        />
        {/* Zone bands along the bed strip */}
        {SCENARIO.zones.map((z, i) => {
          const a = worldToSvg(z.startX, 0);
          const b = worldToSvg(z.endX, BED_W);
          return (
            <rect
              key={z.zoneId}
              x={a.u}
              y={a.v}
              width={b.u - a.u}
              height={b.v - a.v}
              fill={TONE_BAND[zoneTones[i]]}
              opacity={0.45}
            />
          );
        })}

        {/* Plant row (small dots at z = 0) */}
        {SCENARIO.plants.map((p, i) => {
          const { u, v } = worldToSvg(p.position[0], 0.4);
          return (
            <circle
              key={i}
              cx={u}
              cy={v}
              r={1.2}
              fill="#3a5a3a"
              opacity={0.55}
            />
          );
        })}

        {/* Robot trail — past (green) + future (grey) */}
        <line
          x1={trailStart.u}
          y1={trailStart.v}
          x2={trailEnd.u}
          y2={trailEnd.v}
          stroke="#c3c1b7"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <line
          x1={trailStart.u}
          y1={trailStart.v}
          x2={pastEndX}
          y2={trailStart.v}
          stroke="#22c2c8"
          strokeWidth={2.8}
          strokeLinecap="round"
        />

        {/* History dots — past 3 patrol days, fading by age */}
        {history.map((h, i) => {
          const { u, v } = worldToSvg(h.worldX, ROBOT_Z);
          const opacity = Math.max(0.18, 0.55 - h.daysAgo * 0.05);
          return (
            <circle
              key={`hist-${i}`}
              cx={u}
              cy={v + 4}
              r={1.6}
              fill={TONE_FILL[h.tone]}
              opacity={opacity}
            />
          );
        })}

        {/* Capture-session waypoint markers */}
        {markers.map((m) => {
          const { u, v } = worldToSvg(m.worldX, m.worldZ);
          return (
            <g key={m.index}>
              <circle
                cx={u}
                cy={v}
                r={5.4}
                fill="white"
                stroke="rgba(0,0,0,0.18)"
                strokeWidth={0.6}
              />
              <circle cx={u} cy={v} r={4.4} fill={TONE_FILL[m.tone]} />
              <text
                x={u}
                y={v}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={4.6}
                fontWeight={700}
                fill="white"
                style={{ pointerEvents: 'none', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
              >
                {m.index}
              </text>
            </g>
          );
        })}

        {/* Live robot position */}
        <circle cx={robotS.u} cy={robotS.v} r={3.8} fill="#0ea5e9" />
        <circle
          cx={robotS.u}
          cy={robotS.v}
          r={3.8}
          fill="none"
          stroke="rgba(14,165,233,0.35)"
          strokeWidth={3.5}
        >
          <animate
            attributeName="r"
            from={3.8}
            to={7}
            dur="1.4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from={0.6}
            to={0}
            dur="1.4s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>

      {/* Marker legend list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {markers.length === 0 ? (
          <span style={{ fontSize: 11.5, color: 'var(--fg-mute)' }}>
            오늘 예정된 capture session 이 없습니다.
          </span>
        ) : (
          markers.map((m) => (
            <div
              key={m.index}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                gap: 8,
                alignItems: 'center',
                padding: '4px 2px',
                fontSize: 11.5,
              }}
            >
              <span
                className="mono"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: TONE_FILL[m.tone],
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {m.index}
              </span>
              <span style={{ color: 'var(--fg)' }}>
                구역 {m.zoneId + 1}{' '}
                <span style={{ color: 'var(--fg-mute)' }}>
                  · {HEALTH_LABEL_KO[m.health]}
                </span>
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>
                {m.hour}:00
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
