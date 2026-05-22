/**
 * Bottom timeline panel — collapsible "console-shell" pattern from v3.
 *
 * Two modes (toggled via store.consoleExpanded + the ▲ expand-btn at
 * the top of the panel):
 *
 *   Collapsed (72px) — default
 *     Nav (◀ ▶ ▶), Day NNN / 단계 label, KPI inline (키·수확량),
 *     event dots + main scrub track + drag head, day labels (D0..D120).
 *     Sparkline + stage bands hidden.
 *
 *   Expanded (280px)
 *     Above the always-visible row, two compact side-by-side
 *     sparklines (평균키 + 누적수확량) and the stage-band strip
 *     (each band is a button — click jumps to that stage's middle day).
 *
 * Speed selector + camera presets live in the floating LayerDock pill
 * to the bottom-right of the scene.
 */

import { useMemo } from 'react';
import { useTwinStore } from '../store/twinStore';
import { SCENARIO } from '../data/mockScenario';
import { GROWTH_STAGES } from '@farmsim/tomato-engine';
import { Sparkline } from '../ui/Sparkline';
import { StageBands } from '../ui/StageBands';
import { PlayBtn } from '../ui/PlayBtn';
import { BtnIcon } from '../ui/BtnIcon';

const DAY_LABELS = [0, 15, 30, 45, 60, 75, 90, 105, 120] as const;

