/**
 * Bottom timeline panel — the "star" of the redesigned UI.
 *
 * Replaces the old Timeline + EventList combination with a single panel
 * containing:
 *   • play/back/forward nav + big "Day NNN / 120" + 단계 label
 *   • Speed selector (0.5× / 1× / 2× / 4× / 8×)
 *   • Dual sparkline: 평균 키 (heightCm) + 누적 수확량 (ripening progress)
 *   • Event dot row above the main scrub track
 *   • Main draggable track + drag-head
 *   • Day markers (D0 D15 ... D120)
 *   • Stage bands with current stage highlighted
 *
 * Reference: _ref/Sim UI v2 _standalone_.html `.timeline-wrap`.
 */

import { useMemo } from 'react';
import { useTwinStore } from '../store/twinStore';
import { SCENARIO } from '../data/mockScenario';
import { GROWTH_STAGES } from '@farmsim/tomato-engine';
import { Sparkline } from '../ui/Sparkline';
import { StageBands } from '../ui/StageBands';
import { PlayBtn } from '../ui/PlayBtn';
import { BtnIcon } from '../ui/BtnIcon';

const SPEEDS = [0.5, 1, 2, 4, 8] as const;
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

function severityClass(sev: 'info' | 'warning' | 'critical'): string {
  return sev === 'critical' ? 'bad' : sev === 'warning' ? 'warn' : 'ok';
}

export function TimelinePanel() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const playing = useTwinStore((s) => s.playing);
  const playSpeed = useTwinStore((s) => s.playSpeed);
  const setDay = useTwinStore((s) => s.setDay);
  const togglePlay = useTwinStore((s) => s.togglePlay);
  const setPlaySpeed = useTwinStore((s) => s.setPlaySpeed);

  const total = SCENARIO.durationDays;
  const dayInt = Math.max(0, Math.min(total, Math.round(currentDay)));
  const dayPct = (currentDay / total) * 100;

  const heightNow = heightAvg[dayInt] ?? 0;
  const ripenNow = ripenAvg[dayInt] ?? 0;

  // Previous / next event jump targets
  const prevNextEvents = useMemo(() => {
    const sorted = [...SCENARIO.events].sort((a, b) => a.day - b.day);
    const prev = [...sorted].reverse().find((e) => e.day < currentDay - 0.5);
    const next = sorted.find((e) => e.day > currentDay + 0.5);
    return { prev, next };
  }, [currentDay]);

  return (
    <div
      className="panel timeline-panel"
      style={{
        margin: '0 12px 12px',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: 1,
        minWidth: 0,
      }}
    >
      {/* Top row: nav + big Day + stage label + speed selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BtnIcon
            onClick={() => prevNextEvents.prev && setDay(prevNextEvents.prev.day)}
            disabled={!prevNextEvents.prev}
            title="이전 이벤트"
          >
            ◀
          </BtnIcon>
          <PlayBtn onClick={togglePlay} title={playing ? '일시정지' : '재생'}>
            <span style={{ fontSize: 14 }}>{playing ? '❚❚' : '▶'}</span>
          </PlayBtn>
          <BtnIcon
            onClick={() => prevNextEvents.next && setDay(prevNextEvents.next.day)}
            disabled={!prevNextEvents.next}
            title="다음 이벤트"
          >
            ▶
          </BtnIcon>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>현재 일자</span>
          <span
            className="mono"
            style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}
          >
            Day {dayInt.toString().padStart(3, '0')}
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-dim)' }}>
              {' '}
              / {total}
            </span>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginLeft: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>단계</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', lineHeight: 1 }}>
            {currentStageName(currentDay)}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <div className="tab-strip" role="group" aria-label="재생 속도">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={playSpeed === s ? 'is-on mono' : 'mono'}
              onClick={() => setPlaySpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Dual sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div
          style={{
            background: 'var(--bg-soft)',
            border: '1px solid var(--bd)',
            borderRadius: 8,
            padding: '4px 6px',
            position: 'relative',
          }}
        >
          <Sparkline
            values={heightAvg}
            cursorIndex={dayInt}
            color="var(--ok)"
            label="평균 키"
            valueText={`${heightNow.toFixed(0)}cm`}
            height={64}
          />
        </div>
        <div
          style={{
            background: 'var(--bg-soft)',
            border: '1px solid var(--bd)',
            borderRadius: 8,
            padding: '4px 6px',
            position: 'relative',
          }}
        >
          <Sparkline
            values={ripenAvg}
            cursorIndex={dayInt}
            color="var(--warn)"
            label="누적 수확량"
            valueText={`${Math.round(ripenNow * 100)}%`}
            height={64}
          />
        </div>
      </div>

      {/* Event dots + main track */}
      <div style={{ position: 'relative', height: 22 }}>
        {SCENARIO.events.map((evt) => {
          const left = (evt.day / total) * 100;
          return (
            <button
              key={evt.id}
              type="button"
              title={evt.descriptionKo}
              onClick={() => setDay(evt.day)}
              className={`tl-evt ${severityClass(evt.severity)}`}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 10,
                height: 10,
                borderRadius: 5,
                border: '2px solid white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                cursor: 'pointer',
                background:
                  evt.severity === 'critical'
                    ? 'var(--bad)'
                    : evt.severity === 'warning'
                    ? 'var(--warn)'
                    : 'var(--ok)',
              }}
            />
          );
        })}
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
            width: 20,
            height: 20,
            borderRadius: 10,
            background: 'white',
            border: '3px solid var(--fg)',
            boxShadow: '0 4px 10px rgba(30,40,30,0.25)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 6,
              height: 6,
              borderRadius: 3,
              background: 'var(--fg)',
            }}
          />
        </div>
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

      <div style={{ position: 'relative', height: 16 }}>
        {DAY_LABELS.map((d) => (
          <span
            key={d}
            className="mono"
            style={{
              position: 'absolute',
              left: `${(d / total) * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 10.5,
              color: 'var(--fg-dim)',
            }}
          >
            D{d}
          </span>
        ))}
      </div>

      <StageBands currentDay={currentDay} totalDays={total} />
    </div>
  );
}
