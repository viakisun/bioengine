import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useTwinStore } from './store/twinStore';
import { notify } from './store/notify';
import { createLogger, installDebugHelper } from './utils/logger';
import './ui/ui-kit.css';

const log = createLogger('ui');

// DevTools helper — DEV-only (window.__farmsim.debug)
if (import.meta.env.DEV) {
  installDebugHelper();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    __twinStore?: typeof useTwinStore;
    __debugScene?: import('@babylonjs/core/scene').Scene;
    __debugEngine?: import('./twin/BabylonEngine').BabylonEngineHandle;
  }
}

if (import.meta.env.DEV) {
  window.__twinStore = useTwinStore;
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

window.addEventListener('error', (e) => {
  log.error(`window.error: ${e.message}`, e.error);
  notify.error(e.message || '예기치 못한 오류', e.error instanceof Error ? e.error : e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  log.error('unhandledrejection', e.reason);
  const reason = e.reason;
  const title = reason instanceof Error
    ? `Unhandled Promise: ${reason.message}`
    : `Unhandled Promise: ${String(reason)}`;
  notify.error(title, reason instanceof Error ? reason : String(reason));
});

createRoot(root).render(<App />);
