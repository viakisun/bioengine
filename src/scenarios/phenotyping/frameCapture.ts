// Phenotyping survey v2 — Per-frame gimbal-cam RTT capture.
//
// Mounts a RenderTargetTexture wired to the gimbal UniversalCamera. Every
// onBeforeRender, checks rail movement vs the configured spacing; if moved
// far enough, schedules a readPixels and pushes a CapturedFrame.
//
// readPixels is async on WebGPU + sync on WebGL2 — we await + buffer either
// way to keep the API uniform.

import { Scene } from '@babylonjs/core/scene';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { railRef } from '../../scene/robot/robotControlState';

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
  width: number;            // RTT width (px) — default 320
  height: number;           // RTT height (px) — default 180
  /** Capture every N meters of rail movement. */
  captureEveryM: number;    // default 0.3
  /** Hard cap on frame count, prevents runaway memory. */
  maxFrames?: number;       // default 500
}

export class FrameCapturer {
  private rtt: RenderTargetTexture;
  private opts: FrameCapturerOpts;
  private frames: CapturedFrame[] = [];
  private lastCaptureRailX: number | null = null;
  private renderObserver: Observer<Scene> | null = null;
  private armed = false;        // capture only when armed
  private inFlight = false;     // prevent overlapping reads

  constructor(opts: FrameCapturerOpts) {
    this.opts = opts;
    this.rtt = new RenderTargetTexture(
      'phenotyping-frame-rtt',
      { width: opts.width, height: opts.height },
      opts.scene,
      false,  // no mipmaps
      true,   // doNotChangeAspectRatio
    );
    this.rtt.activeCamera = opts.camera;
    this.rtt.clearColor = new Color4(0, 0, 0, 1);
    this.rtt.renderList = null; // render the whole scene (respect camera layerMask)
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE; // we manually trigger
    opts.scene.customRenderTargets.push(this.rtt);
  }

  /** Reset captured frames + last-capture marker; arm capture loop. */
  arm(): void {
    this.frames = [];
    this.lastCaptureRailX = null;
    this.armed = true;
    if (!this.renderObserver) {
      this.renderObserver = this.opts.scene.onBeforeRenderObservable.add(() => this.tick());
    }
  }

  /** Disarm — stops capturing, keeps existing frames available. */
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
    this.frames = [];
  }

  // ── internal ──

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
    // Force one fresh render into the RTT this frame.
    this.rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.rtt.render();

    // readPixels returns Promise<ArrayBufferView> in modern Babylon.
    let pixels: Uint8Array;
    try {
      const buffer = await this.rtt.readPixels();
      if (!buffer) return;
      pixels = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[frameCapture] readPixels failed:', err);
      return;
    }

    const cam = this.opts.camera;
    const pos = cam.globalPosition ?? cam.position;
    // gimbalPivot rotation.y === pan. Read via parent transform chain if available.
    const panRad = (cam.parent && 'parent' in cam.parent && cam.parent.parent && 'rotation' in cam.parent.parent
      ? ((cam.parent.parent as unknown as { rotation: { y: number } }).rotation.y)
      : 0);

    this.frames.push({
      railX,
      pixels,
      width: this.opts.width,
      height: this.opts.height,
      cameraPose: { worldX: pos.x, worldY: pos.y, worldZ: pos.z, panRad },
      timestampMs: performance.now(),
    });
    this.lastCaptureRailX = railX;
  }
}
