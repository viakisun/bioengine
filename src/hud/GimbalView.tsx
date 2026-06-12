// Instrument Workstation — Gimbal Camera PiP (top-left of viewport stage)
//
// Babylon renders the gimbal cam pixels into this region (see BabylonEngine
// gimbalCam.viewport). This component draws the PiP frame (REC + label), and
// hosts drag-to-look pan/pitch.
//
// Transport controls (▶/⏸/⏹/AUTO + Rail/Speed sliders + hotkeys) live in the
// separate <RobotTransport /> dock, no longer here.

import { useEffect, useRef } from 'react';
import { useTwinStore } from '../state/twinStore';
import { nudgeRail, syncGimbalViewportToRect, gimbalCamRef } from '../scene/robot/robotControlState';

interface GimbalViewProps {
  scenarioId: string;
}

const SENS_PAN = Math.PI / 200;
const SENS_PITCH = Math.PI / 400;
const NUDGE_M = 0.05;

export function GimbalView({ scenarioId }: GimbalViewProps) {
  const mode = useTwinStore((s) => s.robot.mode);
  const manualOverride = useTwinStore((s) => s.robot.gimbal.manualOverride);
  const setRobotMode = useTwinStore((s) => s.setRobotMode);
  const nudgeGimbal = useTwinStore((s) => s.nudgeGimbal);
  const resetGimbal = useTwinStore((s) => s.resetGimbal);

  // Drag state
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number; pointerId: number | null }>({
    active: false, lastX: 0, lastY: 0, pointerId: null,
  });
  // Frame ref — used to sync Babylon gimbal cam viewport to DOM rect
  const frameRef = useRef<HTMLDivElement>(null);

  // Babylon gimbal cam viewport ↔ DOM video panel sync
  //   - GimbalView mounts before BabylonEngine boot completes, so gimbalCamRef
  //     is null at first. We poll every 100ms until cam is registered, then
  //     hand off to ResizeObserver for ongoing layout changes.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        syncGimbalViewportToRect({ left: r.left, top: r.top, width: r.width, height: r.height });
      }
    };
    // Poll until cam is registered (Babylon boot async ~2-5s).
    let pollId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const pollSync = () => {
      update();
      if (gimbalCamRef.current) return; // cam exists — sync took effect
      if (attempts++ > 100) return;     // 10s budget — give up after that
      pollId = setTimeout(pollSync, 100);
    };
    pollSync();
    // Steady-state observers (resize, scroll, inspector collapse, etc).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      if (pollId) clearTimeout(pollId);
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, []);

  // Keyboard — Space=pause toggle, A/D=manual nudge
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        const cur = useTwinStore.getState().robot.mode;
        setRobotMode(cur === 'paused' ? 'auto' : 'paused');
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        nudgeRail(-NUDGE_M);
        if (useTwinStore.getState().robot.mode !== 'manual') setRobotMode('manual');
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        nudgeRail(+NUDGE_M);
        if (useTwinStore.getState().robot.mode !== 'manual') setRobotMode('manual');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setRobotMode]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, pointerId: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    e.stopPropagation();
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    if (dx !== 0 || dy !== 0) nudgeGimbal(dx * SENS_PAN, -dy * SENS_PITCH);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    e.stopPropagation();
    dragRef.current.active = false;
    if (dragRef.current.pointerId !== null) {
      try { (e.target as HTMLElement).releasePointerCapture(dragRef.current.pointerId); } catch { /* */ }
      dragRef.current.pointerId = null;
    }
  };
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    resetGimbal();
  };

  const modeColor = mode === 'auto' ? 'var(--iw-ok)' : mode === 'paused' ? 'var(--iw-warn)' : 'var(--iw-accent)';
  const modeLabel = mode.toUpperCase();

  return (
    <div style={pipS}>
      {/* Outer frame — dark chrome wrapping the 3 stacked panels */}
      <div style={outerS}>

        {/* (1) Top label row — REC + GIMBAL CAM (separate row, not overlay) */}
        <div style={topRowS}>
          <span className="iw-mono" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--iw-fg-hi)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--iw-err)', animation: 'iw-recblink 1.6s infinite' }} />
            REC
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {manualOverride && (
              <span className="iw-mono" style={{ fontSize: 9, color: 'var(--iw-warn)', fontWeight: 600 }}>MANUAL</span>
            )}
            <span className="iw-mono" style={{ color: 'var(--iw-fg-mid)' }}>GIMBAL CAM</span>
          </span>
        </div>

        {/* (2) Inner video panel — Babylon viewport syncs to THIS rect only */}
        <div ref={frameRef} style={videoPanelS}>
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', touchAction: 'none', cursor: 'grab' }}
            aria-label="Drag to rotate gimbal, double-click to reset"
          />
        </div>

        {/* (3) Bottom status row — scenario + mode */}
        <div style={bottomRowS}>
          <span className="iw-mono" style={{ color: 'var(--iw-fg-mute)' }}>{scenarioId}</span>
          <span className="iw-mono" style={{ color: modeColor, fontWeight: 600 }}>{modeLabel}</span>
        </div>

      </div>
    </div>
  );
}

// ─── styles ─────────────────────────────────────
const pipS: React.CSSProperties = {
  position: 'fixed',
  top: 58,
  left: 74,
  width: 472,        // 2× width
  zIndex: 1020,
  pointerEvents: 'none',
};

const outerS: React.CSSProperties = {
  background: 'transparent',            // ← video panel 영역까지 dark fill 되지 않도록
  border: '1px solid var(--iw-line-3)',
  borderRadius: 9,
  overflow: 'hidden',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
};

const topRowS: React.CSSProperties = {
  height: 28,
  flex: '0 0 28px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 12px',
  borderBottom: '1px solid var(--iw-line-1)',
  background: 'var(--iw-bg-2)',
  fontSize: 11,
  pointerEvents: 'none',
};

const videoPanelS: React.CSSProperties = {
  position: 'relative',
  flex: '0 0 276px',
  height: 276,                         // 2× height — video area only
  background: 'transparent',           // Babylon shows through here
};

const bottomRowS: React.CSSProperties = {
  height: 28,
  flex: '0 0 28px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 12px',
  borderTop: '1px solid var(--iw-line-1)',
  background: 'var(--iw-bg-2)',
  fontSize: 11,
  pointerEvents: 'none',
};