/** Aggregate plant snapshots into daily averages once at module load. */
function buildDailySeries() {
  const N = SCENARIO.durationDays + 1;
  const heightAvg = new Array<number>(N).fill(0);
  const ripenAvg = new Array<number>(N).fill(0);
  const counts = new Array<number>(N).fill(0);
  for (const p of SCENARIO.plants) {
    for (const d of p.daily) {
      if (d.day >= 0 && d.day < N) {
        heightAvg[d.day] += d.heightCm;
        ripenAvg[d.day] += d.ripenScore;
        counts[d.day] += 1;
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (counts[i] > 0) {
      heightAvg[i] /= counts[i];
      ripenAvg[i] /= counts[i];
    }
  }
  return { heightAvg, ripenAvg };
}

const { heightAvg, ripenAvg } = buildDailySeries();

function currentStageName(day: number): string {
  for (const s of GROWTH_STAGES) {
    if (day >= s.dayStart && day < s.dayEnd) return s.name;
  }
  return GROWTH_STAGES[GROWTH_STAGES.length - 1].name;
}

export function TimelinePanel() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const playing = useTwinStore((s) => s.playing);
  const setDay = useTwinStore((s) => s.setDay);
  const togglePlay = useTwinStore((s) => s.togglePlay);
  const consoleExpanded = useTwinStore((s) => s.consoleExpanded);
  const toggleConsole = useTwinStore((s) => s.toggleConsole);

  const total = SCENARIO.durationDays;
  const dayInt = Math.max(0, Math.min(total, Math.round(currentDay)));
  const dayPct = (currentDay / total) * 100;

  const heightNow = heightAvg[dayInt] ?? 0;
  const ripenNow = ripenAvg[dayInt] ?? 0;

  const prevNextEvents = useMemo(() => {
    const sorted = [...SCENARIO.events].sort((a, b) => a.day - b.day);
    const prev = [...sorted].reverse().find((e) => e.day < currentDay - 0.5);
    const next = sorted.find((e) => e.day > currentDay + 0.5);
    return { prev, next };
  }, [currentDay]);

  return (
    <div
      className={`panel timeline-panel console-shell ${consoleExpanded ? 'expanded' : 'collapsed'}`}
      style={{
        margin: '0 12px 12px',
        padding: '10px 16px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* Top expand handle */}
      <button
        type="button"
        className="expand-btn"
        onClick={toggleConsole}
        title={consoleExpanded ? '타임라인 접기' : '타임라인 펼치기'}
        aria-label="toggle timeline panel"
      >
        {consoleExpanded ? '▼' : '▲'}
      </button>

      {/* Expanded-only: dual sparklines + stage bands at the top */}
      {consoleExpanded && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div
              style={{
                background: 'var(--bg-soft)',
                border: '1px solid var(--bd)',
                borderRadius: 6,
                padding: '2px 6px',
              }}
            >
              <Sparkline
                values={heightAvg}
                cursorIndex={dayInt}
                color="var(--ok)"
                label="평균 키"
                valueText={`${heightNow.toFixed(0)}cm`}
                height={48}
              />
            </div>
            <div
              style={{
                background: 'var(--bg-soft)',
                border: '1px solid var(--bd)',
                borderRadius: 6,
                padding: '2px 6px',
              }}
            >
              <Sparkline
                values={ripenAvg}
                cursorIndex={dayInt}
                color="var(--warn)"
                label="누적 수확량"
                valueText={`${Math.round(ripenNow * 100)}%`}
                height={48}
              />
            </div>
          </div>
          <StageBands currentDay={currentDay} totalDays={total} />
        </>
      )}

      {/* Always-visible: nav + Day/단계/KPI + scrub */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BtnIcon
            onClick={() => prevNextEvents.prev && setDay(prevNextEvents.prev.day)}
            disabled={!prevNextEvents.prev}
            title="이전 이벤트"
          >
            ◀
          </BtnIcon>
          <PlayBtn onClick={togglePlay} title={playing ? '일시정지' : '재생'}>
            <span style={{ fontSize: 13 }}>{playing ? '❚❚' : '▶'}</span>
          </PlayBtn>
          <BtnIcon
            onClick={() => prevNextEvents.next && setDay(prevNextEvents.next.day)}
            disabled={!prevNextEvents.next}
            title="다음 이벤트"
          >
            ▶
          </BtnIcon>
        </div>

        <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>
          Day {dayInt.toString().padStart(3, '0')}
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-dim)' }}>
            {' '}
            / {total}
          </span>
        </div>

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          {currentStageName(currentDay)}
        </span>

        <span className="kpi-inline">
          키 <b>{heightNow.toFixed(0)}cm</b>
          <span style={{ opacity: 0.4, margin: '0 4px' }}>·</span>
          수확 <b>{Math.round(ripenNow * 100)}%</b>
        </span>

        <div style={{ flex: 1, position: 'relative', height: 18 }}>
          {/* Event dots — clickable, jump to day */}
          {SCENARIO.events.map((evt) => {
            const left = (evt.day / total) * 100;
            const color =
              evt.severity === 'critical'
                ? 'var(--bad)'
                : evt.severity === 'warning'
                ? 'var(--warn)'
                : 'var(--ok)';
            return (
              <button
                key={evt.id}
                type="button"
                title={evt.descriptionKo}
                onClick={() => setDay(evt.day)}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  top: 0,
                  transform: 'translate(-50%, 0)',
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  border: '1.5px solid white',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                  cursor: 'pointer',
                  background: color,
                  padding: 0,
                }}
              />
            );
          })}
        </div>
      </div>

      <div style={{ position: 'relative', height: 8 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--bg-softer)',
            borderRadius: 999,
            border: '1px solid var(--bd)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: -1,
            bottom: -1,
            width: `${dayPct}%`,
            background: 'linear-gradient(90deg, var(--ok), #22c55e)',
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${dayPct}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 18,
            height: 18,
            borderRadius: 9,
            background: 'white',
            border: '3px solid var(--fg)',
            boxShadow: '0 4px 10px rgba(30,40,30,0.25)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={currentDay}
          onChange={(e) => setDay(parseFloat(e.target.value))}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            opacity: 0,
            cursor: 'grab',
          }}
        />
      </div>

      <div style={{ position: 'relative', height: 12 }}>
        {DAY_LABELS.map((d) => (
          <span
            key={d}
            className="mono"
            style={{
              position: 'absolute',
              left: `${(d / total) * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: 'var(--fg-dim)',
            }}
          >
            D{d}
          </span>
        ))}
      </div>
    </div>
  );
}
