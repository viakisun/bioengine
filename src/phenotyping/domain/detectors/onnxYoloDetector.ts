// Phenotyping survey v2 — ONNX YOLOv8 instance detector + HSV ripeness classifier.
//
// Two-stage 정석 pipeline:
//   1. INSTANCE DETECTION — YOLOv8n (COCO-pretrained) locates fruit-like
//      bboxes on the panorama. We treat *any* fruit-class hit (apple, orange,
//      banana, carrot) as a tomato candidate. YOLO knows nothing about
//      ripeness; that's intentional — instance detection should not encode
//      ripeness priors.
//   2. RIPENESS CLASSIFICATION — for each detected bbox, run the HSV-based
//      classifyRipeness() on the pixels inside that bbox. The detector having
//      already excluded leaves means green tomatoes are correctly classified
//      as "green" rather than swallowed by leaf background (the limitation
//      of standalone color segmentation).
//
// Model: public/models/yolov8n.onnx (~12 MB COCO pretrained). For a real
// tomato dataset, only step 1 needs swapping; the ripeness classifier is
// model-agnostic.

import type { Detector, DetectorContext, FruitDetection } from './types';
import { panoXToRailX } from '../stitcher';
import { classifyRipeness } from './ripenessClassifier';

const MODEL_URL = '/models/yolov8n.onnx';
const INPUT_SIZE = 640;
// COCO-pretrained YOLO weights were learned on photographs.  Stylized
// Babylon-rendered tomatoes match apple/orange/banana/carrot weakly — the
// per-class softmax probabilities are typically in the 0.05~0.20 range
// rather than the 0.5+ you'd see on a real photo.  Lower threshold catches
// these legitimate-but-soft matches; the downstream raycast-plant-mesh +
// worldY filters in surveyRunner cut substrate / structure false positives.
const CONF_THRESHOLD = 0.05;
const IOU_THRESHOLD = 0.45;

// COCO ids that we accept as "tomato-like fruit instance".
// We do NOT map these to ripeness bins; that's classifyRipeness's job.
// Restricted to fruit classes only — adding generic shapes (donut/broccoli)
// produces too many false positives on greenhouse foliage.
const FRUIT_CLASS_IDS: ReadonlySet<number> = new Set([
  46, // banana   (yellow/breaker tomatoes)
  47, // apple    (red/ripe tomatoes — dominant match)
  49, // orange   (turning tomatoes)
  53, // carrot   (red-orange — occasional match)
]);

interface OnnxModule {
  InferenceSession: {
    create(uri: string | ArrayBuffer | Uint8Array, opts?: unknown): Promise<{
      run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>;
      dispose?: () => void;
    }>;
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => OnnxTensor;
  env?: { wasm?: { wasmPaths?: string } };
}

interface OnnxTensor {
  data: Float32Array;
  dims: readonly number[];
}

let session: Awaited<ReturnType<OnnxModule['InferenceSession']['create']>> | null = null;
let ortPromise: Promise<OnnxModule> | null = null;

async function loadOrt(): Promise<OnnxModule> {
  if (ortPromise) return ortPromise;
  ortPromise = import('onnxruntime-web') as unknown as Promise<OnnxModule>;
  return ortPromise;
}

async function ensureSession(onProgress?: (loaded: number, total: number) => void): Promise<NonNullable<typeof session>> {
  if (session) return session;
  const ort = await loadOrt();
  // Download model with progress (HEAD + ranged GET is overkill — single fetch).
  try {
    const resp = await fetch(MODEL_URL);
    if (!resp.ok) throw new Error(`Model fetch ${resp.status}`);
    const total = Number(resp.headers.get('content-length') ?? 0);
    if (total > 0 && resp.body) {
      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          onProgress?.(loaded, total);
        }
      }
      const merged = new Uint8Array(loaded);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
      session = await ort.InferenceSession.create(merged.buffer as ArrayBuffer);
    } else {
      // No content-length — just await arrayBuffer
      const buf = await resp.arrayBuffer();
      session = await ort.InferenceSession.create(buf);
    }
  } catch (err) {
    // Re-throw with friendly message — surveyRunner shows it to user
    throw new Error(`Failed to load ONNX model at ${MODEL_URL}: ${(err as Error).message}\nDownload yolov8n.onnx and place at public/models/yolov8n.onnx (see README).`);
  }
  return session!;
}

