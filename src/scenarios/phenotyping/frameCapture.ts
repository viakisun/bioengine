// Phenotyping survey v2 — Live gimbal-cam viewport snapshot.
//
// 정석 방식: 사용자가 PiP 에서 보는 실제 gimbal cam 픽셀을 메인 캔버스에서
// 직접 readback.  RTT 우회 → camera.viewport 충돌 없음, FOV/pitch 가 그대로
// 적용됨, 사용자가 보는 그대로의 영상이 panorama 로 들어감.
//
// 각 frame 캡처 절차:
//   1. scene.onAfterRenderObservable 에서 호출 (main 렌더 완료 직후)
//   2. Babylon engine 의 rendering canvas 에서 camera.viewport 영역만 drawImage
//      로 offscreen 2D canvas 로 복사
//   3. getImageData 로 픽셀 추출 → CapturedFrame buffer 에 push

import { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { railRef } from '../../scene/robot/robotControlState';

export interface CapturedFrame {
  railX: number;
  pixels: Uint8Array;                   // RGBA, width × height × 4
  width: number;
  height: number;
  cameraPose: { worldX: number; worldY: number; worldZ: number; panRad: number };
  timestampMs: number;
}

export interface FrameCapturerOpts {
  scene: Scene;
  camera: UniversalCamera;
  /** Output frame width (px). Source rect is rescaled here. default 320. */
  width: number;
  /** Output frame height (px). default 180. */
  height: number;
  /** Capture every N meters of rail movement. default 0.3 */
  captureEveryM: number;
  /** Cap on stored frames (memory safety). default 500. */
  maxFrames?: number;
}

export class FrameCapturer {
  private opts: FrameCapturerOpts;
  private frames: CapturedFrame[] = [];
  private lastCaptureRailX: number | null = null;
  private renderObserver: Observer<Scene> | null = null;
  private armed = false;
  private offscreen: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(opts: FrameCapturerOpts) {
    this.opts = opts;
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = opts.width;
    this.offscreen.height = opts.height;
    const c = this.offscreen.getContext('2d', { willReadFrequently: true });
    if (!c) throw new Error('No 2D context for offscreen capture canvas');
    this.ctx = c;
  }

  arm(): void {
    this.frames = [];
    this.lastCaptureRailX = null;
    this.armed = true;
    if (!this.renderObserver) {
      this.renderObserver = this.opts.scene.onAfterRenderObservable.add(() => this.tick());
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
      this.opts.scene.onAfterRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    this.frames = [];
  }

  private tick(): void {
    if (!this.armed) return;
    const railX = railRef.current;
    const enough = this.lastCaptureRailX == null
      || Math.abs(railX - this.lastCaptureRailX) >= this.opts.captureEveryM;
    if (!enough) return;
    if ((this.opts.maxFrames ?? 500) <= this.frames.length) return;
    if (this.capture(railX)) {
      this.lastCaptureRailX = railX;
    }
  }

  private capture(railX: number): boolean {
    const engine = this.opts.scene.getEngine();
    const canvas = engine.getRenderingCanvas() as HTMLCanvasElement | null;
    if (!canvas) return false;
    const cw = canvas.width;
    const ch = canvas.height;
    const vp = this.opts.camera.viewport;
    // WebGL viewport: Y from bottom.  drawImage uses DOM coords: Y from top.
    // Convert: src_top_in_dom = ch - (vp.y + vp.height) × ch
    const srcX = Math.round(vp.x * cw);
    const srcW = Math.max(1, Math.round(vp.width * cw));
    const srcH = Math.max(1, Math.round(vp.height * ch));
    const srcY = Math.round((1 - vp.y - vp.height) * ch);
    try {
      // Background clear: black, so transparent edges show black not previous.
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, this.opts.width, this.opts.height);
      this.ctx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, this.opts.width, this.opts.height);
      const img = this.ctx.getImageData(0, 0, this.opts.width, this.opts.height);
      // Clone buffer (getImageData returns a view that's stable across frames,
      // but to be safe with structured clones / IDB we copy).
      const pixels = new Uint8Array(img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength));

      const cam = this.opts.camera;
      const pos = cam.globalPosition ?? cam.position;
      // gimbalPivot rotation.y = pan (cam → pitchPivot → pan pivot).
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
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[frameCapture] drawImage failed:', err);
      return false;
    }
  }
}
