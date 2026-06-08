// §19 phenotyping — Gimbal camera mini-viewport HUD overlay.
//
// Babylon `Scene.activeCameras = [main, gimbalCam]` 가 좌상단 384×288 영역에 gimbal cam
// 픽셀을 그린다 (BabylonEngine.ts). 본 컴포넌트는 그 영역에 border + label + REC dot +
// 좌표 표시 DOM overlay (pointer-events: none — 위로 클릭 통과).
//
// 위치는 Babylon Viewport (0.02, 0.62, 0.24, 0.32) 와 동일 percent — top/left/width/height
// 동일 비율로 설정.

import { useEffect, useState } from 'react';
import { useTwinStore } from '../state/twinStore';

interface GimbalViewProps {
  scenarioId: string;
}

export function GimbalView({ scenarioId }: GimbalViewProps) {
  // Robot rail X 좌표 — Babylon onBeforeRenderObservable에서 직접 update 안 함.
  //   대신 표시용으로 store 값 또는 시간 기반 추정. mvp는 클럭 — viewport 자체가
  //   실제 시점이므로 좌표는 informational만.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  // dir 추정 — Babylon에서 dir state 노출 안 함. 시간 기반 ping-pong 추정:
  //   주기 = 2 × 14m / 0.3 m/s = 93.3s. 시작 0초 = 좌→우 (+X 가는 방향).
  const periodMs = (2 * 14 / 0.3) * 1000;
  const phase = (Date.now() % periodMs) / periodMs; // 0~1
  const dirLabel = phase < 0.5 ? 'FORWARD' : 'RETURN';
  const sideLabel = phase < 0.5 ? 'LEFT BED' : 'RIGHT BED';

  // CameraDock(좌측 vertical column, width ~76px)과 수평 분리 — left 7% (1600 viewport=112px).
  //   Babylon viewport도 동일 좌표 (x=0.07, y=0.62, w=0.24, h=0.32)로 동기.
  return (
    <div
      style={{
        position: 'fixed',
        left: '7%',
        top: '6%',
        width: '24%',
        height: '32%',
        pointerEvents: 'none',
        zIndex: 900, // ValueChip(1000) 아래로
        border: '2px solid rgba(0,0,0,0.85)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        borderRadius: 2,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#eee',
        fontSize: 11,
        // 픽셀은 Babylon이 그림 — DOM은 border + 텍스트만
      }}
      aria-label="Gimbal camera viewport"
    >
      {/* Top bar — 시나리오 + REC */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '4px 8px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#ef4444',
            boxShadow: '0 0 6px rgba(239,68,68,0.8)',
            animation: 'gimbal-rec-blink 1s ease-in-out infinite',
          }}
        />
        <span style={{ fontWeight: 700, letterSpacing: '0.06em', fontSize: 10 }}>REC</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, opacity: 0.8 }}>GIMBAL CAM</span>
      </div>

      {/* Bottom bar — 시나리오 ID + 방향 + 좌표 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '4px 8px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
        }}
      >
        <span style={{ opacity: 0.85 }}>{scenarioId}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 700, color: phase < 0.5 ? '#34d399' : '#fbbf24' }}>
          {dirLabel}
        </span>
        <span style={{ opacity: 0.7 }}>·</span>
        <span style={{ opacity: 0.9 }}>{sideLabel}</span>
      </div>

      {/* CSS keyframes — REC blink */}
      <style>{`
        @keyframes gimbal-rec-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
