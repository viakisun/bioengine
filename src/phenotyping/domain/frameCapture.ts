// Phenotyping survey v2 — Per-frame gimbal-cam RTT capture.
//
// Mounts a dedicated UniversalCamera (clone of the live gimbal cam) + a
// RenderTargetTexture wired to it.  Capture camera shares the live cam's
// parent (gimbalPitchPivot) so pan/pitch/rail follow 1:1, but its viewport
// is always (0,0,1,1) — RTT renders to the full 320×180 buffer regardless
// of how the live cam's PiP viewport changes.
//
// 왜 RTT 인가 (drawImage 방식이 안 됐던 이유):
//   WebGL canvas는 frame 렌더 후 browser compositor가 swap & present 하면서
//   `preserveDrawingBuffer:false` 일 때 drawing buffer가 초기화됨.  사용자는
//   swap 직전 픽셀을 보지만 `canvas.drawImage()` 는 swap 후 cleared buffer를
//   읽어 회색(scene clearColor) 한 장만 나옴.  RTT는 별도 GPU texture라
//   swap 영향 없음.
//
// 왜 별도 카메라인가:
//   - 한 카메라의 viewport는 한 패스에서만 의미 있음.  live cam은 PiP DOM rect
//     기반의 viewport(예: 0.046, 0.637, 0.294, 0.276)을 유지해야 PiP가 깨지지
//     않고, RTT는 full viewport(0,0,1,1)가 필요함.  같은 카메라에 두 역할을
//     쥐여주면 cross-pass 누수로 PiP가 작게 그려지는 회귀 발생.

import { Scene } from '@babylonjs/core/scene';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { railRef } from '../../scene/robot/robotControlState';
import { createLogger } from '../../utils/logger';

const log = createLogger('scenarios');

export interface CapturedFrame {
  railX: number;
  pixels: Uint8Array;                // RGBA, width × height × 4
  width: number;
  height: number;
  cameraPose: { worldX: number; worldY: number; worldZ: number; panRad: number };
  timestampMs: number;
}

export interface FrameCapturerOpts {
  scene: Scene;
  camera: UniversalCamera;
  /** RTT width (px) — default 320. */
  width: number;
  /** RTT height (px) — default 180. */
  height: number;
  /** Capture every N meters of rail movement. default 0.3. */
  captureEveryM: number;
  /** Hard cap on frame count, prevents runaway memory. default 500. */
  maxFrames?: number;
  /** Per-frame callback for live processing (e.g. real-time HSV detection). */
  onFrameCaptured?: (frame: CapturedFrame) => void;
}

export class FrameCapturer {
  private rtt: RenderTargetTexture;
  private streamCaptureCamera: UniversalCamera;
  private opts: FrameCapturerOpts;
  private frames: CapturedFrame[] = [];
  private lastCaptureRailX: number | null = null;
  private renderObserver: Observer<Scene> | null = null;
  private armed = false;
  private inFlight = false;

  constructor(opts: FrameCapturerOpts) {
    this.opts = opts;
    // Dedicated camera for the RTT pass — identical view to the live PiP
    // gimbalCam (same parent, target, FOV, layerMask) so the captured frame
    // matches exactly what the user sees in PiP.  Only difference: viewport
    // stays (0,0,1,1) so the RTT renders to its full 320×180.
    this.streamCaptureCamera = new UniversalCamera(
      'phenotyping-rtt-cam',
      new Vector3(0, 0, 0),
      opts.scene,
    );
    this.streamCaptureCamera.parent = opts.camera.parent;
    this.streamCaptureCamera.setTarget(new Vector3(0, 0, 1.5));
    this.streamCaptureCamera.fov = opts.camera.fov;
    this.streamCaptureCamera.minZ = opts.camera.minZ;
    this.streamCaptureCamera.maxZ = opts.camera.maxZ;
    this.streamCaptureCamera.layerMask = opts.camera.layerMask;
    this.streamCaptureCamera.viewport = new Viewport(0, 0, 1, 1);

    this.rtt = new RenderTargetTexture(
      'phenotyping-frame-rtt',
      { width: opts.width, height: opts.height },
      opts.scene,
      false,   // no mipmaps
      true,    // doNotChangeAspectRatio
    );
    this.rtt.activeCamera = this.streamCaptureCamera;
    this.rtt.clearColor = new Color4(0, 0, 0, 1);
    this.rtt.renderList = null;
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    opts.scene.customRenderTargets.push(this.rtt);
  }

