// Instrument Workstation — Auto-dismiss toast (top-right, under header)
//
// Shows once per session. Drives from twinStore.shellToast.

import { useEffect } from 'react';
import { useTwinStore } from '../../state/twinStore';

const AUTO_DISMISS_MS = 5500;

export function Toast() {
  const toast = useTwinStore((s) => s.shellToast);
  const dismiss = useTwinStore((s) => s.dismissShellToast);
  const statsOpen = useTwinStore((s) => s.statsOpen);

  useEffect(() => {
    if (!toast.visible) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.visible, dismiss]);

  if (!toast.visible || toast.kind == null) return null;

  // Push below stats HUD if it's open
  const topPx = statsOpen ? 188 : 58;

  let label = 'INFO';
  let msg = '';
  if (toast.kind === 'webgpu') {
    label = 'WEBGPU';
    msg = 'SSAO · DOF · God Rays · Lens Flare disabled on this backend (Babylon WebGPU).';
  } else {
    label = 'INFO';
    msg = '—';
  }

  return (
    <div style={{ ...wrapS, top: topPx }}>
      <span className="iw-mono" style={{ color: 'var(--iw-warn)', fontSize: 10, marginTop: 1 }}>{label}</span>
      <span style={{ color: 'var(--iw-fg-mid)', lineHeight: 1.45, flex: 1 }}>{msg}</span>
      <button onClick={dismiss} style={closeBtnS} aria-label="dismiss">×</button>
    </div>
  );
}

const wrapS: React.CSSProperties = {
  position: 'fixed',
  right: 12,
  zIndex: 1080,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  fontSize: 11,
  background: 'rgba(14,17,21,0.94)',
  border: '1px solid rgba(216,166,41,0.35)',
  borderLeft: '2px solid var(--iw-warn)',
  borderRadius: 7,
  padding: '9px 11px',
  maxWidth: 280,
  animation: 'iw-toastin 0.25s ease',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  transition: 'top 0.2s',
  fontFamily: 'var(--iw-font-ui)',
};

const closeBtnS: React.CSSProperties = {
  color: 'var(--iw-fg-mute)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  padding: 0,
};
