// Phenotyping survey — IndexedDB persistence.
//
// A SurveyRecord ~ 500KB-2MB (zones × fruits × full FruitDetection).
// LocalStorage's 5MB cap is too small for accumulation; IndexedDB handles
// large structured records and is supported in every modern browser.
//
// Wrapper uses raw IndexedDB (no `idb` dep) — small Promise wrappers.

import type { FruitDetection } from './detect';

export const SURVEY_SCHEMA_VERSION = '1.0' as const;

export type RipenessBin = 'green' | 'breaker' | 'turning' | 'pink' | 'red';

export interface SurveyTotals {
  zoneCount: number;
  fruitCount: number;
  weightedCount: number;
  bins: Record<RipenessBin, number>;
  weightedBins: Record<RipenessBin, number>;
  /** Mean per-zone coverage (∈[0,1]). */
  coverage: number;
  /** Mean per-zone avgConfidence. */
  avgConfidence: number;
}

export interface ZoneRecord {
  zoneId: string;
  index: number;
  direction: 'forward' | 'return';
  bedSide: 'left' | 'right';
  targetBedId: number;
  railX: number;
  capturedAt: string;
  /** Full per-detection list — supports later re-analysis. */
  fruits: FruitDetection[];
  fruitCount: number;
  weightedCount: number;
  bins: Record<RipenessBin, number>;
  weightedBins: Record<RipenessBin, number>;
  coverage: number;
  avgConfidence: number;
  expectedFruitCount: number;
}

export interface SurveyRecord {
  id: string;
  schemaVersion: typeof SURVEY_SCHEMA_VERSION;
  startedAt: string;
  completedAt: string | null;
  status: 'completed' | 'aborted' | 'in-progress';
  abortReason?: string;

  scenarioId: string;
  scenarioVersion: string;
  cropDay: number;
  cropSeed: string;
  cropCultivar: string;
  cropMinute: number;

  envLightingPreset: string;
  envManualHour: number;

  robotProfile: string;
  cameraConfig: { lensFovDeg: number; mountHeightM: number };
  rule: string;

  detector: {
    version: 'gt-v1';
    workingDistanceM: { min: number; max: number };
    referenceSolidAngleSr: number;
    occlusionMode: 'none' | 'raycast' | 'depth-buffer';
  };

  zones: ZoneRecord[];
  totals: SurveyTotals;
  pathLengthM: number;
  elapsedMs: number;

  notes?: string;
  tags?: string[];
}

/** Summary returned by list() — omits the heavy zones+fruits arrays. */
export interface SurveyRecordSummary {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: SurveyRecord['status'];
  scenarioId: string;
  cropDay: number;
  cropSeed: string;
  totals: SurveyTotals;
  elapsedMs: number;
  tags?: string[];
}

// ── IndexedDB plumbing ──────────────────────────────────────────────

const DB_NAME = 'phytosim';
const DB_VERSION = 1;
const STORE = 'surveys';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('scenarioId', 'scenarioId', { unique: false });
        store.createIndex('startedAt', 'startedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
  return dbPromise;
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
  });
}

// ── Public API ─────────────────────────────────────────────────────

export const surveyStore = {
  async save(record: SurveyRecord): Promise<void> {
    const db = await openDb();
    await reqToPromise(txStore(db, 'readwrite').put(record));
  },

  async list(filter?: { scenarioId?: string; fromDate?: string; toDate?: string }): Promise<SurveyRecordSummary[]> {
    const db = await openDb();
    const records = await reqToPromise(txStore(db, 'readonly').getAll()) as SurveyRecord[];
    let arr = records;
    if (filter?.scenarioId) arr = arr.filter((r) => r.scenarioId === filter.scenarioId);
    if (filter?.fromDate) arr = arr.filter((r) => r.startedAt >= filter.fromDate!);
    if (filter?.toDate) arr = arr.filter((r) => r.startedAt <= filter.toDate!);
    arr.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)); // newest first
    return arr.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      status: r.status,
      scenarioId: r.scenarioId,
      cropDay: r.cropDay,
      cropSeed: r.cropSeed,
      totals: r.totals,
      elapsedMs: r.elapsedMs,
      tags: r.tags,
    }));
  },

  async get(id: string): Promise<SurveyRecord | null> {
    const db = await openDb();
    const r = await reqToPromise(txStore(db, 'readonly').get(id)) as SurveyRecord | undefined;
    return r ?? null;
  },

  async delete(id: string): Promise<void> {
    const db = await openDb();
    await reqToPromise(txStore(db, 'readwrite').delete(id));
  },

  async exportJSON(id: string): Promise<Blob> {
    const r = await this.get(id);
    if (!r) throw new Error(`Survey ${id} not found`);
    const json = JSON.stringify(r, null, 2);
    return new Blob([json], { type: 'application/json' });
  },

  async importJSON(blob: Blob): Promise<SurveyRecord> {
    const text = await blob.text();
    const r = JSON.parse(text) as SurveyRecord;
    if (r.schemaVersion !== SURVEY_SCHEMA_VERSION) {
      throw new Error(`Schema mismatch: expected ${SURVEY_SCHEMA_VERSION}, got ${r.schemaVersion}`);
    }
    await this.save(r);
    return r;
  },
};

// ── Helper: generate uuid v4 (no deps) ───────────────────────────────

export function newSurveyId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: pseudo-uuid (sufficient for collision rarity in this app)
  const rnd = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${rnd()}-${rnd().slice(0, 4)}-4${rnd().slice(0, 3)}-${rnd().slice(0, 4)}-${rnd()}${rnd().slice(0, 4)}`;
}

// ── Helper: trigger browser file download for a Blob ─────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
