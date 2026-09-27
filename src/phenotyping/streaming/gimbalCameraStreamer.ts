// Phenotyping survey v2 — Gimbal camera stream producer.
//
// Owns a dedicated capture UniversalCamera (parented to gimbalPitchPivot,
// same parent as the live PiP gimbal cam → identical pose) + a 320×180 RTT.
// On a fixed cadence (default 15 fps):
//
//   1. rtt.render()  → renders the gimbal view into the texture
//   2. rtt.readPixels() → RGBA Uint8Array
//   3. Flip Y (WebGL convention) → upright RGBA
//   4. Encode to JPEG via OffscreenCanvas.convertToBlob({type:'image/jpeg'})
//   5. Send `JSON.stringify(FramePoseHeader)` text frame, then JPEG bytes
//      as a binary frame, over a single WS producer connection.
//
// Why MJPEG-over-WS (not <canvas>.captureStream + WebRTC):
//   - Vite dev plugin trivially fans out raw WS messages.
//   - Browser-native JPEG decode via <img> or createImageBitmap.
//   - Trivially swappable for a real RTSP/MJPEG camera later — same WS bytes.
//
// Why a dedicated capture camera (not gimbalCam directly):
//   - gimbalCam owns the live PiP viewport (when in-canvas mode is active).
//   - Pulling RTT off the live cam was previously found to leak viewport
//     state across the canvas multi-camera pass.
//   - This camera has viewport (0,0,1,1) and is never put in scene.activeCameras.

import type { Scene } from '@babylonjs/core/scene';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { railRef } from '../../scene/robot/robotControlState';
import { buildStreamUrl, type FramePoseHeader } from './streamProtocol';
import { createLogger } from '../../utils/logger';

const log = createLogger('scenarios');

export interface GimbalCameraStreamerOpts {
  scene: Scene;
  /** Live gimbal cam — used as the parent + pose source for the capture cam. */
  gimbalCamera: UniversalCamera;
  /** Stream id passed to buildStreamUrl(). */
  streamId: string;
  /** RTT width (px). Default 320. */
  width?: number;
  /** RTT height (px). Default 180. */
  height?: number;
  /** Target frames-per-second. Default 15. */
  fps?: number;
  /** JPEG encoder quality (0..1). Default 0.7. */
  jpegQuality?: number;
}

export class GimbalCameraStreamer {
  private scene: Scene;
  private gimbalCamera: UniversalCamera;
  private streamId: string;
  private width: number;
  private height: number;
  private fps: number;
  private jpegQuality: number;

