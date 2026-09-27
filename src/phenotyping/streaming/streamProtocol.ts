// Phenotyping survey v2 — Streaming protocol shared between
//   producer (browser, src/scenarios/phenotyping/streaming/gimbalCameraStreamer.ts)
//   relay server (tooling/vite/plugins/camStream.ts)
//   PiP consumer (src/hud/RobotCameraView.tsx)
//   detection worker (src/scenarios/phenotyping/streaming/detectionWorker.ts)
//
// Wire format (per logical frame, two WS messages):
//   1. Text frame: JSON of `FramePoseHeader`
//   2. Binary frame: JPEG-encoded RGB image bytes
//
// Consumers MUST pair each binary with the most-recent header.  Out-of-order
// arrival within a single ws connection is not possible (WS preserves order),
// so a simple "header-then-binary" pairing works.
//
// The relay server does no parsing — just fans out producer messages to all
// current consumers of the same streamId.  Headers + binaries are forwarded
// in arrival order, preserving pairing.

/** Pose + capture metadata for a single frame. */
export interface FramePoseHeader {
  /** Monotonic timestamp the producer assigned (performance.now() at capture). */
  ts: number;
  /** Rail X position (m) when frame was captured. */
  railX: number;
  /** Gimbal pan radians (-π..π], 0 = facing +Z left bed, π = right bed. */
  panRad: number;
  /** Gimbal pitch radians, 0 = horizontal. */
  pitchRad: number;
  /** Camera world position. */
  camWorldX: number;
  camWorldY: number;
  camWorldZ: number;
  /** Frame width in pixels (JPEG decoded). */
  width: number;
  /** Frame height in pixels. */
  height: number;
  /** FOV (radians) the camera was using. Needed for screen→ray reprojection. */
  fovRad: number;
  /** JPEG quality the producer encoded with (0..1). Informational. */
  jpegQuality: number;
  /** Monotonic frame index per producer-session.  Resets on producer restart. */
  frameIdx: number;
}

/** WS path scheme. Caller passes streamId; helpers build the URL. */
export const STREAM_BASE_PATH = '/robot';

/** Canonical phenotyping gimbal cam streamId. */
export const PHENOTYPING_GIMBAL_STREAM = 'phenotyping/gimbal';

/** Build a WS URL for the current origin.  In Vite dev (same origin) this
 *  yields `ws://localhost:8090/robot/<streamId>?role=<role>`. */
export function buildStreamUrl(streamId: string, role: 'producer' | 'consumer', origin?: string): string {
  const o = origin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8090');
  const wsOrigin = o.replace(/^http(s?):/, (_, s) => `ws${s}:`);
  return `${wsOrigin}${STREAM_BASE_PATH}/${streamId}?role=${role}`;
}

/** Validate a server-side path → returns null if it's not a stream endpoint. */
export function parseStreamPath(pathname: string): { streamId: string } | null {
  if (!pathname.startsWith(STREAM_BASE_PATH + '/')) return null;
  const tail = pathname.slice(STREAM_BASE_PATH.length + 1);
  if (tail.length === 0) return null;
  return { streamId: tail };
}

/** Header type-guard for runtime parse from WS text frame. */
export function isFramePoseHeader(v: unknown): v is FramePoseHeader {
  if (typeof v !== 'object' || v == null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.ts === 'number'
    && typeof o.railX === 'number'
    && typeof o.panRad === 'number'
    && typeof o.pitchRad === 'number'
    && typeof o.width === 'number'
    && typeof o.height === 'number'
    && typeof o.fovRad === 'number'
    && typeof o.frameIdx === 'number';
}
