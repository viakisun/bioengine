// Phenotyping survey v2 — Runner (continuous traverse + frame capture + stitch + detect).
//
// State machine:
//   idle
//   → traversing-forward (rail -range → +range, FrameCapturer captures @ 0.3m)
//   → stitching-forward (assemble left panorama)
//   → detecting-forward (run selected detector on panorama)
//   → traversing-return (rail +range → -range)
//   → stitching-return
//   → detecting-return
//   → done
//
// Each pass: left bed scanned on forward (gimbal pan=0), right bed on return
// (pan=π). Detector runs once per side on the full panorama — no zone concept,
// no dedup needed, fruits in panorama appear exactly once.

import type { Scene } from '@babylonjs/core/scene';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { GrowthEngine } from '@farmsim/tomato-engine';
import type { PlantManager } from '../../scene/PlantManager';
import { railRef, setRailTarget, setRail, clampRail } from '../../scene/robot/robotControlState';
import { FrameCapturer, type CapturedFrame } from './frameCapture';
import { stitchFrames, imageDataToPng } from './stitcher';
import { getDetector, type Detector, type DetectorContext, type DetectorId, type FruitDetection, type RipenessBin } from './detectors';
import { surveyStore, type SurveyRecord, type PanoramaMeta } from './surveyStore';

export type SurveyPhase =
  | 'idle'
  | 'traversing-forward'
  | 'stitching-forward'
  | 'detecting-forward'
  | 'traversing-return'
  | 'stitching-return'
  | 'detecting-return'
  | 'done'
  | 'aborted';

export interface SurveyRunner {
  start: (recordSeed: Omit<SurveyRecord, 'id' | 'schemaVersion' | 'startedAt' | 'completedAt' | 'status' | 'detections' | 'panoramas' | 'totals' | 'pathLengthM' | 'elapsedMs' | 'detector' | 'capture'> & { id: string; detectorId: DetectorId }) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  getPhase: () => SurveyPhase;
}

export interface SurveyRunnerOpts {
  scene: Scene;
  camera: UniversalCamera;
  plantManager: PlantManager;
  growthEngine: GrowthEngine;
  /** Rail half-range from scenario.world / sceneOptions. */
  railRangeM: number;
  /** Traverse speed in m/s. */
  speedMps: number;
  /** Capture cadence in m. */
  captureEveryM?: number;
  /** RTT capture resolution. */
  frameWidthPx?: number;
  frameHeightPx?: number;
  /** Active bed ids by side, used as ground-truth filter + camera pan. */
  leftBedId: number | null;
  rightBedId: number | null;
  bedZ: { left: number | null; right: number | null };
  /** State updates back to UI. */
  onPhaseChange?: (phase: SurveyPhase) => void;
  onProgress?: (p: number) => void;
  onFrameCount?: (n: number) => void;
  onTotals?: (totals: { fruitCount: number; bins: Record<RipenessBin, number>; avgConfidence: number }) => void;
  onPanoramaSaved?: (side: 'left' | 'right', meta: PanoramaMeta) => void;
  onDetectorLoadProgress?: (p: number) => void;
  /** Fired after each side's detection completes. Detections augmented with
   *  worldY (panorama Y → height interp) + worldZ (bed Z). */
  onLiveDetections?: (items: Array<{
    worldX: number; worldY: number; worldZ: number;
    bin: 'green' | 'breaker' | 'turning' | 'pink' | 'red';
    confidence: number;
  }>) => void;
  onDone?: (record: SurveyRecord) => void;
  onError?: (err: Error) => void;
  /** Pan radians per gimbal side (default 0 / π / -π/2). */
  setGimbalPan: (rad: number) => void;
  /** Reset gimbal pitch (recover from user drag, set to 0 = horizontal). */
  setGimbalPitch: (rad: number) => void;
  setRobotMode: (m: 'auto' | 'paused' | 'manual') => void;
}

const PAN_LEFT  = 0;
const PAN_RIGHT = Math.PI;

