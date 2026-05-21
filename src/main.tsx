import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useTwinStore } from './store/twinStore';
import './ui/ui-kit.css';

if (import.meta.env.DEV) {
  (window as unknown as { __twinStore: typeof useTwinStore }).__twinStore = useTwinStore;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Window {
    __debugScene?: import('@babylonjs/core/scene').Scene;
    __debugEngine?: import('./twin/BabylonEngine').BabylonEngineHandle;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

window.addEventListener('error', (e) => {
  console.error('[window.error]', e.message, e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason);
});

createRoot(root).render(<App />);
