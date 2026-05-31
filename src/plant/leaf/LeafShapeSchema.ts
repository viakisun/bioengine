// LeafShapeSchema — leafShape.v1 schema + resolveLeafShape() deep-merge.
//
// SSOT 원칙 #5 (schema versioning) + #6 (provenance) 적용.
//   - cultivar JSONC의 leafShape는 OPTIONAL. 누락 시 DEFAULT_TOMATO_LEAF_SHAPE.
//   - partial override 허용 (deep-merge).
//   - schemaVersion mismatch → unsupported version은 throw (forward-compat 가드).
//   - cultivar override가 default보다 낮은 confidence면 console.warn.

import type {
  LeafShapeSchemaVersion,
  WidthProfileSpec,
  MarginProfileSpec,
  SurfaceProfileSpec,
} from './LeafOrganGraph';
import { DEFAULT_TOMATO_LEAF_SHAPE } from './defaults';
import { createLogger } from '../../utils/logger';

const log = createLogger('leaf');

// ── Provenance ────────────────────────────────────────────────────────

export type ProvenanceSourceLevel =
  | 'default'
  | 'estimated'
  | 'literature'
  | 'measured'
  | 'calibrated';

export type ProvenanceConfidence = 'low' | 'medium' | 'high';

export interface Provenance {
  sourceLevel: ProvenanceSourceLevel;
  confidence: ProvenanceConfidence;
  sourceRefs: string[];
  notes: string;
  lastReviewed: string;
}

// ── Full leafShape spec (v1) ──────────────────────────────────────────

export interface LeafletCountStageSpec {
  early: number;
  developing: number;
  mature: number;
}

export interface LeafShapeVariance {
  lengthScaleStd: number;
  widthScaleStd: number;
  asymmetryStd: number;
  droopStd: number;
}

export interface LeafShapeSpec {
  schemaVersion: LeafShapeSchemaVersion;
  provenance: Provenance;
  leafletCount: LeafletCountStageSpec;
  /** WidthProfileSpec + peakHalfWidthM (peak blade half-width, m). */
  widthProfile: WidthProfileSpec & { peakHalfWidthM: number };
  marginProfile: MarginProfileSpec;
  surfaceProfile: SurfaceProfileSpec;
  petioleLengthM: number;
  rachisLengthM: number;
  rachisDroopFactor: number;
  /** Length:width ratio per leaflet. cherry ~2.2, beefsteak ~1.5. */
  leafletAspect: number;
  variance: LeafShapeVariance;
}

/**
 * Partial override permitted from cultivar JSONC.
 * Every nested object is itself a Partial<...>. schemaVersion만 present인 경우도 허용.
 */
export type LeafShapePartial = {
  schemaVersion?: LeafShapeSchemaVersion;
  provenance?: Partial<Provenance>;
  leafletCount?: Partial<LeafletCountStageSpec>;
  widthProfile?: Partial<WidthProfileSpec & { peakHalfWidthM: number }>;
  marginProfile?: Partial<MarginProfileSpec>;
  surfaceProfile?: Partial<SurfaceProfileSpec>;
  petioleLengthM?: number;
  rachisLengthM?: number;
  rachisDroopFactor?: number;
  leafletAspect?: number;
  variance?: Partial<LeafShapeVariance>;
};

// ── Confidence ranking (for warn) ─────────────────────────────────────

const CONFIDENCE_RANK: Record<ProvenanceConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// ── resolveLeafShape ─────────────────────────────────────────────────

const SUPPORTED_VERSIONS: ReadonlySet<LeafShapeSchemaVersion> = new Set([
  'leafShape.v1',
]);

/**
 * Deep-merge cultivar override on top of DEFAULT_TOMATO_LEAF_SHAPE.
 *
 * Validation:
 *   - schemaVersion present and unsupported → throw.
 *   - provenance missing on override → warn (then inherit default).
 *   - override confidence < default confidence → warn.
 */
export function resolveLeafShape(
  override: LeafShapePartial | undefined,
): LeafShapeSpec {
  if (!override) return cloneLeafShape(DEFAULT_TOMATO_LEAF_SHAPE);

  if (override.schemaVersion && !SUPPORTED_VERSIONS.has(override.schemaVersion)) {
    throw new Error(
      `[leafShape] unsupported schemaVersion '${override.schemaVersion}'. Supported: ${[...SUPPORTED_VERSIONS].join(', ')}.`,
    );
  }

  if (!override.provenance) {
    log.warn(
      "cultivar override missing 'provenance' — inheriting default provenance. Authors should declare sourceLevel + confidence.",
    );
  } else if (override.provenance.confidence) {
    const overrideRank = CONFIDENCE_RANK[override.provenance.confidence];
    const defaultRank = CONFIDENCE_RANK[DEFAULT_TOMATO_LEAF_SHAPE.provenance.confidence];
    if (overrideRank < defaultRank) {
      log.warn(
        `override confidence '${override.provenance.confidence}' is below default '${DEFAULT_TOMATO_LEAF_SHAPE.provenance.confidence}'. This is unusual — verify cultivar JSONC.`,
      );
    }
  }

  return deepMergeLeafShape(DEFAULT_TOMATO_LEAF_SHAPE, override);
}

// ── Deep merge (typed, no shared references) ──────────────────────────

function deepMergeLeafShape(
  base: LeafShapeSpec,
  override: LeafShapePartial,
): LeafShapeSpec {
  return {
    schemaVersion: override.schemaVersion ?? base.schemaVersion,
    provenance: { ...base.provenance, ...(override.provenance ?? {}) },
    leafletCount: { ...base.leafletCount, ...(override.leafletCount ?? {}) },
    widthProfile: { ...base.widthProfile, ...(override.widthProfile ?? {}) },
    marginProfile: { ...base.marginProfile, ...(override.marginProfile ?? {}) },
    surfaceProfile: { ...base.surfaceProfile, ...(override.surfaceProfile ?? {}) },
    petioleLengthM: override.petioleLengthM ?? base.petioleLengthM,
    rachisLengthM: override.rachisLengthM ?? base.rachisLengthM,
    rachisDroopFactor: override.rachisDroopFactor ?? base.rachisDroopFactor,
    leafletAspect: override.leafletAspect ?? base.leafletAspect,
    variance: { ...base.variance, ...(override.variance ?? {}) },
  };
}

function cloneLeafShape(src: LeafShapeSpec): LeafShapeSpec {
  return {
    schemaVersion: src.schemaVersion,
    provenance: { ...src.provenance, sourceRefs: [...src.provenance.sourceRefs] },
    leafletCount: { ...src.leafletCount },
    widthProfile: { ...src.widthProfile },
    marginProfile: { ...src.marginProfile },
    surfaceProfile: { ...src.surfaceProfile },
    petioleLengthM: src.petioleLengthM,
    rachisLengthM: src.rachisLengthM,
    rachisDroopFactor: src.rachisDroopFactor,
    leafletAspect: src.leafletAspect,
    variance: { ...src.variance },
  };
}
