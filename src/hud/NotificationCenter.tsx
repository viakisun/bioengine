// Live notification host — info (left-bottom toast, 4s auto-dismiss),
// warn (right-top banner, manual dismiss). Error notifications are
// rendered by ErrorModal instead.
//
// Reads `notifications` from twinStore. Hidden during boot — the
// BootOverlay's live-log panel shows info/warn entries there until the
// scene is 'ready'. Once ready, this center takes over.

import { useEffect, type CSSProperties } from 'react';
import { useTwinStore, type Notification } from '../state/twinStore';

const INFO_AUTO_DISMISS_MS = 4000;

function ToastCard({ n, onClose }: { n: Notification; onClose: () => void }) {
  useEffect(() => {
    if (n.level !== 'info') return;
    const id = window.setTimeout(onClose, INFO_AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [n.level, n.id, onClose]);

  const isWarn = n.level === 'warn';
  const style: CSSProperties = {
    background: isWarn ? 'var(--warn-soft)' : 'var(--bg-panel-solid)',
    border: `1px solid ${isWarn ? 'var(--warn)' : 'var(--bd)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    fontSize: 12,
    color: 'var(--fg)',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
    maxWidth: 360,
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  };

  return (
    <div style={style}>
      <span style={{ fontSize: 14, color: isWarn ? 'var(--warn)' : 'var(--accent)', marginTop: 1 }}>
        {isWarn ? '⚠' : 'ℹ'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>{n.title}</div>
        {n.body && <div style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 2 }}>{n.body}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--fg-mute)',
          cursor: 'pointer',
          padding: 0,
          fontSize: 14,
          lineHeight: 1,
        }}
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const notifications = useTwinStore((s) => s.notifications);
  const bootReady = useTwinStore((s) => s.boot.currentStage === 'ready');
  const dismiss = useTwinStore((s) => s.dismissNotification);

  // Suppress during boot — the BootOverlay's live log already shows
  // them. Once 'ready', this center starts rendering toasts.
  if (!bootReady) return null;

  const visible = notifications.filter((n) => !n.dismissed && n.level !== 'error');
  const infos = visible.filter((n) => n.level === 'info');
  const warns = visible.filter((n) => n.level === 'warn');

  return (
    <>
      {/* Info — bottom-left stack, 4s auto-dismiss */}
      <div style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 950,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 8,
        pointerEvents: 'auto',
      }}>
        {infos.map((n) => (
          <ToastCard key={n.id} n={n} onClose={() => dismiss(n.id)} />
        ))}
      </div>

      {/* Warn — top-right stack, manual dismiss */}
      <div style={{
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 950,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'auto',
      }}>
        {warns.map((n) => (
          <ToastCard key={n.id} n={n} onClose={() => dismiss(n.id)} />
        ))}
      </div>
    </>
  );
}
