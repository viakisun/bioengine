import { createLogger } from '../../utils/logger';
const log = createLogger('overlay');

// Iter 20 PR 6 — keyboard hotkey for the petiole-stem junction overlay.
// 'd' / 'D' (English) and 'ㅇ' (Korean — same physical key on 2벌식) all toggle.
// Iter 25+: 'l' / 'L' / 'ㅣ' for leaf wireframe debug.
// Idempotent: install only once per window.

type DockingApi = (opts: {
  enable: boolean;
  edgeTypes?: string[];
  focus?: 'stem-junction' | 'all';
  labelMode?: 'all' | 'worst' | 'none';
  worstN?: number;
}) => void;

type LeafWireApi = (enable: boolean) => void;

const DOCKING_KEYS = new Set(['d', 'D', 'ㅇ']);
const LEAF_WIRE_KEYS = new Set(['l', 'L', 'ㅣ']);

let installed = false;
let dockingEnabled = false;
let leafWireEnabled = false;

export function installDockingOverlayHotkey(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    // Ignore when typing in input/textarea/contenteditable.
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (DOCKING_KEYS.has(e.key)) {
      const api = (window as unknown as { __dockingOverlay?: DockingApi }).__dockingOverlay;
      if (!api) {
        log.warn('__dockingOverlay not yet ready');
        return;
      }
      dockingEnabled = !dockingEnabled;
      api({ enable: dockingEnabled });
      log.info(`dockingOverlay: ${dockingEnabled ? 'ON' : 'OFF'} ('${e.key}')`);
      return;
    }

    if (LEAF_WIRE_KEYS.has(e.key)) {
      const api = (window as unknown as { __leafWireframe?: LeafWireApi }).__leafWireframe;
      if (!api) {
        log.warn('__leafWireframe not yet ready');
        return;
      }
      leafWireEnabled = !leafWireEnabled;
      api(leafWireEnabled);
      log.info(`leafWireframe: ${leafWireEnabled ? 'ON' : 'OFF'} ('${e.key}')`);
      return;
    }
  });
}
