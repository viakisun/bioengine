// PAR Gauge — small top-right viewport overlay showing the instantaneous
// PAR + temperature at the current scrub position. Bars are normalised
// against typical greenhouse peaks; values are also printed numerically.

import { useTwinStore } from '../../store/twinStore';
import { parAtHour, tempAtHour, DEFAULT_CLIMATE } from '@farmsim/tomato-engine';
import { FONT_MONO, FONT_SANS, C_BORDER, C_FG, C_FG_MUTE, C_FG_DIM } from './styles';

const PAR_PEAK_REFERENCE = 1500;   // μmol/m²/s — typical greenhouse summer peak
const TEMP_RANGE = { min: 14, max: 32 };

export function PARGauge() {
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const fracHour = (minute % 1440) / 60;
  const par = parAtHour(DEFAULT_CLIMATE.daylight_hours, DEFAULT_CLIMATE.PAR_integral_mol, fracHour);
  const temp = tempAtHour(DEFAULT_CLIMATE.T_avg, fracHour);

  const parFrac = Math.min(1, par / PAR_PEAK_REFERENCE);
  const tempFrac = Math.min(1, Math.max(0, (temp - TEMP_RANGE.min) / (TEMP_RANGE.max - TEMP_RANGE.min)));

  const isDay = par > 1;
  const sunIcon = isDay ? '☀' : '☾';

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      right: 12,
      background: 'rgba(255, 255, 255, 0.92)',
      border: `1px solid ${C_BORDER}`,
      borderRadius: 4,
      padding: '10px 14px',
      fontFamily: FONT_SANS,
      fontSize: 11,
      color: C_FG,
      minWidth: 180,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 8,
        fontFamily: FONT_MONO,
      }}>
        <span style={{ color: C_FG_MUTE, fontSize: 10 }}>
          {String(Math.floor(fracHour)).padStart(2, '0')}:{String(Math.floor((fracHour % 1) * 60)).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 16, color: isDay ? '#ffba00' : '#647386' }}>{sunIcon}</span>
      </div>

      <Bar
        label="PAR"
        value={par.toFixed(0)}
        unit="μmol/m²/s"
        fraction={parFrac}
        color="#ffba00"
      />
      <Bar
        label="T"
        value={temp.toFixed(1)}
        unit="°C"
        fraction={tempFrac}
        color="#dc2626"
      />
    </div>
  );
}

function Bar({
  label, value, unit, fraction, color,
}: { label: string; value: string; unit: string; fraction: number; color: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: FONT_MONO,
        fontSize: 10,
        marginBottom: 2,
      }}>
        <span style={{ color: C_FG_MUTE }}>{label}</span>
        <span style={{ color: C_FG }}>
          <strong>{value}</strong> <span style={{ color: C_FG_DIM, fontSize: 9 }}>{unit}</span>
        </span>
      </div>
      <div style={{
        width: '100%',
        height: 4,
        background: 'rgba(0, 0, 0, 0.06)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${(fraction * 100).toFixed(1)}%`,
          height: '100%',
          background: color,
          transition: 'width 200ms ease',
        }} />
      </div>
    </div>
  );
}
