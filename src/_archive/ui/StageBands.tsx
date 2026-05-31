import { GROWTH_STAGES } from '@farmsim/tomato-engine';
import { useTwinStore } from '../store/twinStore';

interface StageBandsProps {
  currentDay: number;
  totalDays: number;
}

// One palette token per growth stage. Reference defines s1–s5; we add s6
// for our 6-stage taxonomy (정식 / 영양생장 / 개화기 / 착과기 / 과실비대 / 숙성).
const STAGE_BG = [
  '#eef5ee', // 육묘기 (정식)
  '#dceeda', // 영양생장기
  '#fdf4e3', // 개화기
  '#fbe8d8', // 착과기
  '#fde4d4', // 과실비대기
  '#fcd9c4', // 숙성기 (담적색~완숙)
] as const;

// Display names override the engine's slightly more clinical labels.
const STAGE_LABEL = ['정식', '영양생장', '개화기', '착과기', '과실비대', '숙성'] as const;

export function StageBands({ currentDay, totalDays }: StageBandsProps) {
  const setDay = useTwinStore((s) => s.setDay);

  return (
    <div className="stage-band-row">
      {GROWTH_STAGES.map((stage, i) => {
        const isCurrent = currentDay >= stage.dayStart && currentDay < stage.dayEnd;
        const widthPct = ((stage.dayEnd - stage.dayStart) / totalDays) * 100;
        const midDay = (stage.dayStart + stage.dayEnd) / 2;
        return (
          <button
            key={stage.name}
            type="button"
            onClick={() => setDay(midDay)}
            title={`${STAGE_LABEL[i] ?? stage.name} (Day ${Math.round(midDay)})`}
            className={`stage-band${isCurrent ? ' is-current' : ''}`}
            style={{
              width: `${widthPct}%`,
              background: STAGE_BG[i] ?? 'var(--bg-softer)',
            }}
          >
            {STAGE_LABEL[i] ?? stage.name}
            {isCurrent && <span className="stage-band-cursor" />}
          </button>
        );
      })}
    </div>
  );
}