export const onnxYoloDetector: Detector = {
  id: 'onnx-yolo-v1',
  label: 'ONNX YOLOv8 (instance) + HSV ripeness classifier',
  source: 'onnx',
  async init(onProgress) {
    await ensureSession(onProgress);
  },
  async detect(panorama: ImageData, ctx: DetectorContext): Promise<FruitDetection[]> {
    const sess = await ensureSession();
    const ort = await loadOrt();

    // ── Stage 1: Instance detection via YOLO ─────────────────────────
    // Slide a 640×640 window across the panorama, run inference per window,
    // merge detections.  Stride = INPUT_SIZE/2 for overlap (catches edge cases).
    // We accept any FRUIT_CLASS_IDS hit as a tomato instance; ripeness comes
    // from per-bbox HSV analysis in stage 2.
    const W = panorama.width;
    const H = panorama.height;
    const stride = INPUT_SIZE / 2;
    const instanceBoxes: Array<{ x: number; y: number; w: number; h: number; instanceConf: number }> = [];

    for (let xs = 0; xs <= Math.max(0, W - INPUT_SIZE); xs += stride) {
      for (let ys = 0; ys <= Math.max(0, H - INPUT_SIZE); ys += stride) {
        const tile = extractTile(panorama, xs, ys, INPUT_SIZE, INPUT_SIZE);
        const input = imageToTensor(tile, INPUT_SIZE);
        const inputNames = (sess as unknown as { inputNames?: string[] }).inputNames;
        const feedKey = inputNames?.[0] ?? 'images';
        const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
        const outputs = await sess.run({ [feedKey]: tensor });
        const outKey = Object.keys(outputs)[0];
        const out = outputs[outKey];
        const dets = parseYolov8Output(out.data, out.dims, INPUT_SIZE);
        for (const d of dets) {
          if (!FRUIT_CLASS_IDS.has(d.classId)) continue;
          instanceBoxes.push({
            x: xs + d.x, y: ys + d.y, w: d.w, h: d.h, instanceConf: d.conf,
          });
        }
      }
    }
    // If panorama smaller than INPUT_SIZE, do a single resized pass.
    if (W < INPUT_SIZE || H < INPUT_SIZE) {
      const input = imageToTensor(panorama, INPUT_SIZE);
      const inputNames = (sess as unknown as { inputNames?: string[] }).inputNames;
      const feedKey = inputNames?.[0] ?? 'images';
      const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const outputs = await sess.run({ [feedKey]: tensor });
      const outKey = Object.keys(outputs)[0];
      const out = outputs[outKey];
      const dets = parseYolov8Output(out.data, out.dims, INPUT_SIZE);
      const sx = W / INPUT_SIZE;
      const sy = H / INPUT_SIZE;
      for (const d of dets) {
        if (!FRUIT_CLASS_IDS.has(d.classId)) continue;
        instanceBoxes.push({ x: d.x * sx, y: d.y * sy, w: d.w * sx, h: d.h * sy, instanceConf: d.conf });
      }
    }

    // NMS to dedupe overlapping instances across tile boundaries
    const keptInstances = nms(
      instanceBoxes.map((b) => ({ ...b, conf: b.instanceConf })),
      IOU_THRESHOLD,
    );

    // ── Stage 2: Per-instance ripeness classification ────────────────
    // For each YOLO-detected bbox, run HSV histogram on the bbox pixels
    // to assign a 5-stage ripeness bin. Combined confidence is the geometric
    // mean of instance confidence and classifier confidence.
    return keptInstances.map((b): FruitDetection => {
      const ripeness = classifyRipeness(panorama, { x: b.x, y: b.y, w: b.w, h: b.h });
      const combinedConf = Math.sqrt(b.instanceConf * ripeness.confidence);
      return {
        bbox: { x: b.x, y: b.y, w: b.w, h: b.h },
        worldX: panoXToRailX(b.x + b.w / 2, ctx.panorama),
        bin: ripeness.bin,
        confidence: combinedConf,
        source: 'onnx',
      };
    });
  },
  dispose() {
    if (session) {
      session.dispose?.();
      session = null;
    }
  },
};

