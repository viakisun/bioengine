// SelectedObjectLabel — floating info chip for the currently observed
// plant / truss / fruit. Phase 1 scope shows the showcase plant only;
// truss/fruit click-to-select is a future enhancement (see plan
// ai-snuggly-badger.md "Out of scope").

import { useSinglePlantState } from './useSinglePlantState';
import { SHOWCASE_SEED } from '../../twin/SceneInfrastructure';
import { FONT_MONO, C_FG, C_BORDER } from './styles';

export function SelectedObjectLabel() {
  const ps = useSinglePlantState();
  if (!ps) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 124,
        right: 24,
        pointerEvents: 'auto',
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 6,
        padding: '6px 10px',
        fontFamily: FONT_MONO,
        fontSize: 11,
        color: C_FG,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
      title="Showcase plant. truss/fruit 클릭 선택은 향후 추가 예정."
    >
      식물 #{SHOWCASE_SEED} · D{ps.day} · {ps.heightCm.toFixed(0)}cm · T{ps.trusses.length}
    </div>
  );
}
