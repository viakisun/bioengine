// React error boundary — catches descendant render/lifecycle errors and
// forwards them to the notification store. The store-driven ErrorModal
// then renders the user-visible alert.
//
// Fallback UI is inline-styled (no CSS-module dependency) so that even
// if the failing component is in src/ui/, the fallback still renders.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { notify } from '../store/notify';
import { createLogger } from '../utils/logger';

const log = createLogger('ui');

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('UI 컴포넌트 크래시', error, info.componentStack);
    notify.error(
      'UI 컴포넌트 크래시',
      error,
    );
  }

  render() {
    if (this.state.hasError) {
      // Minimal inline fallback — keeps the page alive so ErrorModal
      // can still render the user-facing alert.
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#f8f7f3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1a1d1a',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
        }}>
          <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>UI 가 응답하지 않습니다.</div>
            <div style={{ color: '#5a615a', marginBottom: 16 }}>
              {this.state.error?.message ?? '알 수 없는 오류'}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
