// App — top-level routing. Mounts the boot/notify overlays + the active
// mode's layout.
//
// Iter 35: single-plant mode 단일. lobby/greenhouse/robot/sandbox archived.
// SinglePlantApp (구 GreenhouseLayout, Phase Q3 rename) 첫 진입 후 영구
// 마운트되어 dispose 안 됨. SinglePlantOverlay가 위에 분석 UI overlay.

import { SinglePlantApp } from './SinglePlantApp';
import { SinglePlantOverlay } from '../hud/SinglePlantOverlay';
import { BootOverlay } from '../hud/BootOverlay';
import { NotificationCenter } from '../hud/NotificationCenter';
import { ErrorModal } from '../hud/ErrorModal';
import { ErrorBoundary } from '../hud/ErrorBoundary';
// ★ L9-D V2 — Outline debug panel (?outlineDebug=1)
import { LeafOutlineDebugPanel } from '../dev/LeafOutlineDebugPanel';

const outlineDebug = typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('outlineDebug') === '1';

export function App() {
  return (
    <ErrorBoundary>
      {/* Boot overlay — hasEverReached false일 때만 풀스크린 (BootOverlay 내부 처리). */}
      <BootOverlay />
      <NotificationCenter />
      <ErrorModal />

      {/* SinglePlantApp — single-plant scene host (단일 mode이므로 항상 mount). */}
      <SinglePlantApp />

      {/* Single-plant overlay — canvas 위에 분석 UI */}
      <SinglePlantOverlay />

      {/* ★ Outline debug panel (?outlineDebug=1) */}
      {outlineDebug && <LeafOutlineDebugPanel />}
    </ErrorBoundary>
  );
}