  private streamCaptureCamera: UniversalCamera;
  private rtt: RenderTargetTexture;
  private renderObserver: Observer<Scene> | null = null;
  private ws: WebSocket | null = null;
  private wsClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private lastFrameTs = -Infinity;
  private inFlight = false;
  private frameIdx = 0;
  private encodeCanvas: OffscreenCanvas | HTMLCanvasElement;
  private encodeCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  constructor(opts: GimbalCameraStreamerOpts) {
    this.scene = opts.scene;
    this.gimbalCamera = opts.gimbalCamera;
    this.streamId = opts.streamId;
    this.width = opts.width ?? 320;
    this.height = opts.height ?? 180;
    this.fps = opts.fps ?? 15;
    this.jpegQuality = opts.jpegQuality ?? 0.7;

    // ── Capture camera (decoupled from PiP cam) ──
    this.streamCaptureCamera = new UniversalCamera(
      'phenotyping-stream-cam',
      new Vector3(0, 0, 0),
      this.scene,
    );
    this.streamCaptureCamera.parent = this.gimbalCamera.parent;
    this.streamCaptureCamera.setTarget(new Vector3(0, 0, 1.5));
    this.streamCaptureCamera.fov = this.gimbalCamera.fov;
    this.streamCaptureCamera.minZ = this.gimbalCamera.minZ;
    this.streamCaptureCamera.maxZ = this.gimbalCamera.maxZ;
    this.streamCaptureCamera.layerMask = this.gimbalCamera.layerMask;
    this.streamCaptureCamera.viewport = new Viewport(0, 0, 1, 1);

    // ── RTT (always 320×180 regardless of PiP DOM size) ──
    this.rtt = new RenderTargetTexture(
      'phenotyping-stream-rtt',
      { width: this.width, height: this.height },
      this.scene,
      false,
      true,
    );
    this.rtt.activeCamera = this.streamCaptureCamera;
    this.rtt.clearColor = new Color4(0, 0, 0, 1);
    this.rtt.renderList = null;
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.scene.customRenderTargets.push(this.rtt);

    // ── JPEG encoder canvas (reused per frame) ──
    if (typeof OffscreenCanvas !== 'undefined') {
      this.encodeCanvas = new OffscreenCanvas(this.width, this.height);
      this.encodeCtx = this.encodeCanvas.getContext('2d', { willReadFrequently: false })!;
    } else {
      this.encodeCanvas = document.createElement('canvas');
      this.encodeCanvas.width = this.width;
      this.encodeCanvas.height = this.height;
      this.encodeCtx = (this.encodeCanvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: false })!;
    }
  }

  start(): void {
    if (this.renderObserver) return;
    this.connect();
    this.renderObserver = this.scene.onAfterRenderObservable.add(() => this.tick());
  }

  stop(): void {
    if (this.renderObserver) {
      this.scene.onAfterRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    this.wsClosed = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(1000, 'streamer-stop'); } catch { /* */ }
      this.ws = null;
    }
  }

  dispose(): void {
    this.stop();
    const idx = this.scene.customRenderTargets.indexOf(this.rtt);
    if (idx >= 0) this.scene.customRenderTargets.splice(idx, 1);
    this.rtt.dispose();
    this.streamCaptureCamera.dispose();
  }

  setFps(fps: number): void {
    this.fps = Math.max(1, Math.min(60, fps));
  }

  setJpegQuality(q: number): void {
    this.jpegQuality = Math.max(0.1, Math.min(1, q));
  }

  private connect(): void {
    if (this.ws || this.wsClosed) return;
    const url = buildStreamUrl(this.streamId, 'producer');
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.scheduleReconnect();
      return;
    }
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      log.info(`stream-producer connected ${url}`);
      this.frameIdx = 0;
    };
    this.ws.onerror = () => { /* onclose follows */ };
    this.ws.onclose = (ev) => {
      this.ws = null;
      if (this.wsClosed) return;
      log.warn(`stream-producer closed (code=${ev.code}); reconnecting`);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.wsClosed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  private tick(): void {
    if (this.inFlight) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    const interval = 1000 / this.fps;
    if (now - this.lastFrameTs < interval) return;
    this.lastFrameTs = now;
    this.inFlight = true;
    void this.captureAndSend(now)
      .catch((err) => {
        log.warn('stream-producer capture threw', err);
      })
      .finally(() => { this.inFlight = false; });
  }

  private async captureAndSend(ts: number): Promise<void> {
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.rtt.render();

    let pixels: Uint8Array;
    try {
      const buf = await this.rtt.readPixels();
      if (!buf) return;
      pixels = buf instanceof Uint8Array
        ? buf
        : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return;
    }
    flipPixelsY(pixels, this.width, this.height);

    // RGBA → 2D canvas → JPEG blob
    const clamped = new Uint8ClampedArray(pixels.length);
    clamped.set(pixels);
    const img = new ImageData(clamped, this.width, this.height);
    this.encodeCtx.putImageData(img, 0, 0);
    let jpegBlob: Blob | null = null;
    if ('convertToBlob' in this.encodeCanvas) {
      try {
        jpegBlob = await (this.encodeCanvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: this.jpegQuality });
      } catch { /* fall through to fallback */ }
    }
    if (!jpegBlob) {
      jpegBlob = await new Promise<Blob | null>((resolve) =>
        (this.encodeCanvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', this.jpegQuality),
      );
    }
    if (!jpegBlob) return;

    // Pose header
    const cam = this.streamCaptureCamera;
    const pos = cam.globalPosition ?? cam.position;
    // pan = parent's parent rotation.y (gimbalPivot), pitch = parent rotation.x (gimbalPitchPivot)
    const parent = cam.parent as { rotation?: { x: number }, parent?: { rotation?: { y: number } } } | null;
    const pitchRad = parent?.rotation?.x ?? 0;
    const panRad = parent?.parent?.rotation?.y ?? 0;
    const header: FramePoseHeader = {
      ts,
      railX: railRef.current,
      panRad,
      pitchRad,
      camWorldX: pos.x,
      camWorldY: pos.y,
      camWorldZ: pos.z,
      width: this.width,
      height: this.height,
      fovRad: this.streamCaptureCamera.fov,
      jpegQuality: this.jpegQuality,
      frameIdx: this.frameIdx++,
    };

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(header));
      const ab = await jpegBlob.arrayBuffer();
      this.ws.send(ab);
    } catch (err) {
      log.warn('stream-producer send failed', err);
    }
  }
}

function flipPixelsY(pixels: Uint8Array, width: number, height: number): void {
  const stride = width * 4;
  const tmp = new Uint8Array(stride);
  for (let y = 0; y < Math.floor(height / 2); y++) {
    const top = y * stride;
    const bot = (height - 1 - y) * stride;
    tmp.set(pixels.subarray(top, top + stride));
    pixels.copyWithin(top, bot, bot + stride);
    pixels.set(tmp, bot);
  }
}
