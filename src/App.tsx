// App — top-level routing. Mounts the boot/notify overlays + the active
// mode's layout. Modes are exclusive (only one scene mounted at a time)
// so Babylon engines and heavy state don't leak across switches.

import { useEffect } from 'react';
import { GreenhouseLayout } from './components/GreenhouseLayout';
import { ModeLobby } from './ui/ModeLobby';
import { ComingSoonPanel } from './ui/ComingSoonPanel';
import { BootOverlay } from './ui/BootOverlay';
import { NotificationCenter } from './ui/NotificationCenter';
import { ErrorModal } from './ui/ErrorModal';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { useTwinStore, type AppMode } from './store/twinStore';

const VALID_MODES: AppMode[] = ['lobby', 'greenhouse', 'single-plant', 'robot', 'sandbox'];

export function App() {
  const mode = useTwinStore((s) => s.mode);
  const setMode = useTwinStore((s) => s.setMode);

  // Keep store.mode in sync with URL hash changes (back/forward, manual
  // edit). twinStore.setMode writes the hash; this listener catches the
  // reverse direction.
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, '');
      const next = (VALID_MODES as string[]).includes(h) ? (h as AppMode) : 'lobby';
      if (next !== useTwinStore.getState().mode) {
        setMode(next);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setMode]);

  // Modes that mount a Babylon scene — only these need the BootOverlay.
  // Lobby / robot / sandbox are plain DOM, no engine to wait for.
  const needsBootOverlay = mode === 'greenhouse' || mode === 'single-plant';

  return (
    <ErrorBoundary>
      {/* Boot overlay only for engine-backed modes. NotificationCenter +
          ErrorModal always mounted so messages survive a mode switch. */}
      {needsBootOverlay && <BootOverlay />}
      <NotificationCenter />
      <ErrorModal />

      {mode === 'lobby' && <ModeLobby />}
      {mode === 'greenhouse' && <GreenhouseLayout />}
      {mode === 'single-plant' && <SinglePlantPlaceholder />}
      {mode === 'robot' && <ComingSoonPanel mode="robot" />}
      {mode === 'sandbox' && <ComingSoonPanel mode="sandbox" />}
    </ErrorBoundary>
  );
}

/** Phase C 도착 전까지 임시 — 1그루 씬 자체는 다음 단계에서 추가. */
function SinglePlantPlaceholder() {
  return <ComingSoonPanel mode="single-plant" />;
}
