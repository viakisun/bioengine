// FloatingTopBar — pill-shaped HUD anchored to the top of the
// single-plant viewport.
//
// Iter 35 PR 2 Phase K: filter pills (전체/잎/화방/과실/작업/환경) 제거 —
//   사용자 결정 "모든 floating UI 정리". Day/Phase 표시만 보존.

import type { PlantPhysiologyState } from '@farmsim/tomato-engine';
import { useSinglePlantState } from './useSinglePlantState';
import { FONT_MONO, FONT_SERIF, C_FG, C_FG_MUTE, C_BORDER } from './styles';

function phaseOf(ps: PlantPhysiologyState | null): string {
  if (!ps) return '—';
  if (ps.trusses.length === 0) return '영양생장기';
  // Iter 16 (SSOT #165) — distinguish bud / fruit_set / cell_expansion / ripening.
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
  const ps = useSinglePlantState();
  const day = ps?.day ?? 0;
  const phase = phaseOf(ps);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 36,
          padding: '0 14px',
          background: 'rgba(255, 255, 255, 0.86)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${C_BORDER}`,
          borderRadius: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: C_FG,
        }}
      >
        <span style={{ fontFamily: FONT_SERIF, fontSize: 13, fontWeight: 600 }}>
          Day {day}<span style={{ color: C_FG_MUTE }}> / 120</span>
        </span>
        <span style={{ color: C_FG_MUTE }}>·</span>
        <span style={{ color: C_FG }}>{phase}</span>
      </div>
    </div>
  );
}
