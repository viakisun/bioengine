// Phenotyping survey v2 — Stream PiP consumer.
//
// Subscribes to the WS stream as `role=consumer`, decodes each JPEG frame
// into an `<img>` via `URL.createObjectURL`.  Pairs incoming binary frames
// with the most recent text-frame `FramePoseHeader` so callers can read the
// current pose alongside the rendered image (used by `GimbalDetectionOverlay`
// later when it switches off the live `gimbalCam` projection).
//
// Connection lifecycle:
//   - Auto-connects on mount; auto-reconnects every 1.5s on close.
//   - "Disconnected" overlay fills the panel when the relay reports
//     `no-producer` / `producer-detached` or the WS is in any non-OPEN state.
//   - `onPoseHeader` callback fires every header arrival so a parent can
//     keep the projection overlay in sync without subscribing to twinStore.

import { useEffect, useRef, useState } from 'react';
import { buildStreamUrl, isFramePoseHeader, type FramePoseHeader } from '../streaming/streamProtocol';

export interface RobotCameraViewProps {
  streamId: string;
  /** Fires every time a new pose header arrives. */
  onPoseHeader?: (h: FramePoseHeader) => void;
  /** Children rendered on top of the video — used for detection overlay etc. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

type ConnState = 'connecting' | 'waiting-producer' | 'streaming' | 'disconnected';

export function RobotCameraView({ streamId, onPoseHeader, children, style }: RobotCameraViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHeader = useRef<FramePoseHeader | null>(null);
  const lastObjectUrl = useRef<string | null>(null);
  const closedRef = useRef(false);
  const [state, setState] = useState<ConnState>('connecting');
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;
      const url = buildStreamUrl(streamId, 'consumer');
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';
      setState('connecting');

      ws.onopen = () => {
        setState((s) => (s === 'streaming' ? s : 'waiting-producer'));
      };
      ws.onmessage = (ev) => {
        const data = ev.data as ArrayBuffer | string;
        if (typeof data === 'string') {
          // Text frame: either pose header or relay event.
          let parsed: unknown;
          try { parsed = JSON.parse(data); } catch { return; }
          if (parsed && typeof parsed === 'object' && '__event' in (parsed as Record<string, unknown>)) {
            const ev = (parsed as { __event: string }).__event;
            if (ev === 'no-producer' || ev === 'producer-detached') {
              setState('waiting-producer');
            }
            return;
          }
          if (isFramePoseHeader(parsed)) {
            pendingHeader.current = parsed;
            onPoseHeader?.(parsed);
          }
          return;
        }
        // Binary: JPEG bytes.  Pair with the most recent header.
        if (!(data instanceof ArrayBuffer)) return;
        const blob = new Blob([data], { type: 'image/jpeg' });
        const objectUrl = URL.createObjectURL(blob);
        const img = imgRef.current;
        if (img) img.src = objectUrl;
        // Revoke previous object URL after one tick so the browser has time
        // to start decoding the next frame.
        const prev = lastObjectUrl.current;
        lastObjectUrl.current = objectUrl;
        if (prev) {
          setTimeout(() => URL.revokeObjectURL(prev), 0);
        }
        setState('streaming');
        setFrameCount((n) => n + 1);
      };
      ws.onerror = () => { /* onclose follows */ };
      ws.onclose = () => {
        wsRef.current = null;
        if (!closedRef.current) {
          setState('disconnected');
          scheduleReconnect();
        }
      };
    };

    const scheduleReconnect = () => {
      if (reconnectTimer.current || closedRef.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, 1500);
    };

    connect();
    return () => {
      closedRef.current = true;
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (wsRef.current) {
        try { wsRef.current.close(1000, 'view-unmount'); } catch { /* */ }
        wsRef.current = null;
      }
      if (lastObjectUrl.current) {
        URL.revokeObjectURL(lastObjectUrl.current);
        lastObjectUrl.current = null;
      }
    };
  }, [streamId, onPoseHeader]);

  const showOverlay = state !== 'streaming';
  const overlayLabel = state === 'connecting' ? 'connecting…'
    : state === 'waiting-producer' ? 'waiting for camera…'
    : 'disconnected — retrying…';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000', ...style }}>
      <img
        ref={imgRef}
        alt="robot camera stream"
        draggable={false}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
        data-stream-id={streamId}
        data-frame-count={frameCount}
      />
      {children}
      {showOverlay && (
        <div
          aria-label={overlayLabel}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            color: 'var(--iw-fg-mid, #888)',
            fontFamily: 'monospace',
            fontSize: 12,
            letterSpacing: '0.06em',
            pointerEvents: 'none',
          }}
        >
          ● {overlayLabel}
        </div>
      )}
    </div>
  );
}
