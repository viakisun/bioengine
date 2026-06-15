// Phenotyping survey v2 — Panorama viewer with bbox overlay.
//
// Loads the panorama PNG from IndexedDB by blobKey, draws on a canvas, then
// renders detection bboxes color-coded by ripeness bin.  Supports horizontal
// scrolling (panoramas are wider than the modal) and click-to-tooltip.

import { useEffect, useRef, useState } from 'react';
import { surveyStore, type PanoramaMeta } from '../../scenarios/phenotyping/surveyStore';
import type { FruitDetection, RipenessBin } from '../../scenarios/phenotyping/detectors';

const BIN_COLOR: Record<RipenessBin, string> = {
  green:   '#34d399',
  breaker: '#fbbf24',
  turning: '#f59e0b',
  pink:    '#f87171',
  red:     '#ef4444',
};

interface PanoramaViewerProps {
  panorama: PanoramaMeta;
  detections: readonly FruitDetection[];
  /** Display height in px; width is scaled to maintain aspect ratio. */
  displayHeight?: number;
  /** Show bbox overlay (default true). */
  showBoxes?: boolean;
}

export function PanoramaViewer({ panorama, detections, displayHeight = 200, showBoxes = true }: PanoramaViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<FruitDetection | null>(null);

  // Load PNG blob from IDB
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setLoading(true);
    surveyStore.getPanorama(panorama.blobKey).then((blob) => {
      if (!active || !blob) return;
      url = URL.createObjectURL(blob);
      setImgUrl(url);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [panorama.blobKey]);

  // Draw image + bboxes whenever inputs change
  useEffect(() => {
    if (!imgUrl) return;
    const c = canvasRef.current;
    if (!c) return;
    const img = new Image();
    img.onload = () => {
      c.width = panorama.widthPx;
      c.height = panorama.heightPx;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      if (showBoxes) {
        for (const d of detections) {
          const color = BIN_COLOR[d.bin] ?? '#fff';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(d.bbox.x, d.bbox.y, d.bbox.w, d.bbox.h);
          // tiny conf chip top-left
          if (d.confidence > 0) {
            ctx.fillStyle = color;
            ctx.fillRect(d.bbox.x, d.bbox.y - 11, 30, 11);
            ctx.fillStyle = '#06070a';
            ctx.font = '9px monospace';
            ctx.fillText(d.confidence.toFixed(2), d.bbox.x + 2, d.bbox.y - 2);
          }
        }
      }
    };
    img.src = imgUrl;
  }, [imgUrl, detections, showBoxes, panorama.widthPx, panorama.heightPx]);

  const scale = displayHeight / panorama.heightPx;
  const displayWidth = panorama.widthPx * scale;

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!showBoxes) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top + (e.currentTarget as HTMLDivElement).scrollTop;
    const xImg = (xCss + (e.currentTarget as HTMLDivElement).scrollLeft) / scale;
    const yImg = yCss / scale;
    const hit = detections.find((d) =>
      xImg >= d.bbox.x && xImg <= d.bbox.x + d.bbox.w
      && yImg >= d.bbox.y && yImg <= d.bbox.y + d.bbox.h);
    setHovered(hit ?? null);
  }
  function onMouseLeave() {
    setHovered(null);
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: displayHeight,
      overflowX: 'auto',
      overflowY: 'hidden',
      background: 'var(--iw-bg-0, #06070a)',
      border: '1px solid var(--iw-line-1)',
      borderRadius: 4,
    }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {loading && (
        <div style={{ padding: 24, color: 'var(--iw-fg-mute)', fontSize: 11 }}>Loading panorama…</div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: displayWidth,
          height: displayHeight,
          imageRendering: 'pixelated',
          display: 'block',
        }}
      />
      {hovered && (
        <div style={{
          position: 'sticky',
          left: 8,
          bottom: 8,
          display: 'inline-block',
          background: 'rgba(8,10,13,0.92)',
          border: `1px solid ${BIN_COLOR[hovered.bin]}`,
          borderRadius: 4,
          padding: '4px 8px',
          fontFamily: 'var(--iw-font-mono)',
          fontSize: 10,
          color: 'var(--iw-fg-hi)',
        }}>
          <span style={{ color: BIN_COLOR[hovered.bin], fontWeight: 600 }}>{hovered.bin}</span>
          <span style={{ color: 'var(--iw-fg-faint)', marginLeft: 6 }}>conf</span>
          <span style={{ marginLeft: 4 }}>{hovered.confidence.toFixed(2)}</span>
          <span style={{ color: 'var(--iw-fg-faint)', marginLeft: 6 }}>source</span>
          <span style={{ marginLeft: 4 }}>{hovered.source}</span>
          {hovered.worldX != null && (
            <>
              <span style={{ color: 'var(--iw-fg-faint)', marginLeft: 6 }}>railX</span>
              <span style={{ marginLeft: 4 }}>{hovered.worldX.toFixed(2)}m</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
