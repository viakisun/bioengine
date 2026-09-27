// Phenotyping survey store — extracted from twinStore.
//
// First domain store split as part of the Wave 3 refactor.  Lives as its
// own Zustand instance so phenotyping callers can subscribe with the
// finest possible selectors and unrelated panels never re-render.
//
// The twinStore re-exports `useTwinStore(s => s.phenotypingSurvey)` via a
// thin adapter for back-compat during migration; new code should import
// from here directly.

import { create } from 'zustand';
import type {
  PhenotypingSurveyState,
  SurveyDetectorId,
  SurveyLiveDetection,
  SurveyPhase,
  SurveyPipMode,
  SurveyTotals,
} from './twinStore';

const INITIAL: PhenotypingSurveyState = {
  status: 'idle',
  phase: 'idle',
  progress: 0,
  frameCount: 0,
  startedAtMs: null,
  elapsedMs: 0,
  totals: { fruitCount: 0, bins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 }, avgConfidence: 0 },
  lastPanoramaKey: null,
  detectorId: 'onnx-yolo-v1',
  detectorLoadProgress: 0,
  liveDetections: [],
  pipMode: 'stream',
};

export interface PhenotypingStoreApi {
  state: PhenotypingSurveyState;
  setStatus: (s: 'idle' | 'running' | 'paused' | 'done') => void;
  setPhase: (p: SurveyPhase) => void;
  setProgress: (p: number) => void;
  setFrameCount: (n: number) => void;
  setTotals: (t: SurveyTotals) => void;
  setLastPanoramaKey: (k: string | null) => void;
  setDetectorId: (id: SurveyDetectorId) => void;
  setDetectorLoadProgress: (p: number) => void;
  appendLiveDetections: (items: SurveyLiveDetection[]) => void;
  setPipMode: (m: SurveyPipMode) => void;
  reset: () => void;
}

export const usePhenotypingStore = create<PhenotypingStoreApi>((set) => ({
  state: INITIAL,
  setStatus: (status) =>
    set((s) => {
      const startedAtMs = status === 'running' && s.state.startedAtMs == null
        ? performance.now()
        : s.state.startedAtMs;
      const elapsedMs = startedAtMs == null ? 0 : performance.now() - startedAtMs;
      return { state: { ...s.state, status, startedAtMs, elapsedMs } };
    }),
  setPhase: (phase) => set((s) => ({ state: { ...s.state, phase } })),
  setProgress: (progress) =>
    set((s) => ({ state: { ...s.state, progress: Math.max(0, Math.min(1, progress)) } })),
  setFrameCount: (frameCount) => set((s) => ({ state: { ...s.state, frameCount } })),
  setTotals: (totals) =>
    set((s) => {
      const startedAtMs = s.state.startedAtMs;
      const elapsedMs = startedAtMs == null ? 0 : performance.now() - startedAtMs;
      return { state: { ...s.state, totals, elapsedMs } };
    }),
  setLastPanoramaKey: (lastPanoramaKey) =>
    set((s) => ({ state: { ...s.state, lastPanoramaKey } })),
  setDetectorId: (detectorId) => set((s) => ({ state: { ...s.state, detectorId } })),
  setDetectorLoadProgress: (p) =>
    set((s) => ({
      state: { ...s.state, detectorLoadProgress: Math.max(0, Math.min(1, p)) },
    })),
  appendLiveDetections: (items) =>
    set((s) => ({ state: { ...s.state, liveDetections: [...s.state.liveDetections, ...items] } })),
  setPipMode: (pipMode) => set((s) => ({ state: { ...s.state, pipMode } })),
  reset: () =>
    set((s) => ({
      state: {
        ...INITIAL,
        detectorId: s.state.detectorId,   // preserve user selection
        pipMode: s.state.pipMode,         // preserve user selection
      },
    })),
}));
