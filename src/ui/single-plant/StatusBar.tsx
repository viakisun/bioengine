// StatusBar — bottom strip with engine info + key academic indicator.
// Pulls from twinStore.boot.env + the live PlantPhysiologyState.

import { useTwinStore } from '../../store/twinStore';
import { MODEL_BACKBONE_LABEL } from '../../data/references';
import { FONT_MONO, C_BORDER, C_FG_MUTE, C_FG } from './styles';
import { useSinglePlantState } from './useSinglePlantState';

export function StatusBar() {
  const env = useTwinStore((s) => s.boot.env);
  const state = useSinglePlantState();
  const counters = env.counters;

  return (
    <div style={{
      borderTop: `1px solid ${C_BORDER}`,
      padding: '6px 16px',
      background: 'rgba(0, 0, 0, 0.02)',
      fontFamily: FONT_MONO,
      fontSize: 10,
      color: C_FG_MUTE,
      display: 'flex',
      gap: 16,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      <span>Engine: <strong style={{ color: C_FG }}>{env.backend.toUpperCase()}</strong></span>
      <span>{env.gpuDevice || '—'}</span>
      <span>{counters.meshes.toLocaleString()} meshes</span>
      <span>{(counters.triangles / 1000).toFixed(0)}K tris</span>
      {counters.memoryMB != null && <span>{counters.memoryMB} MB</span>}
      {state && (
        <>
          <span style={{ marginLeft: 'auto', color: C_FG }}>
            TT <strong>{state.TT.toFixed(1)}</strong> °C·d
          </span>
          <span style={{ color: C_FG }}>
            LAI <strong>{state.LAI.toFixed(2)}</strong>
          </span>
        </>
      )}
      <span style={{ color: C_FG_MUTE }}>{MODEL_BACKBONE_LABEL}</span>
    </div>
  );
}
