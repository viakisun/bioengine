import { GROWTH_STAGES } from '@farmsim/tomato-engine';

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
  return (
    <div
      style={{
        position: 'relative',
        height: 26,
        display: 'flex',
        gap: 2,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {GROWTH_STAGES.map((stage, i) => {
        const isCurrent = currentDay >= stage.dayStart && currentDay < stage.dayEnd;
        const widthPct = ((stage.dayEnd - stage.dayStart) / totalDays) * 100;
        return (
          <div
            key={stage.name}
            style={{
              position: 'relative',
              width: `${widthPct}%`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: isCurrent ? 600 : 500,
              color: isCurrent ? 'var(--fg)' : 'var(--fg-mute)',
              background: STAGE_BG[i] ?? 'var(--bg-softer)',
              transition: 'color 0.15s',
            }}
          >
            {STAGE_LABEL[i] ?? stage.name}
            {isCurrent && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: 'var(--fg)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
