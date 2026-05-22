/**
 * Top bar — two status pills on the left + zone status chips + camera
 * preset tab-strip on the right. Replaces the previous floating FPS HUD
 * (now hidden) and the LayerToggles (now in the 환경 sidebar tab) and
 * the CameraPresets bottom-center widget (consolidated here per the
 * reference layout).
 *
 * Reference: _ref/Sim UI v2 _standalone_.html top toolbar.
 */

import { useMemo } from 'react';
import { useTwinStore } from '../store/twinStore';
import { SCENARIO, zoneHealthMix } from '../data/mockScenario';
import { GROWTH_STAGES } from '@farmsim/tomato-engine';
import { Pill, PillSep } from '../ui/Pill';

function currentStageName(day: number): string {
  for (const s of GROWTH_STAGES) {
    if (day >= s.dayStart && day < s.dayEnd) return s.name;
  }
  return GROWTH_STAGES[GROWTH_STAGES.length - 1].name;
}

const ROBOT_TASK_KO: Record<'idle' | 'patrolling' | 'capturing' | 'returning', string> = {
  idle: '대기',
  patrolling: '순찰',
  capturing: '촬영',
  returning: '복귀',
};

const ROBOT_TASK_TONE: Record<
  'idle' | 'patrolling' | 'capturing' | 'returning',
  'ok' | 'warn' | undefined
> = {
  idle: 'ok',
  patrolling: 'ok',
  capturing: 'warn',
  returning: 'warn',
};

export function TopBar() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const selectZone = useTwinStore((s) => s.selectZone);
  const robotTask = useTwinStore((s) => s.robotTask);

  const dayInt = Math.round(currentDay);
  const total = SCENARIO.durationDays;
  const stageName = currentStageName(currentDay);
  const taskLabel = ROBOT_TASK_KO[robotTask];
  const taskTone = ROBOT_TASK_TONE[robotTask];

  const zoneStatuses = useMemo(() => {
    return SCENARIO.zones.map((z) => {
      const { dominant } = zoneHealthMix(z, currentDay);
      const tone: 'ok' | 'warn' | 'bad' =
        dominant === 'normal' ? 'ok' : dominant === 'disease' ? 'bad' : 'warn';
      return { zoneId: z.zoneId, tone };
    });
  }, [currentDay]);
  const badCount = zoneStatuses.filter((z) => z.tone !== 'ok').length;

  return (
    <div className="topbar">
      {/* Left: status pills */}
      <div className="topbar-section row gap-md">
        <Pill tone="ok">
          <span className="mono">
            Day <b>{dayInt}</b> / {total}
          </span>
          <PillSep />
          <span className="tag-mute">{stageName}</span>
        </Pill>
        <Pill tone={taskTone}>
          <span className="tag-mute">로봇</span>
          <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{taskLabel}</span>
        </Pill>
      </div>

      <div className="topbar-spacer" />

      {/* Right: zone status chips */}
      <div className="topbar-section row gap-lg">
        <div className="panel zone-panel">
          <span className="zone-panel-label">구역</span>
          <div className="row gap-xs">
            {zoneStatuses.map(({ zoneId, tone }) => (
              <button
                key={zoneId}
                type="button"
                className="zone-chip"
                onClick={() => selectZone(zoneId)}
                title={`구역 ${zoneId + 1}`}
                style={{
                  background:
                    tone === 'ok'
                      ? 'var(--ok-soft)'
                      : tone === 'warn'
                      ? 'var(--warn-soft)'
                      : 'var(--bad-soft)',
                }}
              >
                {zoneId + 1}
              </button>
            ))}
          </div>
          {badCount > 0 && <span className="zone-bad-count">{badCount} 이상</span>}
        </div>
      </div>
    </div>
  );
}
