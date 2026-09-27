// Phenotyping survey v2 — Detection consumer Web Worker.
//
// Lives off the main thread.  Subscribes to the WS stream as `role=consumer`,
// decodes each JPEG frame into an ImageData via `createImageBitmap` +
// `OffscreenCanvas`, runs the selected detector (HSV or ONNX YOLO), then
// posts `{detections, header}` back to the main thread.
//
// Main thread takes those bboxes, runs the Babylon raycast/worldY/plant-tag
// filter (which needs scene access), and pushes confirmed items into
// twinStore.surveyAppendLiveDetections.
//
// Why no plantManager / growthEngine here:
//   - Worker can't see Babylon scene objects.  The detector context we
//     synthesize is "blind" — only the image and pose.  Ground-truth detector
//     would need scene access so it can't run here; only HSV / ONNX are
//     valid worker detectors.
//   - The 3D filter (worldY ∈ [1.10, 2.60], pickedMesh name contains plant
//     tag) runs on the main thread instead — see detectionWorkerClient.ts.
//
// Back-pressure: if inference is still running when the next frame arrives,
// the new frame is dropped.  Detection rate auto-adapts to inference speed.

import { hsvDetector } from '../domain/detectors/hsvDetector';
import { onnxYoloDetector } from '../domain/detectors/onnxYoloDetector';
import type { Detector, DetectorContext, DetectorId, FruitDetection } from '../domain/detectors/types';
import {
  buildStreamUrl,
  isFramePoseHeader,
  type FramePoseHeader,
} from './streamProtocol';
import { createLogger } from '../../utils/logger';

const log = createLogger('scenarios');

interface WorkerInMsg {
  type: 'config';
  streamId: string;
  detectorId: DetectorId;
}

export interface WorkerOutDetection extends FruitDetection {}

export interface WorkerOutMsg {
  type: 'detections';
  header: FramePoseHeader;
  detections: WorkerOutDetection[];
  inferMs: number;
}

// ─── State ───────────────────────────────────────────────────────────────
let streamId: string | null = null;
let detector: Detector | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let closedRef = false;

let pendingHeader: FramePoseHeader | null = null;
let inFlight = false;
let droppedSinceLastSend = 0;

// JPEG → ImageData reuse
let decodeCanvas: OffscreenCanvas | null = null;
let decodeCtx: OffscreenCanvasRenderingContext2D | null = null;

self.addEventListener('message', (ev: MessageEvent<WorkerInMsg>) => {
  const msg = ev.data;
  if (!msg) return;
  if (msg.type === 'config') {
    streamId = msg.streamId;
    detector = pickDetector(msg.detectorId);
    // Pre-warm the detector (ONNX model download) so first-frame latency
    // doesn't include 12MB fetch.
    if (detector.init) {
      void detector.init().catch((err: unknown) => {
        log.warn('detectionWorker detector init failed', err);
      });
    }
    connect();
  }
});

function pickDetector(id: DetectorId): Detector {
  if (id === 'hsv-v1') return hsvDetector;
  if (id === 'onnx-yolo-v1') return onnxYoloDetector;
  // ground-truth needs scene access → cannot run in worker.  Fall back to HSV.
  log.warn(`detectionWorker detector ${id} unavailable in worker — using HSV`);
  return hsvDetector;
}

function connect(): void {
  if (!streamId || ws || closedRef) return;
  const url = buildStreamUrl(streamId, 'consumer', self.location.origin);
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    log.info(`detectionWorker connected ${url}`);
  };
  ws.onmessage = (ev) => {
    const data = ev.data as ArrayBuffer | string;
    if (typeof data === 'string') {
      let parsed: unknown;
      try { parsed = JSON.parse(data); } catch { return; }
      if (parsed && typeof parsed === 'object' && '__event' in (parsed as Record<string, unknown>)) {
        return;
      }
      if (isFramePoseHeader(parsed)) pendingHeader = parsed;
      return;
    }
    if (!(data instanceof ArrayBuffer)) return;
    const header = pendingHeader;
    if (!header) return;
    // Drop if inference in flight — back-pressure protection.
    if (inFlight) { droppedSinceLastSend++; return; }
    inFlight = true;
    void runDetect(data, header).finally(() => { inFlight = false; });
  };
  ws.onerror = () => { /* close follows */ };
  ws.onclose = () => {
    ws = null;
    if (!closedRef) scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (reconnectTimer || closedRef) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 1500);
}

async function runDetect(jpegBytes: ArrayBuffer, header: FramePoseHeader): Promise<void> {
  if (!detector) return;
  const t0 = performance.now();
  let bitmap: ImageBitmap;
  try {
    const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
    bitmap = await createImageBitmap(blob);
  } catch (err) {
    log.warn('detectionWorker decode failed', err);
    return;
  }
  // ImageData via OffscreenCanvas (lazy alloc + size match)
  if (!decodeCanvas || decodeCanvas.width !== bitmap.width || decodeCanvas.height !== bitmap.height) {
    decodeCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    decodeCtx = decodeCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!decodeCtx) { bitmap.close(); return; }
  decodeCtx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = decodeCtx.getImageData(0, 0, header.width, header.height);

  // Stub context — HSV / ONNX don't use plantManager / growthEngine.  bedZ
  // and targetBedId fed as 0; downstream consumers don't rely on them in
  // live mode (they'd matter only on the stitched panorama path).
  const ctx: DetectorContext = {
    panorama: { pxPerM: 1, railStartX: 0, railEndX: 0 },
    bedZ: 0,
    targetBedId: 0,
    minute: 0,
    plantManager: null as unknown as DetectorContext['plantManager'],
    growthEngine: null as unknown as DetectorContext['growthEngine'],
  };

  let dets: FruitDetection[] = [];
  try {
    dets = await detector.detect(img, ctx);
  } catch (err) {
    log.warn('detectionWorker detect threw', err);
    return;
  }
  const inferMs = performance.now() - t0;
  const out: WorkerOutMsg = { type: 'detections', header, detections: dets, inferMs };
  (self as unknown as Worker).postMessage(out);
  if (droppedSinceLastSend > 0) {
    log.debug(`detectionWorker dropped ${droppedSinceLastSend} frames during last inference`);
    droppedSinceLastSend = 0;
  }
}
