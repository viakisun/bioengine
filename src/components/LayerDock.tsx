/**
 * LayerDock — floating glass pill at the bottom-right of the scene.
 *
 * Pulls the two most-frequently-used scene-level controls out of the
 * fixed top/bottom chrome and into a single dock that sits just above
 * the (collapsible) console:
 *
 *   [전체 | 작업자 | 근접 | 로봇] · [0.5× | 1× | 2× | 4× | 8×]
 *
 * Position is `bottom: calc(var(--console-h) + 14px)` so the dock
 * slides in lockstep with the console expand/collapse transition.
 */

import { useTwinStore } from '../store/twinStore';
import { TabStrip, type TabItem } from '../ui/TabStrip';
import type { PresetView } from '../twin/CameraRig';

const CAMERA_PRESETS: ReadonlyArray<TabItem<PresetView>> = [
  { id: 'overview', label: '전체' },
  { id: 'eye-level', label: '작업자' },
  { id: 'closeup', label: '근접' },
  { id: 'robot-pov', label: '로봇' },
];

const SPEEDS = [0.5, 1, 2, 4, 8] as const;

export function LayerDock() {
  const cameraPreset = useTwinStore((s) => s.cameraPreset);
  const setCameraPreset = useTwinStore((s) => s.setCameraPreset);
  const playSpeed = useTwinStore((s) => s.playSpeed);
  const setPlaySpeed = useTwinStore((s) => s.setPlaySpeed);

  return (
    <div className="layer-dock">
      <TabStrip<PresetView>
        items={CAMERA_PRESETS}
        active={cameraPreset}
        onSelect={setCameraPreset}
      />
      <span className="dock-sep" />
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
  );
}
