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
import { TabStrip, type TabItem } from '../ui/TabStrip';
import type { PresetView } from '../twin/CameraRig';

const CAMERA_PRESETS: ReadonlyArray<TabItem<PresetView>> = [
  { id: 'overview', label: '전체' },
  { id: 'eye-level', label: '작업자' },
  { id: 'closeup', label: '근접' },
  { id: 'robot-pov', label: '로봇' },
];

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
  const cameraPreset = useTwinStore((s) => s.cameraPreset);
  const setCameraPreset = useTwinStore((s) => s.setCameraPreset);
  const selectZone = useTwinStore((s) => s.selectZone);
  const robotX = useTwinStore((s) => s.robotX);
  const robotZ = useTwinStore((s) => s.robotZ);
  const robotTask = useTwinStore((s) => s.robotTask);

  const dayInt = Math.round(currentDay);
  const total = SCENARIO.durationDays;
  const stageName = currentStageName(currentDay);
  const robotLabel = `x ${robotX.toFixed(2)}m · z ${robotZ.toFixed(2)}m`;
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
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {/* Left: status pills */}
      <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <Pill tone="ok">
          <span className="mono">
            Day <b>{dayInt}</b> / {total}
          </span>
          <PillSep />
          <span style={{ color: 'var(--fg-mute)' }}>{stageName}</span>
        </Pill>
        <Pill tone={taskTone}>
          <span style={{ color: 'var(--fg-mute)' }}>로봇</span>
          <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{taskLabel}</span>
          <PillSep />
          <span className="mono" style={{ color: 'var(--fg)' }}>
            {robotLabel}
          </span>
        </Pill>
      </div>

      <div style={{ flex: 1 }} />

      {/* Right: zone status chips + camera presets */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          pointerEvents: 'auto',
        }}
      >
        <div
          className="panel"
          style={{
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--fg-mute)' }}>구역</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {zoneStatuses.map(({ zoneId, tone }) => (
              <button
                key={zoneId}
                type="button"
                onClick={() => selectZone(zoneId)}
                title={`구역 ${zoneId + 1}`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: '1px solid var(--bd)',
                  background:
                    tone === 'ok'
                      ? 'var(--ok-soft)'
                      : tone === 'warn'
                      ? 'var(--warn-soft)'
                      : 'var(--bad-soft)',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 10.5,
                  fontWeight: 600,
                }}
              >
                {zoneId + 1}
              </button>
            ))}
          </div>
          {badCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--bad)', fontWeight: 600 }}>
              {badCount} 이상
            </span>
          )}
        </div>

        <TabStrip<PresetView>
          items={CAMERA_PRESETS}
          active={cameraPreset}
          onSelect={setCameraPreset}
        />
      </div>
    </div>
  );
}
