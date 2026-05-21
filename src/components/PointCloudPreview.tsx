import { useMemo } from 'react';
import type { CaptureSession } from '../data/mockScenario';

interface Props {
  session: CaptureSession;
  width?: number;
  height?: number;
}

/**
 * Tiny SVG-based point-cloud preview — orthographic top-down projection.
 * Points colored by Y (depth proxy) using a viridis-like ramp.
 */
export function PointCloudPreview({ session, width = 110, height = 110 }: Props) {
  const projected = useMemo(() => {
    const pts = session.pointCloud;
    let minY = Infinity, maxY = -Infinity;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const rangeY = Math.max(0.01, maxY - minY);
    const rangeX = Math.max(0.01, maxX - minX);
    const rangeZ = Math.max(0.01, maxZ - minZ);
    return pts.map((p) => {
      const u = (p.x - minX) / rangeX;
      const v = 1 - (p.z - minZ) / rangeZ;
      const depthT = (p.y - minY) / rangeY;
      return { u, v, depthT, intensity: p.intensity };
    });
  }, [session]);

  function depthColor(t: number): string {
    // Viridis-like: dark blue → teal → yellow
    const r = Math.round(68 + (253 - 68) * t);
    const g = Math.round(1 + (231 - 1) * t);
    const b = Math.round(84 + (37 - 84) * t);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <svg
      width={width}
      height={height}
      style={{
        // Light-theme tile: pale background + dim border, lets the
        // viridis point cloud stay readable without the punchy dark
        // panel feel from the earlier #0a0d12.
        background: 'var(--bg-soft)',
        borderRadius: 4,
        display: 'block',
        border: '1px solid var(--bd)',
      }}
    >
      {projected.map((p, i) => (
        <circle
          key={i}
          cx={p.u * width}
          cy={p.v * height}
          r={0.9}
          fill={depthColor(p.depthT)}
          opacity={0.6 + p.intensity * 0.4}
        />
      ))}
      <text
        x={4}
        y={11}
        fontSize={8}
        fill="var(--fg-dim)"
        fontFamily="ui-monospace, monospace"
      >
        PCD {session.pointCloud.length}
      </text>
    </svg>
  );
}
