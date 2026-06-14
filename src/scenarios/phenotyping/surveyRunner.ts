// Phenotyping survey — Runner state machine.
//
// Drives the robot through a sequence of Zones (from zonePlan).  At each
// zone:  move → settle → capture → advance.  Reports phase transitions and
// per-zone detection results back to the caller via callbacks.
//
// Runs on Babylon's onBeforeRenderObservable — one tick per frame.  Does
// not maintain its own timer loop (engine-driven).

import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { GrowthEngine } from '@farmsim/tomato-engine';
import type { Zone } from './zonePlan';
import type { PlantManager } from '../../scene/PlantManager';
import { railRef, setRail } from '../../scene/robot/robotControlState';
import { detectVisibleFruits, summarizeDetections, countExpectedFruits, type FruitDetection } from './detect';

export type SurveyPhase = 'idle' | 'moving' | 'settling' | 'capturing' | 'done';

export interface ZoneResult {
  zoneId: string;
  zone: Zone;
  capturedAt: string;        // ISO8601
  fruits: FruitDetection[];
  rawCount: number;
  weightedCount: number;
  expectedFruitCount: number;
  coverage: number;          // weightedCount / max(1, expected)
  avgConfidence: number;
  bins: { green: number; breaker: number; turning: number; pink: number; red: number };
  weightedBins: { green: number; breaker: number; turning: number; pink: number; red: number };
}

export interface SurveyRunner {
  /** Begin or resume the survey from idle. No-op if already running. */
  start: () => void;
  /** Pause without resetting position. */
  pause: () => void;
  /** Resume after pause. */
  resume: () => void;
  /** Hard stop and unhook from the scene. */
  stop: () => void;
  getPhase: () => SurveyPhase;
  getZoneIndex: () => number;
}

export interface SurveyRunnerOpts {
  zones: Zone[];
  scene: Scene;
  camera: Camera;
  plantManager: PlantManager;
  growthEngine: GrowthEngine;
  /** Current simulation minute provider. Phase changes do not require the
   *  current minute, but capture does. */
  getMinute: () => number;
  /** Robot mode control. Runner takes manual mode while running. */
  setRobotMode: (m: 'auto' | 'paused' | 'manual') => void;
  /** Gimbal side switch for left/right bed targeting. */
  setGimbalSide: (s: 'left' | 'right' | 'front') => void;
  /** Detection filter config — see detect.ts. */
  workingDistanceM?: { min: number; max: number };
  referenceSolidAngleSr?: number;
  // ── Callbacks ─────
  onPhaseChange?: (phase: SurveyPhase, zoneIndex: number) => void;
  onZoneEnter?: (zone: Zone) => void;
  onZoneCaptured?: (result: ZoneResult) => void;
  /** Fired exactly once when all zones complete. */
  onDone?: () => void;
}

/** Tunables. */
const SETTLE_MS = 250;          // gimbal stabilization
const MOVE_TOLERANCE_M = 0.05;  // arrival epsilon

export function createSurveyRunner(opts: SurveyRunnerOpts): SurveyRunner {
  const {
    zones, scene, camera, plantManager, growthEngine,
    getMinute, setRobotMode, setGimbalSide,
    workingDistanceM, referenceSolidAngleSr,
    onPhaseChange, onZoneEnter, onZoneCaptured, onDone,
  } = opts;

  let phase: SurveyPhase = 'idle';
  let zoneIndex = 0;
  let settleStartMs = 0;
  let observer: Observer<Scene> | null = null;

  function setPhase(next: SurveyPhase): void {
    if (next === phase) return;
    phase = next;
    onPhaseChange?.(phase, zoneIndex);
  }

  function enterZone(idx: number): void {
    zoneIndex = idx;
    const z = zones[idx];
    if (!z) {
      setPhase('done');
      setRobotMode('paused');
      onDone?.();
      return;
    }
    setGimbalSide(z.bedSide);
    setRobotMode('manual');
    setRail(z.railX);
    setPhase('moving');
    onZoneEnter?.(z);
  }

  function captureCurrentZone(): void {
    const z = zones[zoneIndex];
    if (!z) return;
    const minute = getMinute();
    const fruits = detectVisibleFruits({
      scene, camera,
      minute,
      targetBedId: z.targetBedId,
      candidatePlantIdxs: z.targetPlantIdxs,
      plantManager,
      growthEngine,
      workingDistanceM,
      referenceSolidAngleSr,
    });
    const summary = summarizeDetections(fruits);
    const expectedFruitCount = countExpectedFruits({
      candidatePlantIdxs: z.targetPlantIdxs,
      plantManager,
      growthEngine,
      minute,
    });
    const coverage = expectedFruitCount === 0
      ? 0
      : Math.min(1, summary.weightedCount / expectedFruitCount);

    onZoneCaptured?.({
      zoneId: z.id,
      zone: z,
      capturedAt: new Date().toISOString(),
      fruits,
      rawCount: summary.rawCount,
      weightedCount: summary.weightedCount,
      expectedFruitCount,
      coverage,
      avgConfidence: summary.avgConfidence,
      bins: summary.bins,
      weightedBins: summary.weightedBins,
    });
  }

  function tick(): void {
    if (phase === 'idle' || phase === 'done') return;
    if (phase === 'moving') {
      const z = zones[zoneIndex];
      if (!z) return;
      const reached = Math.abs(railRef.current - z.railX) < MOVE_TOLERANCE_M;
      if (reached) {
        settleStartMs = performance.now();
        setPhase('settling');
      }
      return;
    }
    if (phase === 'settling') {
      if (performance.now() - settleStartMs >= SETTLE_MS) {
        setPhase('capturing');
      }
      return;
    }
    if (phase === 'capturing') {
      // capture is synchronous; immediately advance
      try {
        captureCurrentZone();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[surveyRunner] capture failed:', err);
      }
      const next = zoneIndex + 1;
      if (next >= zones.length) {
        setPhase('done');
        setRobotMode('paused');
        onDone?.();
        return;
      }
      enterZone(next);
    }
  }

  function attach(): void {
    if (observer) return;
    observer = scene.onBeforeRenderObservable.add(tick);
  }
  function detach(): void {
    if (observer) {
      scene.onBeforeRenderObservable.remove(observer);
      observer = null;
    }
  }

  return {
    start: () => {
      if (phase !== 'idle' && phase !== 'done') return;
      if (zones.length === 0) {
        setPhase('done');
        onDone?.();
        return;
      }
      zoneIndex = 0;
      attach();
      enterZone(0);
    },
    pause: () => {
      if (phase === 'idle' || phase === 'done') return;
      setRobotMode('paused');
      detach();
      // keep phase so resume can continue from where we were
    },
    resume: () => {
      if (zones.length === 0) return;
      attach();
      // re-issue rail move toward current zone
      const z = zones[zoneIndex];
      if (z) {
        setRobotMode('manual');
        setRail(z.railX);
        setPhase('moving');
      }
    },
    stop: () => {
      detach();
      setRobotMode('paused');
      setPhase('idle');
      zoneIndex = 0;
    },
    getPhase: () => phase,
    getZoneIndex: () => zoneIndex,
  };
}
