// Fatal-error modal — center-of-screen, blocks interaction. Shows the
// first un-dismissed error from twinStore.notifications. The only
// recovery path is "새로고침" (full page reload) because we have no way
// to safely re-enter the Babylon boot sequence after a crash.

import { useState, type CSSProperties } from 'react';
import { useTwinStore } from '../state/twinStore';

export function ErrorModal() {
  const notifications = useTwinStore((s) => s.notifications);
  const dismiss = useTwinStore((s) => s.dismissNotification);
  const [showStack, setShowStack] = useState(false);

  const error = notifications.find((n) => n.level === 'error' && !n.dismissed);
  if (!error) return null;

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  };

  const cardStyle: CSSProperties = {
    background: 'var(--bg-panel-solid)',
    border: '1px solid var(--bd-strong)',
    borderRadius: 'var(--radius)',
    padding: '24px 28px',
    maxWidth: 560,
    width: '100%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
    color: 'var(--fg)',
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22, color: 'var(--bad)' }}>✕</span>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{error.title}</h2>
        </div>
        {error.body && (
          <div style={{ fontSize: 13, color: 'var(--fg-mute)', marginBottom: 16, lineHeight: 1.55 }}>
            {error.body}
          </div>
        )}
        {error.stack && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setShowStack((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--fg-mute)',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              {showStack ? '스택 숨기기' : '스택 트레이스 보기'}
            </button>
            {showStack && (
              <pre style={{
                marginTop: 8,
                background: 'var(--bg-softer)',
                padding: 10,
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 10,
                lineHeight: 1.5,
                overflow: 'auto',
                maxHeight: 200,
                color: 'var(--fg-mute)',
              }}>{error.stack}</pre>
            )}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={() => dismiss(error.id)}
            style={{
              background: 'var(--bg-softer)',
              border: '1px solid var(--bd)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--fg)',
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: 'var(--bad)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              fontSize: 12,
              cursor: 'pointer',
              color: 'white',
              fontWeight: 600,
            }}
          >
            새로고침
          </button>
        </div>
      </div>
    </div>
  );
}
