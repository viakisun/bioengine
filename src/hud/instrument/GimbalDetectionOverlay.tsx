// Phenotyping survey v2 — Live detection overlay for the gimbal PiP.
//
// Each frame, projects every live detection's world position through the
// gimbal camera's view-projection matrix.  In-frustum detections get a
// color-coded SVG circle drawn over the PiP video panel, with the bin
// label/confidence as a hover tooltip.
//
// Mount inside GimbalView's video panel (absolute, inset:0, pointer-events:
// none so it doesn't block drag-to-look).

import { useEffect, useState } from 'react';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { useTwinStore } from '../../state/twinStore';
import { gimbalCamRef } from '../../scene/robot/robotControlState';

type RipenessBin = 'green' | 'breaker' | 'turning' | 'pink' | 'red';

const BIN_COLOR: Record<RipenessBin, string> = {
  green:   '#34d399',
  breaker: '#fbbf24',
  turning: '#f59e0b',
  pink:    '#f87171',
  red:     '#ef4444',
};

interface ProjectedDet {
  x: number;  // 0..1 within panel
  y: number;
  bin: RipenessBin;
  confidence: number;
  distance: number;
}

export function GimbalDetectionOverlay() {
  const detections = useTwinStore((s) => s.phenotypingSurvey.liveDetections);
  const [projected, setProjected] = useState<ProjectedDet[]>([]);

  // RAF loop — re-project each frame as camera moves.
  // Don't subscribe to render observable (we render via React state).
  useEffect(() => {
    if (detections.length === 0) {
      setProjected([]);
      return;
    }
    let rafId = 0;
    const tmpWorld = new Vector3();
    const tmpVp = new Matrix();
    const projViewport = new Viewport(0, 0, 1, 1);
    const tick = () => {
      const cam = gimbalCamRef.current;
      if (cam) {
        cam.getViewMatrix().multiplyToRef(cam.getProjectionMatrix(), tmpVp);
        const camWorld = cam.globalPosition ?? cam.position;
        const out: ProjectedDet[] = [];
        for (const d of detections) {
          tmpWorld.set(d.worldX, d.worldY, d.worldZ);
          // viewport in 0..1 — we render in % below
          const ndc = Vector3.Project(
            tmpWorld,
            Matrix.Identity(),
            tmpVp,
            projViewport,
          );
          // ndc.z > 1 → behind near plane. Skip.
          if (ndc.z < 0 || ndc.z > 1) continue;
          if (ndc.x < -0.05 || ndc.x > 1.05 || ndc.y < -0.05 || ndc.y > 1.05) continue;
          const dist = Vector3.Distance(camWorld, tmpWorld);
          out.push({
            x: ndc.x,
            y: ndc.y,
            bin: d.bin,
            confidence: d.confidence,
            distance: dist,
          });
        }
        setProjected(out);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [detections]);

  if (projected.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {projected.map((p, i) => {
        const r = Math.max(0.8, Math.min(3, 8 / Math.max(0.5, p.distance)));
        const color = BIN_COLOR[p.bin];
        return (
          <g key={i}>
            <circle
              cx={p.x * 100}
              cy={p.y * 100}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={0.4}
              opacity={0.4 + p.confidence * 0.6}
            />
            <circle
              cx={p.x * 100}
              cy={p.y * 100}
              r={0.3}
              fill={color}
              opacity={p.confidence}
            />
          </g>
        );
      })}
    </svg>
  );
}