  arm(): void {
    this.frames = [];
    this.lastCaptureRailX = null;
    this.armed = true;
    if (!this.renderObserver) {
      this.renderObserver = this.opts.scene.onBeforeRenderObservable.add(() => this.tick());
    }
  }

  disarm(): void {
    this.armed = false;
  }

  getFrames(): readonly CapturedFrame[] {
    return this.frames;
  }

  dispose(): void {
    this.disarm();
    if (this.renderObserver) {
      this.opts.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    const idx = this.opts.scene.customRenderTargets.indexOf(this.rtt);
    if (idx >= 0) this.opts.scene.customRenderTargets.splice(idx, 1);
    this.rtt.dispose();
    this.streamCaptureCamera.dispose();
    this.frames = [];
  }

  private tick(): void {
    if (!this.armed || this.inFlight) return;
    const railX = railRef.current;
    const enough = this.lastCaptureRailX == null
      || Math.abs(railX - this.lastCaptureRailX) >= this.opts.captureEveryM;
    if (!enough) return;
    if ((this.opts.maxFrames ?? 500) <= this.frames.length) return;
    this.inFlight = true;
    void this.capture(railX).finally(() => { this.inFlight = false; });
  }

  private async capture(railX: number): Promise<void> {
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.rtt.render();

    let pixels: Uint8Array;
    try {
      const buffer = await this.rtt.readPixels();
      if (!buffer) return;
      pixels = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } catch (err) {
      log.warn('frameCapture readPixels failed', err);
      return;
    }
    // WebGL gl.readPixels returns bottom-up rows; flip vertically in place so
    // downstream HSV/stitcher/dump see an upright image.
    flipPixelsY(pixels, this.opts.width, this.opts.height);

    const cam = this.opts.camera;
    const pos = cam.globalPosition ?? cam.position;
    const panRad = (cam.parent && 'parent' in cam.parent && cam.parent.parent && 'rotation' in cam.parent.parent
      ? ((cam.parent.parent as unknown as { rotation: { y: number } }).rotation.y)
      : 0);

    const frame: CapturedFrame = {
      railX,
      pixels,
      width: this.opts.width,
      height: this.opts.height,
      cameraPose: { worldX: pos.x, worldY: pos.y, worldZ: pos.z, panRad },
      timestampMs: performance.now(),
    };
    this.frames.push(frame);
    this.lastCaptureRailX = railX;

    // Opt-in diagnostic: when the URL has `?debug=capture`, mirror the
    // most-recent decoded frame to window.__lastCaptureFrame so probes can
    // sample any rail position without keeping a 60-frame retention buffer
    // resident the whole survey.
    if (isCaptureDebug() && typeof document !== 'undefined') {
      const off = document.createElement('canvas');
      off.width = this.opts.width;
      off.height = this.opts.height;
      const ctx = off.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const clamped = new Uint8ClampedArray(pixels.length);
        clamped.set(pixels);
        ctx.putImageData(new ImageData(clamped, this.opts.width, this.opts.height), 0, 0);
        (window as unknown as { __lastCaptureFrame?: { dataUrl: string; railX: number; frameIdx: number } }).__lastCaptureFrame = {
          dataUrl: off.toDataURL('image/png'),
          railX,
          frameIdx: this.frames.length - 1,
        };
      }
    }

    try {
      this.opts.onFrameCaptured?.(frame);
    } catch (err) {
      log.warn('frameCapture onFrameCaptured callback threw', err);
    }
  }
}

// Memoized once per page load — debug query string is immutable for the session.
let CAPTURE_DEBUG: boolean | null = null;
function isCaptureDebug(): boolean {
  if (CAPTURE_DEBUG !== null) return CAPTURE_DEBUG;
  if (typeof window === 'undefined') { CAPTURE_DEBUG = false; return false; }
  try {
    const csv = new URLSearchParams(window.location.search).get('debug') ?? '';
    CAPTURE_DEBUG = csv.split(',').map((s) => s.trim()).some((t) => t === 'capture' || t === '*');
  } catch {
    CAPTURE_DEBUG = false;
  }
  return CAPTURE_DEBUG;
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
