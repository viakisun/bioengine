// App — top-level routing. Mounts the boot/notify overlays + the active
// mode's layout.
//
// Phase 1 of plan a-drifting-wigderson.md introduces persistent-mount
// pattern: GreenhouseLayout 은 *처음 모드 진입 후* 영구 마운트되어
// supporting plant + 인프라가 dispose 안 됨. lobby 진입 시에는 hide
// (display:none) 만 — render tick 은 BabylonEngine 안에서 early-return
// 으로 idle. single-plant 진입 시에는 GreenhouseLayout 위에
// SinglePlantOverlay 가 추가 마운트되어 분석 UI 만 overlay.

import { useEffect, useState } from 'react';
import { GreenhouseLayout } from './components/GreenhouseLayout';
import { SinglePlantOverlay } from './components/SinglePlantOverlay';
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

  // GreenhouseLayout 은 첫 모드 진입 후 *영구 마운트*. lobby 복귀 시
  // display:none 으로 hide 만. 재진입 시 Babylon 재부팅 없음.
  const [greenhouseMounted, setGreenhouseMounted] = useState(false);
  useEffect(() => {
    if (mode === 'greenhouse' || mode === 'single-plant') {
      setGreenhouseMounted(true);
    }
  }, [mode]);

  // Keep store.mode in sync with URL hash changes (back/forward, manual edit).
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

  const isLobby = mode === 'lobby';

  return (
    <ErrorBoundary>
      {/* Boot overlay 는 hasEverReached 가 false 일 때만 (Phase 2 에서 처리).
          현재는 mode 가 greenhouse 또는 single-plant 일 때만 표시. */}
      {(mode === 'greenhouse' || mode === 'single-plant') && <BootOverlay />}
      <NotificationCenter />
      <ErrorModal />

      {/* GreenhouseLayout — 첫 모드 진입 후 영구 마운트. lobby 일 때 hide. */}
      {greenhouseMounted && (
        <div style={{ display: isLobby ? 'none' : 'contents' }}>
          <GreenhouseLayout />
        </div>
      )}

      {/* Lobby 와 Coming Soon 은 standalone 컴포넌트 */}
      {isLobby && <ModeLobby />}
      {mode === 'robot' && <ComingSoonPanel mode="robot" />}
      {mode === 'sandbox' && <ComingSoonPanel mode="sandbox" />}

      {/* Single-plant overlay — GreenhouseLayout 의 canvas 위에 분석 UI */}
      {mode === 'single-plant' && <SinglePlantOverlay />}
    </ErrorBoundary>
  );
}
