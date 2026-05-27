// Iter 20 PR 6 — keyboard hotkey for the petiole-stem junction overlay.
// 'd' / 'D' (English) and 'ㅇ' (Korean — same physical key on 2벌식) all toggle.
// Idempotent: install only once per window.

type DockingApi = (opts: {
  enable: boolean;
  edgeTypes?: string[];
  focus?: 'stem-junction' | 'all';
  labelMode?: 'all' | 'worst' | 'none';
  worstN?: number;
}) => void;

const TRIGGER_KEYS = new Set(['d', 'D', 'ㅇ']);

let installed = false;
let enabled = false;

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
    if (!TRIGGER_KEYS.has(e.key)) return;

    const api = (window as unknown as { __dockingOverlay?: DockingApi }).__dockingOverlay;
    if (!api) {
      console.warn('[dockingOverlay.hotkey] __dockingOverlay not yet ready');
      return;
    }
    enabled = !enabled;
    api({ enable: enabled });
    console.log(`[dockingOverlay.hotkey] '${e.key}' → ${enabled ? 'ON' : 'OFF'}`);
  });
}