// ── helpers ──────────────────────────────────────────────────────────

function extractTile(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let py = 0; py < h; py++) {
    const sy = y + py;
    if (sy < 0 || sy >= src.height) continue;
    for (let px = 0; px < w; px++) {
      const sx = x + px;
      if (sx < 0 || sx >= src.width) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (py * w + px) * 4;
      out[di]     = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return new ImageData(out, w, h);
}

/** ImageData (any size) → Float32Array [3, S, S] normalized 0..1, planar RGB. */
function imageToTensor(img: ImageData, size: number): Float32Array {
  // Simple bilinear-ish nearest-neighbor resize (no fancy filtering).
  const out = new Float32Array(3 * size * size);
  const sx = img.width / size;
  const sy = img.height / size;
  for (let y = 0; y < size; y++) {
    const srcY = Math.min(img.height - 1, Math.floor(y * sy));
    for (let x = 0; x < size; x++) {
      const srcX = Math.min(img.width - 1, Math.floor(x * sx));
      const si = (srcY * img.width + srcX) * 4;
      const di = y * size + x;
      out[di]                 = img.data[si]     / 255; // R plane
      out[size * size + di]   = img.data[si + 1] / 255; // G plane
      out[2 * size * size + di] = img.data[si + 2] / 255; // B plane
    }
  }
  return out;
}

interface RawDetection { x: number; y: number; w: number; h: number; conf: number; classId: number }

/** Parse YOLOv8 raw output [1, 84, N] (or [1, N, 84]) where 84 = 4 bbox + 80 class scores. */
function parseYolov8Output(data: Float32Array, dims: readonly number[], inputSize: number): RawDetection[] {
  const out: RawDetection[] = [];
  if (dims.length !== 3) return out;
  // YOLOv8 typical: dims = [1, 84, 8400] OR [1, 8400, 84]
  const a = dims[1];
  const b = dims[2];
  let attrCount: number, predCount: number, attrStride: number, predStride: number;
  if (a === 84 || a === 85) {
    attrCount = a; predCount = b; attrStride = b; predStride = 1;
  } else {
    attrCount = b; predCount = a; attrStride = 1; predStride = b;
  }
  const classCount = attrCount - 4;
  for (let i = 0; i < predCount; i++) {
    const base = i * predStride;
    const cx = data[base + 0 * attrStride];
    const cy = data[base + 1 * attrStride];
    const w  = data[base + 2 * attrStride];
    const h  = data[base + 3 * attrStride];
    let bestClass = -1;
    let bestScore = 0;
    for (let c = 0; c < classCount; c++) {
      const s = data[base + (4 + c) * attrStride];
      if (s > bestScore) { bestScore = s; bestClass = c; }
    }
    if (bestScore < CONF_THRESHOLD || bestClass < 0) continue;
    out.push({
      x: cx - w / 2,
      y: cy - h / 2,
      w,
      h,
      conf: bestScore,
      classId: bestClass,
    });
  }
  return out;
}

function nms<T extends { x: number; y: number; w: number; h: number; conf: number }>(boxes: T[], iouThresh: number): T[] {
  const sorted = boxes.slice().sort((a, b) => b.conf - a.conf);
  const kept: T[] = [];
  while (sorted.length > 0) {
    const top = sorted.shift()!;
    kept.push(top);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (iou(top, sorted[i]) > iouThresh) sorted.splice(i, 1);
    }
  }
  return kept;
}

function iou(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const union = a.w * a.h + b.w * b.h - inter;
  return inter / union;
}
