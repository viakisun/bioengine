// Instrument Workstation — Robot Transport Dock (bottom-left of viewport)
//
// Replaces the bottom controls strip that used to live inside GimbalView.
// Play / Stop / AUTO + Rail X slider + Speed slider + hotkey hint.
//
// State source: twinStore.robot + module-scope railRef (60fps, no re-render).

import { useEffect, useRef } from 'react';
import { useTwinStore } from '../../state/twinStore';
import { railRef, setRail } from '../../scene/robot/robotControlState';

interface RobotTransportProps {
  /** Phenotyping survey controls. Caller wires these to surveyRunner. */
  surveyControls?: {
    status: 'idle' | 'running' | 'paused' | 'done';
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onReset: () => void;
  };
}

export function RobotTransport({ surveyControls }: RobotTransportProps = {}) {
  const mode = useTwinStore((s) => s.robot.mode);
  const speedMps = useTwinStore((s) => s.robot.speedMps);
  const setRobotMode = useTwinStore((s) => s.setRobotMode);
  const setRobotSpeed = useTwinStore((s) => s.setRobotSpeed);

  // Slider DOM refs — drive thumb position from railRef via RAF (controlled-X)
  const railSliderRef = useRef<HTMLInputElement>(null);
  const railLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = railSliderRef.current;
      const lab = railLabelRef.current;
      if (s && document.activeElement !== s) s.value = String(railRef.current);
      if (lab) lab.textContent = `${railRef.current >= 0 ? '+' : ''}${railRef.current.toFixed(2)} m`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const range = railRef.rangeM;
  const playing = mode !== 'paused';
  const playGlyph = playing ? '❚❚' : '▶';

  return (
    <div style={wrapS}>
      {/* Row 1: transport buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11 }}>
        <button
          onClick={() => setRobotMode(mode === 'paused' ? 'auto' : 'paused')}
          style={playBtnS}
          title={mode === 'paused' ? 'Play (Space)' : 'Pause (Space)'}
        >
          {playGlyph}
        </button>
        <button
          onClick={() => { setRail(0); setRobotMode('paused'); }}
          style={squareBtnS}
          title="Stop + reset position"
        >■</button>
        <button
          onClick={() => setRobotMode('auto')}
          style={autoBtnS(mode === 'auto')}
        >AUTO</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setRail(0)} style={ghostBtnS} title="Reset rail X">reset</button>
      </div>

      {/* Row 1b: Phenotyping survey button (only when controls wired) */}
      {surveyControls && (
        <div style={{ marginBottom: 11 }}>
          {surveyControls.status === 'idle' && (
            <button onClick={surveyControls.onStart} style={surveyPrimaryBtnS}>
              ▶ START SURVEY
            </button>
          )}
          {surveyControls.status === 'running' && (
            <button onClick={surveyControls.onPause} style={surveySecondaryBtnS}>
              ❚❚ PAUSE SURVEY
            </button>
          )}
          {surveyControls.status === 'paused' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={surveyControls.onResume} style={{ ...surveyPrimaryBtnS, flex: 1 }}>
                ▶ RESUME
              </button>
              <button onClick={surveyControls.onReset} style={surveySecondaryBtnS}>
                ⟲
              </button>
            </div>
          )}
          {surveyControls.status === 'done' && (
            <button onClick={surveyControls.onReset} style={surveySecondaryBtnS}>
              ⟲ NEW RUN
            </button>
          )}
        </div>
      )}

      {/* Row 2: Rail X */}
      <div style={labelRowS}>
        <span style={{ color: 'var(--iw-fg-mute)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>RAIL&nbsp;X</span>
        <span ref={railLabelRef} style={{ color: 'var(--iw-fg-hi)' }}>+0.00 m</span>
      </div>
      <input
        ref={railSliderRef}
        type="range"
        className="iw-range"
        min={-range}
        max={range}
        step={0.05}
        defaultValue={0}
        onInput={(e) => {
          setRail(Number((e.target as HTMLInputElement).value));
          if (useTwinStore.getState().robot.mode !== 'manual') setRobotMode('manual');
        }}
        style={{ width: '100%', marginBottom: 11 }}
      />

      {/* Row 3: Speed */}
      <div style={labelRowS}>
        <span style={{ color: 'var(--iw-fg-mute)', letterSpacing: '0.06em' }}>SPEED</span>
        <span style={{ color: 'var(--iw-fg-hi)' }}>{speedMps.toFixed(2)} m/s</span>
      </div>
      <input
        type="range"
        className="iw-range"
        min={0}
        max={1}
        step={0.01}
        value={speedMps}
        onChange={(e) => setRobotSpeed(Number(e.currentTarget.value))}
        style={{ width: '100%' }}
      />

      <div style={hintS}>space=play · A/D=±5cm · drag=look · dbl-click=reset</div>
    </div>
  );
}

const wrapS: React.CSSProperties = {
  position: 'fixed',
  bottom: 64,
  left: 76,
  zIndex: 1050,
  width: 300,
  background: 'rgba(13,16,20,0.94)',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 9,
  padding: '11px 12px',
  fontFamily: 'var(--iw-font-mono)',
};

const playBtnS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 6,
  background: 'var(--iw-accent)',
  color: '#06070a',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};

const squareBtnS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  borderRadius: 6,
  background: 'var(--iw-bg-3)',
  color: 'var(--iw-fg-dim)',
  border: '1px solid var(--iw-line-2)',
  cursor: 'pointer',
  fontSize: 11,
};

const autoBtnS = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: active ? '#06070a' : 'var(--iw-accent)',
  background: active ? 'var(--iw-accent)' : 'var(--iw-accent-soft)',
  border: `1px solid ${active ? 'var(--iw-accent)' : 'var(--iw-accent-line)'}`,
  borderRadius: 6,
  height: 30,
  padding: '0 12px',
  cursor: 'pointer',
});

const ghostBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 10,
  color: 'var(--iw-fg-dim)',
  background: 'transparent',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 6,
  height: 30,
  padding: '0 12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const labelRowS: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 10,
  color: 'var(--iw-fg-dim)',
  marginBottom: 5,
};

const hintS: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--iw-fg-faint)',
  marginTop: 9,
  letterSpacing: '0.02em',
};

const surveyPrimaryBtnS: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#06070a',
  background: 'var(--iw-accent)',
  border: '1px solid var(--iw-accent)',
  borderRadius: 6,
  height: 30,
  cursor: 'pointer',
};

const surveySecondaryBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--iw-accent)',
  background: 'var(--iw-accent-soft)',
  border: '1px solid var(--iw-accent-line)',
  borderRadius: 6,
  height: 30,
  padding: '0 14px',
  cursor: 'pointer',
};