export function createSurveyRunner(opts: SurveyRunnerOpts): SurveyRunner {
  let phase: SurveyPhase = 'idle';
  let cancelled = false;
  let observer: Observer<Scene> | null = null;
  let capturer: FrameCapturer | null = null;
  let detector: Detector | null = null;
  let record: SurveyRecord | null = null;
  let detections: FruitDetection[] = [];
  let totalFrameCount = 0;

  function setPhase(p: SurveyPhase): void {
    phase = p;
    opts.onPhaseChange?.(p);
  }

  function detach(): void {
    if (observer) {
      opts.scene.onBeforeRenderObservable.remove(observer);
      observer = null;
    }
    capturer?.dispose();
    capturer = null;
  }

  async function runPass(side: 'left' | 'right', forward: boolean): Promise<void> {
    if (cancelled) return;
    const bedId = side === 'left' ? opts.leftBedId : opts.rightBedId;
    const bedZ = side === 'left' ? opts.bedZ.left : opts.bedZ.right;
    if (bedId == null || bedZ == null) {
      // eslint-disable-next-line no-console
      console.warn(`[surveyRunner] skip ${side} pass — no bed (bedId=${bedId} bedZ=${bedZ})`);
      return;
    }
    // Use railRef's actual rangeM (single source of truth) — runner.opts.railRangeM
    // may diverge from BabylonEngine's TRAVERSE_RANGE causing |current - endX| never < 0.05.
    const range = Math.min(opts.railRangeM, railRef.rangeM);
    const startX = clampRail(forward ? -range : range, range);
    const endX = clampRail(forward ? range : -range, range);
    // eslint-disable-next-line no-console
    console.info(`[surveyRunner] runPass side=${side} forward=${forward} bedId=${bedId} bedZ=${bedZ.toFixed(2)} startX=${startX} endX=${endX} range=${range}`);

    // Aim gimbal at target side
    opts.setGimbalPan(side === 'left' ? PAN_LEFT : PAN_RIGHT);

    // ── Traverse phase ──
    setPhase(forward ? 'traversing-forward' : 'traversing-return');
    capturer = new FrameCapturer({
      scene: opts.scene,
      camera: opts.camera,
      width: opts.frameWidthPx ?? 320,
      height: opts.frameHeightPx ?? 180,
      captureEveryM: opts.captureEveryM ?? 0.3,
    });
    capturer.arm();
    setRail(startX);
    opts.setRobotMode('manual');
    setRailTarget(endX, opts.speedMps);

    // Wait for arrival, ticking progress. Polling interval cleanup via shared id.
    await new Promise<void>((resolve) => {
      let intervalId: ReturnType<typeof setInterval> | null = null;
      const done = () => {
        if (intervalId != null) { clearInterval(intervalId); intervalId = null; }
        resolve();
      };
      const checker = () => {
        if (cancelled) { done(); return; }
        const frames = capturer?.getFrames().length ?? 0;
        if (frames !== totalFrameCount) {
          totalFrameCount = frames;
          opts.onFrameCount?.(totalFrameCount);
        }
        const passFraction = forward ? 0 : 0.5;
        const passProgress = Math.abs(railRef.current - startX) / Math.max(0.01, Math.abs(endX - startX));
        opts.onProgress?.(passFraction + passProgress * 0.4); // traverse = 40% of pass
        const arrived = railRef.target == null && Math.abs(railRef.current - endX) < 0.05;
        if (arrived) {
          capturer?.disarm();
          done();
        }
      };
      intervalId = setInterval(checker, 100);
      // Safety timeout — 120s per pass. Forces resolve so we never hang forever.
      setTimeout(() => {
        if (intervalId != null) {
          // eslint-disable-next-line no-console
          console.warn(`[surveyRunner] ${side} pass traverse timeout — railX=${railRef.current.toFixed(2)} target=${railRef.target} endX=${endX}`);
          capturer?.disarm();
          done();
        }
      }, 120000);
    });
    if (cancelled) return;

    // ── Stitching phase ──
    setPhase(forward ? 'stitching-forward' : 'stitching-return');
    opts.onProgress?.((forward ? 0 : 0.5) + 0.4);
    const frames = capturer?.getFrames().slice() ?? [];
    capturer?.dispose();
    capturer = null;
    if (frames.length === 0) {
      // no frames? skip detection
      return;
    }
    const stitched = stitchFrames(frames);
    const pngBlob = await imageDataToPng(stitched.imageData);
    const blobKey = `panorama-${record!.id}-${side}.png`;
    await surveyStore.putPanorama(blobKey, pngBlob);
    const panoMeta: PanoramaMeta = {
      side,
      widthPx: stitched.imageData.width,
      heightPx: stitched.imageData.height,
      pxPerM: stitched.pxPerM,
      railStartX: stitched.railStartX,
      railEndX: stitched.railEndX,
      blobKey,
    };
    record!.panoramas.push(panoMeta);
    record!.capture.frameCount += frames.length;
    opts.onPanoramaSaved?.(side, panoMeta);

    // ── Detection phase ──
    setPhase(forward ? 'detecting-forward' : 'detecting-return');
    opts.onProgress?.((forward ? 0 : 0.5) + 0.45);
    const ctx: DetectorContext = {
      panorama: {
        pxPerM: stitched.pxPerM,
        railStartX: stitched.railStartX,
        railEndX: stitched.railEndX,
      },
      bedZ: bedZ,
      targetBedId: bedId,
      minute: useGetMinute(),
      plantManager: opts.plantManager,
      growthEngine: opts.growthEngine,
    };
    if (!detector) detector = getDetector(record!.detector.id);
    if (detector.init && side === 'left') {
      try {
        await detector.init((loaded, total) => {
          opts.onDetectorLoadProgress?.(total > 0 ? loaded / total : 0);
        });
      } catch (err) {
        opts.onError?.(err as Error);
        // Continue anyway — detector should still surface its own error or empty result
      }
    }
    try {
      const sideDetections = await detector.detect(stitched.imageData, ctx);
      detections.push(...sideDetections);
      record!.detections.push(...sideDetections);
      // Live overlay items: stamp world Y (panorama Y → plant height interp)
      // and world Z (bed Z of this side). worldX already on detection.
      const heightPx = stitched.imageData.height;
      // Plants live roughly from y=substrateTop (~0.95m) to ~2.2m at D80.
      // panorama y=0 (top) maps to ~2.2m, y=heightPx (bottom) maps to ~0.95m.
      const yTop = 2.2;
      const yBot = 0.95;
      const liveItems = sideDetections
        .filter((d) => d.worldX != null)
        .map((d) => ({
          worldX: d.worldX as number,
          worldY: yTop - ((d.bbox.y + d.bbox.h / 2) / heightPx) * (yTop - yBot),
          worldZ: bedZ,
          bin: d.bin,
          confidence: d.confidence,
        }));
      opts.onLiveDetections?.(liveItems);
      // Update live totals
      const bins = bucketize(detections);
      const avgConfidence = detections.length === 0
        ? 0
        : detections.reduce((a, d) => a + d.confidence, 0) / detections.length;
      opts.onTotals?.({ fruitCount: detections.length, bins, avgConfidence });
    } catch (err) {
      opts.onError?.(err as Error);
    }
    opts.onProgress?.((forward ? 0 : 0.5) + 0.5);
  }

  function useGetMinute(): number {
    // Read once at call time. Survey runs in seconds, sim minute doesn't change much.
    // Defer to ground-truth detector; HSV/ONNX ignore.
    try {
      // Avoid circular import: read via window-level twinStore would be heavy.
      // Use a global setter pattern — the runner caller injects via opts in future.
      // For now, read from PlantManager's growthEngine via stored last simulated minute.
      // Simpler: caller passes minute in opts at start time. We stamp record.cropMinute
      // already. Return that.
      return record?.cropMinute ?? 0;
    } catch { return 0; }
  }

  return {
    start: async (recordSeed) => {
      if (phase !== 'idle' && phase !== 'done' && phase !== 'aborted') return;
      cancelled = false;
      detections = [];
      totalFrameCount = 0;

      // ── Camera aim reset ──
      // User drag may have left pitch at -π/3 (camera looking at floor) and the
      // scenario default FOV (60°) is too narrow at our bed distance (~0.8m)
      // to capture full plant height (95cm-2m). Reset pitch to 0 and widen FOV
      // to 90° for the duration of the survey so the panorama actually shows
      // the plants.
      const cam = opts.camera;
      const origFov = cam.fov;
      cam.fov = (90 * Math.PI) / 180;
      opts.setGimbalPitch(0);
      // eslint-disable-next-line no-console
      console.info(`[surveyRunner] survey start — cam fov ${origFov.toFixed(2)} → ${cam.fov.toFixed(2)} (wide), pitch reset 0`);

      // Build initial record (in-progress)
      const det = getDetector(recordSeed.detectorId);
      record = {
        ...recordSeed,
        id: recordSeed.id,
        schemaVersion: '2.0',
        startedAt: new Date().toISOString(),
        completedAt: null,
        status: 'in-progress',
        detector: {
          id: det.id,
          label: det.label,
          source: det.source,
          modelUrl: det.id === 'onnx-yolo-v1' ? '/models/yolov8n.onnx' : undefined,
        },
        capture: {
          frameCount: 0,
          frameWidthPx: opts.frameWidthPx ?? 320,
          frameHeightPx: opts.frameHeightPx ?? 180,
          captureEveryM: opts.captureEveryM ?? 0.3,
          speedMps: opts.speedMps,
        },
        panoramas: [],
        detections: [],
        totals: { fruitCount: 0, bins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 }, avgConfidence: 0, pxPerM: 80, panoramaWidthPx: 0, panoramaHeightPx: 0 },
        pathLengthM: 0,
        elapsedMs: 0,
      };
      detector = null;
      try {
        await runPass('left', true);
        if (cancelled) { finalizeAborted('user-cancelled'); cam.fov = origFov; return; }
        await runPass('right', false);
        if (cancelled) { finalizeAborted('user-cancelled'); cam.fov = origFov; return; }
        finalizeCompleted();
      } catch (err) {
        opts.onError?.(err as Error);
        finalizeAborted((err as Error).message ?? 'unknown');
      } finally {
        // Restore camera FOV regardless of outcome
        cam.fov = origFov;
        // eslint-disable-next-line no-console
        console.info(`[surveyRunner] survey end — cam fov restored ${cam.fov.toFixed(2)}`);
      }
    },
    pause: () => {
      opts.setRobotMode('paused');
    },
    resume: () => {
      opts.setRobotMode('manual');
    },
    stop: () => {
      cancelled = true;
      detach();
      opts.setRobotMode('paused');
      setPhase('idle');
      detector?.dispose?.();
    },
    getPhase: () => phase,
  };

  function finalizeCompleted(): void {
    if (!record) return;
    record.completedAt = new Date().toISOString();
    record.status = 'completed';
    record.elapsedMs = record.startedAt ? (new Date().getTime() - new Date(record.startedAt).getTime()) : 0;
    record.pathLengthM = opts.railRangeM * 4; // forward + return
    const bins = bucketize(record.detections);
    const avgConfidence = record.detections.length === 0
      ? 0
      : record.detections.reduce((a, d) => a + d.confidence, 0) / record.detections.length;
    record.totals = {
      fruitCount: record.detections.length,
      bins,
      avgConfidence,
      pxPerM: record.panoramas[0]?.pxPerM ?? 80,
      panoramaWidthPx: record.panoramas.reduce((m, p) => Math.max(m, p.widthPx), 0),
      panoramaHeightPx: record.panoramas[0]?.heightPx ?? 0,
    };
    setPhase('done');
    surveyStore.save(record).then(() => {
      opts.onDone?.(record!);
    }).catch((err) => opts.onError?.(err as Error));
    detach();
    opts.setRobotMode('paused');
  }

  function finalizeAborted(reason: string): void {
    if (!record) return;
    record.completedAt = new Date().toISOString();
    record.status = 'aborted';
    record.abortReason = reason;
    record.elapsedMs = record.startedAt ? (new Date().getTime() - new Date(record.startedAt).getTime()) : 0;
    setPhase('aborted');
    surveyStore.save(record).catch(() => { /* */ });
    detach();
    opts.setRobotMode('paused');
  }
}

function bucketize(detections: readonly FruitDetection[]): Record<RipenessBin, number> {
  const bins: Record<RipenessBin, number> = { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 };
  for (const d of detections) bins[d.bin]++;
  return bins;
}

// Re-export for callers (Workbench wiring imports SurveyRunner from here).
export type { Detector, DetectorId, FruitDetection, RipenessBin } from './detectors';
