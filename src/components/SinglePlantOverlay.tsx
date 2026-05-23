// SinglePlantOverlay — analysis UI 만 GreenhouseLayout 의 canvas 위에
// overlay. Viewport 영역은 hole (canvas 가 그대로 보임).
//
// Phase 1 — 별도 Babylon engine 만들지 않음. GreenhouseScene 의 카메라/
// 라이팅/인프라/showcase plant 를 그대로 사용. supporting plants 만
// hide (BabylonEngine 의 mode 핸들러가 처리).
//
// Pointer-events 패턴:
//   - 컨테이너: pointer-events: none → viewport 영역이 자동으로 캔버스로
//     클릭 통과 (사용자가 카메라 회전 가능)
//   - 각 패널: pointer-events: auto → 패널 안에서는 정상 클릭

import { useEffect, useRef } from 'react';
import { useTwinStore } from '../store/twinStore';
import { ToolsPanel } from '../ui/single-plant/ToolsPanel';
import { InspectorPanel } from '../ui/single-plant/InspectorPanel';
import { TimelineChart } from '../ui/single-plant/TimelineChart';
import { TimelineSlider } from '../ui/single-plant/TimelineSlider';
import { StatusBar } from '../ui/single-plant/StatusBar';
import { PARGauge } from '../ui/single-plant/PARGauge';
import { FONT_SERIF, FONT_MONO, C_FG, C_FG_MUTE, C_BORDER } from '../ui/single-plant/styles';
import { SHOWCASE_SEED } from '../twin/GreenhouseScene';
import { getSinglePlantEngine, getSinglePlantShowcase } from '../ui/single-plant/useSinglePlantState';

function formatTopBarSimId(): string {
  return `cv=tomimaru-muchoo seed=${SHOWCASE_SEED}`;
}

export function SinglePlantOverlay() {
  const setMode = useTwinStore((s) => s.setMode);
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const speed = useTwinStore((s) => s.singlePlantSpeed);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);

  // Drive the live simulation as the user scrubs the timeline.
  // engineRef 는 BabylonEngine 의 buildGreenhouseScene 직후 등록됨.
  // 300ms+ 걸리는 작업만 corner spinner 표시 (debounce — 시작 시
  // setTimeout 으로 예약, 300ms 안에 끝나면 cancel).
  useEffect(() => {
    const engine = getSinglePlantEngine();
    if (!engine) return;
    const setBusy = useTwinStore.getState().setBusy;
    const showAt = window.setTimeout(() => setBusy(true, 'Simulating...'), 300);
    try {
      const physiology = engine.simulatePlantToMinute(SHOWCASE_SEED, minute);
      // Rebuild the ShowcasePlant visual using the TOMGRO physiology —
      // fruit color/size/ripening reflect the academic model rather
      // than the sigmoid placeholder (Phase 4).
      const showcase = getSinglePlantShowcase();
      if (showcase) {
        showcase.update(Math.floor(minute / 1440), physiology);
      }
    } finally {
      window.clearTimeout(showAt);
      setBusy(false);
    }
  }, [minute]);

  // Playback loop — rAF, scales minute by speed × elapsed
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const advance = dt * speed;
      const cur = useTwinStore.getState().singlePlantMinute;
      const next = cur + advance;
      if (next >= 120 * 24 * 60) {
        useTwinStore.getState().setSinglePlantPlaying(false);
        setMinute(120 * 24 * 60 - 1);
        return;
      }
      setMinute(next);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, speed, setMinute]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 40,
      pointerEvents: 'none',
      color: C_FG,
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto auto auto',
      gridTemplateColumns: '220px 1fr 340px',
      gridTemplateAreas: `
        "topbar topbar topbar"
        "tools viewport inspector"
        "chart chart chart"
        "slider slider slider"
        "status status status"
      `,
    }}>
      {/* Top bar */}
      <div style={{
        gridArea: 'topbar',
        padding: '10px 18px',
        borderBottom: `1px solid ${C_BORDER}`,
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        pointerEvents: 'auto',
      }}>
        <button
          type="button"
          onClick={() => setMode('lobby')}
          style={{
            background: 'none',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 3,
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: FONT_MONO,
            cursor: 'pointer',
            color: C_FG,
          }}
        >
          ◂ Lobby
        </button>
        <button
          type="button"
          onClick={() => setMode('greenhouse')}
          style={{
            background: 'none',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 3,
            padding: '4px 10px',
            fontSize: 11,
            fontFamily: FONT_MONO,
            cursor: 'pointer',
            color: C_FG,
          }}
        >
          ◂ Greenhouse
        </button>
        <span style={{ fontFamily: FONT_SERIF, fontSize: 16, fontWeight: 600 }}>
          Single-Plant Analysis
        </span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: C_FG_MUTE,
        }}>
          Sim: {formatTopBarSimId()} +M{minute.toFixed(0)}
        </span>
      </div>

      {/* Tools — interactive */}
      <div style={{ gridArea: 'tools', minHeight: 0, overflow: 'auto', pointerEvents: 'auto' }}>
        <ToolsPanel />
      </div>

      {/* Viewport hole — pointer-events: none so the canvas underneath
          receives camera-control clicks. PARGauge overlays here too. */}
      <div style={{ gridArea: 'viewport', position: 'relative', overflow: 'hidden' }}>
        <PARGauge />
      </div>

      {/* Inspector — interactive */}
      <div style={{ gridArea: 'inspector', minHeight: 0, overflow: 'auto', pointerEvents: 'auto' }}>
        <InspectorPanel />
      </div>

      {/* Timeline chart — interactive */}
      <div style={{ gridArea: 'chart', height: 180, minHeight: 0, overflow: 'hidden', pointerEvents: 'auto' }}>
        <TimelineChart />
      </div>

      {/* Timeline slider — interactive */}
      <div style={{ gridArea: 'slider', pointerEvents: 'auto' }}>
        <TimelineSlider />
      </div>

      {/* Status bar — interactive (not really clickable but consistent) */}
      <div style={{ gridArea: 'status', pointerEvents: 'auto' }}>
        <StatusBar />
      </div>
    </div>
  );
}
