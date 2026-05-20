import { useTwinStore } from '../store/twinStore';
import type { PresetView } from '../twin/CameraRig';

const PRESETS: { id: PresetView; label: string }[] = [
  { id: 'overview', label: '전체' },
  { id: 'eye-level', label: '작업자' },
  { id: 'closeup', label: '근접' },
  { id: 'robot-pov', label: '로봇' },
];

export function CameraPresets() {
  const cameraPreset = useTwinStore((s) => s.cameraPreset);
  const setCameraPreset = useTwinStore((s) => s.setCameraPreset);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        background: 'rgba(26,29,35,0.7)',
        border: '1px solid #2a2e36',
        borderRadius: 8,
        padding: 4,
        backdropFilter: 'blur(8px)',
      }}
    >
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setCameraPreset(p.id)}
          style={{
            background: cameraPreset === p.id ? '#6ee7b7' : 'transparent',
            color: cameraPreset === p.id ? '#0a0d12' : '#9ca3af',
            border: 'none',
            borderRadius: 4,
            padding: '6px 12px',
            fontSize: 11,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
