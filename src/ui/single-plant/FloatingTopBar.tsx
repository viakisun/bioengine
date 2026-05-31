// FloatingTopBar — pill-shaped HUD anchored to the top of the
// single-plant viewport.
//
// Iter 35: lobby/greenhouse back-nav 제거 (single-plant only).
// Layout: [Day n / 120 · phase] · ...spacer...
//         · [filter pills 전체|잎|화방|과실|작업|환경]

import type { PlantPhysiologyState } from '@farmsim/tomato-engine';
import { useTwinStore } from '../../store/twinStore';
import { useSinglePlantState } from './useSinglePlantState';
import { FONT_MONO, FONT_SERIF, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './styles';

type TopFilter = 'all' | 'leaf' | 'truss' | 'fruit' | 'work' | 'env';

const FILTERS: { id: TopFilter; label: string }[] = [
  { id: 'all',   label: '전체' },
  { id: 'leaf',  label: '잎' },
  { id: 'truss', label: '화방' },
  { id: 'fruit', label: '과실' },
  { id: 'work',  label: '작업' },
  { id: 'env',   label: '환경' },
];

function phaseOf(ps: PlantPhysiologyState | null): string {
  if (!ps) return '—';
  if (ps.trusses.length === 0) return '영양생장기';
  // Iter 16 (SSOT #165) — distinguish bud / fruit_set / cell_expansion / ripening.
  // Old logic fired "착과비대기" the moment any truss had any fruit slot
  // (incl. pre-anthesis buds), so a Day 0 truss with 5 buds showed "착과비대기".
  let hasRipe = false, hasExpanding = false, hasFertSmall = false, hasBud = false;
  for (const t of ps.trusses) {
    for (const f of t.fruits) {
      if (f.harvested || f.aborted) continue;
      if (f.ripenStage >= 4) hasRipe = true;
      else if (f.diameter >= 10) hasExpanding = true;
      else if (f.fertilizationTT > 0) hasFertSmall = true;
      else hasBud = true;
    }
  }
  if (hasRipe) return '수확기';
  if (hasExpanding) return '착과비대기';
  if (hasFertSmall) return '착과기';
  if (hasBud) return '화방 분화기';
  return '영양생장기';
}

export function FloatingTopBar() {
  const filter = useTwinStore((s) => s.singlePlantTopFilter);
  const setFilter = useTwinStore((s) => s.setSinglePlantTopFilter);
  const ps = useSinglePlantState();
  const day = ps?.day ?? 0;
  const phase = phaseOf(ps);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        // PARGauge 가 우측 상단(width ~200)을 차지하므로 그 영역을 비움.
        right: 220,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 44,
          padding: '0 12px',
          background: 'rgba(255, 255, 255, 0.86)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${C_BORDER}`,
          borderRadius: 24,
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: C_FG,
          maxWidth: 'min(96vw, 1080px)',
        }}
      >
        {/* Day + phase */}
        <span style={{ fontFamily: FONT_SERIF, fontSize: 13, fontWeight: 600 }}>
          Day {day}<span style={{ color: C_FG_MUTE }}> / 120</span>
        </span>
        <span style={{ color: C_FG_MUTE }}>·</span>
        <span style={{ color: C_FG }}>{phase}</span>

        <div style={{ flex: 1, minWidth: 12 }} />

        {/* Filter pills (UI wiring only — downstream filter is Phase E+) */}
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  background: active ? C_ACCENT : 'transparent',
                  color: active ? '#fff' : C_FG_MUTE,
                  border: `1px solid ${active ? C_ACCENT : 'transparent'}`,
                  borderRadius: 14,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

