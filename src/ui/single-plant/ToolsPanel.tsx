// ToolsPanel — left dock for the single-plant analysis layout.
// Mode (only Real-Time wired in Phase C), camera preset, display layers.

import { useTwinStore } from '../../store/twinStore';
import { FONT_MONO, FONT_SANS, C_BORDER, C_FG, C_FG_MUTE, PANEL_HEADER_LABEL } from './styles';

type Camera = 'free' | 'truss' | 'fruit' | 'top';

const CAMERAS: { id: Camera; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'truss', label: 'Truss' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'top', label: 'Top' },
];

export function ToolsPanel() {
  const camera = useTwinStore((s) => s.singlePlantCamera);
  const setCamera = useTwinStore((s) => s.setSinglePlantCamera);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '14px 16px',
      gap: 18,
      borderRight: `1px solid ${C_BORDER}`,
      background: '#fff',
      fontFamily: FONT_SANS,
      fontSize: 12,
      color: C_FG,
      overflow: 'auto',
    }}>
      <div>
        <div style={PANEL_HEADER_LABEL}>Mode</div>
        <RadioRow id="real-time" label="Real-Time" checked disabled />
        <RadioRow id="snapshot" label="Snapshot" checked={false} disabled />
        <RadioRow id="compare" label="Compare" checked={false} disabled />
        <Hint>Snapshot / Compare arrive in Phase E+.</Hint>
      </div>

      <div>
        <div style={PANEL_HEADER_LABEL}>Camera</div>
        {CAMERAS.map((c) => (
          <RadioRow
            key={c.id}
            id={c.id}
            label={c.label}
            checked={camera === c.id}
            onSelect={() => setCamera(c.id)}
          />
        ))}
      </div>

      <div>
        <div style={PANEL_HEADER_LABEL}>Display</div>
        <CheckboxRow label="Plant" checked disabled />
        <CheckboxRow label="Wireframe" checked={false} disabled />
        <CheckboxRow label="Heatmap" checked={false} disabled />
        <CheckboxRow label="Light field" checked={false} disabled />
        <Hint>Wireframe / Heatmap / Light field — Phase E+.</Hint>
      </div>
    </div>
  );
}

function RadioRow({
  label, checked, onSelect, disabled = false,
}: { id?: string; label: string; checked: boolean; onSelect?: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={!disabled && onSelect ? onSelect : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontFamily: FONT_MONO,
        fontSize: 11,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        color: checked ? C_FG : C_FG_MUTE,
      }}
    >
      <span>{checked ? '◉' : '○'}</span>
      <span>{label}</span>
    </div>
  );
}

function CheckboxRow({ label, checked, disabled }: { label: string; checked: boolean; disabled?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '3px 0',
      fontFamily: FONT_MONO,
      fontSize: 11,
      opacity: disabled ? 0.5 : 1,
      color: checked ? C_FG : C_FG_MUTE,
    }}>
      <span>{checked ? '☑' : '☐'}</span>
      <span>{label}</span>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#a8aaa5', marginTop: 4 }}>
      {children}
    </div>
  );
}
