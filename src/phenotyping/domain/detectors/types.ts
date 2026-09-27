// Phenotyping survey v2 — Detector interface.
//
// Each detector takes a panorama ImageData (stitched from gimbal frames) and
// returns a list of FruitDetection (bbox + bin + confidence). Implementations
// vary wildly in approach (color thresholds vs ML inference vs simulator
// ground-truth) but share this single interface so the runner stays agnostic.

import type { PlantManager } from '../../../scene/PlantManager';
import type { GrowthEngine } from '@farmsim/tomato-engine';

export type RipenessBin = 'green' | 'breaker' | 'turning' | 'pink' | 'red';
export const RIPENESS_BINS: readonly RipenessBin[] = ['green', 'breaker', 'turning', 'pink', 'red'] as const;

export type DetectorSource = 'hsv' | 'onnx' | 'gt';
export type DetectorId = 'hsv-v1' | 'onnx-yolo-v1' | 'ground-truth';

export interface FruitDetection {
  /** Bbox in panorama image coordinates (px). */
  bbox: { x: number; y: number; w: number; h: number };
  /** Optional: bbox center → rail-X (m).  ground-truth knows for sure; */
  /** pixel-CV detectors compute via panoXToRailX. */
  worldX?: number;
  bin: RipenessBin;
  /** 0..1 detector confidence. */
  confidence: number;
  /** Which detector produced this (for audit / mixed-source storage). */
  source: DetectorSource;
}

export interface DetectorContext {
  /** Stitched panorama mapping (for px ↔ railX conversions). */
  panorama: {
    pxPerM: number;
    railStartX: number;
    railEndX: number;
  };
  /** Bed Z of the side being scanned (left = +, right = −). */
  bedZ: number;
  /** Which bed id (for ground-truth filter). */
  targetBedId: number;
  /** Sim time for ground-truth queries. */
  minute: number;
  /** Required by ground-truth; ignored by HSV/ONNX. */
  plantManager: PlantManager;
  growthEngine: GrowthEngine;
}

export interface Detector {
  id: DetectorId;
  label: string;
  source: DetectorSource;
  /** Run detection.  May be async (model load / inference). */
  detect(panorama: ImageData, ctx: DetectorContext): Promise<FruitDetection[]>;
  /** Optional: lazy initialization (model download / warmup).  Called once
   *  before the first detect.  May report progress. */
  init?(onProgress?: (loaded: number, total: number) => void): Promise<void>;
  /** Optional: dispose / free heavy resources. */
  dispose?(): void;
}

/** Convenience: empty bin map. */
export function emptyBins(): Record<RipenessBin, number> {
  return { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 };
}
