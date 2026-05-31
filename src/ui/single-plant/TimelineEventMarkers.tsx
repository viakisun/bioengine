// TimelineEventMarkers — colored dot overlay sitting on top of the
// BottomPlaybackBar's scrubber track. Hover for a "D{n} · {label}"
// tooltip. Marker generation lives in events.ts.

import { useMemo, useState } from 'react';
import { useTwinStore } from '../../store/twinStore';
import { getSinglePlantEngine } from './useSinglePlantState';
import { SHOWCASE_SEED } from '../../rendering/SceneInfrastructure';
import { buildSinglePlantEvents, EVENT_COLOR, type TimelineEvent } from './events';
import { FONT_MONO, C_FG, C_BORDER } from './styles';

const TOTAL_DAYS = 120;

export function TimelineEventMarkers() {
  // Re-derive once the engine is ready (minute > 0 implies registered).
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const [hover, setHover] = useState<TimelineEvent | null>(null);

  const events = useMemo<TimelineEvent[]>(() => {
    const engine = getSinglePlantEngine();
    if (!engine) return [];
    const cultivar = engine.getCultivarFor(SHOWCASE_SEED);
    if (!cultivar) return [];
    return buildSinglePlantEvents(cultivar, TOTAL_DAYS);
    // engine identity is stable; recomputing only when 'minute' first
    // becomes non-null is sufficient. Keep the dep so the memo refreshes
    // on engine-ready transitions.
  }, [minute > 0]);

  if (events.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: -6,
        height: 10,
        pointerEvents: 'none',
      }}
    >
      {events.map((ev, idx) => {
        const leftPct = (ev.day / TOTAL_DAYS) * 100;
        return (
          <div
            key={`${ev.type}-${ev.trussIndex ?? 0}-${idx}`}
            onMouseEnter={() => setHover(ev)}
            onMouseLeave={() => setHover((cur) => (cur === ev ? null : cur))}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: 0,
              width: 8,
              height: 8,
              marginLeft: -4,
              borderRadius: 4,
              background: EVENT_COLOR[ev.type],
              border: '1px solid rgba(255,255,255,0.8)',
              pointerEvents: 'auto',
              cursor: 'help',
            }}
            title={`D${ev.day} · ${ev.label}`}
          />
        );
      })}

      {hover && (
        <div
          style={{
            position: 'absolute',
            left: `${(hover.day / TOTAL_DAYS) * 100}%`,
            transform: 'translateX(-50%)',
            top: -28,
            background: 'rgba(255,255,255,0.96)',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 4,
            padding: '3px 8px',
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: C_FG,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          D{hover.day} · {hover.label}
        </div>
      )}
    </div>
  );
}
