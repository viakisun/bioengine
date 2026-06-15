// Phenotyping survey v2 — Detector registry.

import type { Detector, DetectorId } from './types';
import { hsvDetector } from './hsvDetector';
import { onnxYoloDetector } from './onnxYoloDetector';
import { groundTruthDetector } from './groundTruthDetector';

export const ALL_DETECTORS: readonly Detector[] = [
  hsvDetector,
  onnxYoloDetector,
  groundTruthDetector,
];

export function getDetector(id: DetectorId): Detector {
  const d = ALL_DETECTORS.find((det) => det.id === id);
  if (!d) throw new Error(`Unknown detector id: ${id}`);
  return d;
}

export { hsvDetector, onnxYoloDetector, groundTruthDetector };
export type { Detector, DetectorId, DetectorContext, FruitDetection, RipenessBin, DetectorSource } from './types';
export { RIPENESS_BINS, emptyBins } from './types';
