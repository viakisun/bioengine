// Phenotyping survey v2 — Main-thread bridge for the detection worker.
//
// Spawns detectionWorker.ts (which subscribes to the WS stream), receives
// `{detections, header}` messages, performs the 3D filter that requires
// scene access (raycast → plant-tagged pickedMesh + worldY ∈ [1.10, 2.60]),
// and pushes the survivors into twinStore.surveyAppendLiveDetections.
//
// The raycast must run here because:
//   - Babylon scene + camera are main-thread-only.
//   - The picked mesh's name is the cheapest "is-this-a-plant" check we have.
//   - World Y comes from the pick point, not the worker's blind 2D detection.

import type { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { useTwinStore } from '../../state/twinStore';
import type { FramePoseHeader } from './streamProtocol';
import type { DetectorId, FruitDetection } from '../domain/detectors/types';
import { createLogger } from '../../utils/logger';

const log = createLogger('scenarios');

const FRUIT_WORLD_Y_MIN = 1.10;
const FRUIT_WORLD_Y_MAX = 2.60;

interface WorkerOutMsg {
  type: 'detections';
  header: FramePoseHeader;
  detections: FruitDetection[];
  inferMs: number;
}

export interface DetectionWorkerClientOpts {
  scene: Scene;
  /** Live gimbal camera — used to build the picking ray (capture cam shares
   *  the same parent so its pose is identical, but we use gimbalCamera to be
   *  consistent with what the user sees if they're on in-canvas PiP). */
  gimbalCamera: UniversalCamera;
  streamId: string;
  detectorId: DetectorId;
}

export class DetectionWorkerClient {
  private worker: Worker | null = null;
  private scene: Scene;
  private gimbalCamera: UniversalCamera;
  private streamId: string;
  private detectorId: DetectorId;
  private stopped = false;

  constructor(opts: DetectionWorkerClientOpts) {
    this.scene = opts.scene;
    this.gimbalCamera = opts.gimbalCamera;
    this.streamId = opts.streamId;
    this.detectorId = opts.detectorId;
  }

  start(): void {
    if (this.worker || this.stopped) return;
    this.worker = new Worker(
      new URL('./detectionWorker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.addEventListener('message', (ev: MessageEvent<WorkerOutMsg>) => {
      this.onMessage(ev.data);
    });
    this.worker.addEventListener('error', (err) => {
      log.warn('detectionWorker error', err.message);
    });
    this.worker.postMessage({ type: 'config', streamId: this.streamId, detectorId: this.detectorId });
    log.info(`detectionWorkerClient started (stream=${this.streamId}, detector=${this.detectorId})`);
  }

  stop(): void {
    this.stopped = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  setDetectorId(detectorId: DetectorId): void {
    if (detectorId === this.detectorId) return;
    this.detectorId = detectorId;
    // Restart worker so detector is reinitialized cleanly.
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.stopped = false;
      this.start();
    }
  }

  private onMessage(msg: WorkerOutMsg): void {
    if (!msg || msg.type !== 'detections') return;
    if (msg.detections.length === 0) return;
    // Project each bbox center back into 3D via the live gimbal camera + a
    // synthetic frame-coords → screen-coords transform that uses the header
    // pose to construct a picking ray.  Since the capture camera shares the
    // same parent as the live camera, the live camera's current view matrix
    // is a faithful proxy (assuming the user hasn't dragged it mid-frame).
    // For the in-canvas PiP mode the live camera IS the same view by
    // construction.
    const cam = this.gimbalCamera;
    const scene = this.scene;
    const liveItems: Array<{ worldX: number; worldY: number; worldZ: number; bin: 'green' | 'breaker' | 'turning' | 'pink' | 'red'; confidence: number }> = [];
    let pickHits = 0, rejectedByPlantTag = 0, rejectedByWorldY = 0;

    for (const d of msg.detections) {
      const cx = (d.bbox.x + d.bbox.w / 2) / msg.header.width;
      const cy = (d.bbox.y + d.bbox.h / 2) / msg.header.height;
      // Build a ray from camera through NDC point.  Use Babylon's
      // Vector3.Unproject to convert (cx,cy) on a virtual viewport
      // (0,0,1,1) into a world-space point on the far plane.
      const ndc = new Vector3(cx * 2 - 1, 1 - cy * 2, 1);  // NDC z=1 (far)
      const camViewProj = cam.getViewMatrix().multiply(cam.getProjectionMatrix());
      const invVp = Matrix.Invert(camViewProj);
      const worldFar = Vector3.TransformCoordinates(ndc, invVp);
      const camWorld = cam.globalPosition ?? cam.position;
      const direction = worldFar.subtract(camWorld).normalize();
      const ray = new Ray(camWorld, direction, cam.maxZ);
      const pick = scene.pickWithRay(ray, (m) => m.isPickable !== false);
      if (!pick?.hit || !pick.pickedPoint || !pick.pickedMesh) continue;
      const name = pick.pickedMesh.name.toLowerCase();
      const isPlant = name.includes('fruit') || name.includes('truss') || name.includes('plant') || name.includes('leaf');
      if (!isPlant) { rejectedByPlantTag++; continue; }
      const wy = pick.pickedPoint.y;
      if (wy < FRUIT_WORLD_Y_MIN || wy > FRUIT_WORLD_Y_MAX) { rejectedByWorldY++; continue; }
      pickHits++;
      liveItems.push({
        worldX: pick.pickedPoint.x,
        worldY: wy,
        worldZ: pick.pickedPoint.z,
        bin: d.bin,
        confidence: d.confidence,
      });
    }

    log.debug(`detectionWorkerClient frame ${msg.header.frameIdx} inferMs=${msg.inferMs.toFixed(0)} dets=${msg.detections.length} kept=${pickHits} rej.plantTag=${rejectedByPlantTag} rej.worldY=${rejectedByWorldY}`);
    if (liveItems.length > 0) {
      useTwinStore.getState().surveyAppendLiveDetections(liveItems);
    }
  }
}
