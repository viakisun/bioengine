// App — top-level routing. Mounts the boot/notify overlays + the active
// mode's layout.
//
// Iter 35: single-plant mode 단일. lobby/greenhouse/robot/sandbox archived.
// GreenhouseLayout (deprecated 이름 — Phase G에서 SinglePlantApp으로 rename
// 예정)는 첫 진입 후 영구 마운트되어 dispose 안 됨. SinglePlantOverlay가
// 위에 분석 UI overlay.

import { GreenhouseLayout } from './components/GreenhouseLayout';
import { SinglePlantOverlay } from './components/SinglePlantOverlay';
import { BootOverlay } from './ui/BootOverlay';
import { NotificationCenter } from './ui/NotificationCenter';
import { ErrorModal } from './ui/ErrorModal';
import { ErrorBoundary } from './ui/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      {/* Boot overlay — hasEverReached false일 때만 풀스크린 (BootOverlay 내부 처리). */}
      <BootOverlay />
      <NotificationCenter />
      <ErrorModal />

      {/* GreenhouseLayout — single-plant scene host (단일 mode이므로 항상 mount). */}
      <GreenhouseLayout />

      {/* Single-plant overlay — canvas 위에 분석 UI */}
      <SinglePlantOverlay />
    </ErrorBoundary>
  );
}
