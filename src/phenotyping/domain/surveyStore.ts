// Phenotyping survey v2 — IndexedDB persistence with two stores:
//   - surveys: SurveyRecord JSON (small ~10-100KB)
//   - panoramas: PNG Blob (1-10MB) keyed by 'panorama-{surveyId}-{side}.png'
//
// Schema v2 — panorama Blob keys live in record, actual binary in separate
// store.  Old v1 records (schemaVersion '1.0') ignored on list / get returns
// them as-is (migration is out of scope; v1 was a short-lived experiment).

import type { FruitDetection, RipenessBin, DetectorId, DetectorSource } from './detectors/types';

export const SURVEY_SCHEMA_VERSION = '2.0' as const;

export interface SurveyTotals {
  fruitCount: number;
  bins: Record<RipenessBin, number>;
  avgConfidence: number;
  pxPerM: number;
  panoramaWidthPx: number;
  panoramaHeightPx: number;
}

export interface PanoramaMeta {
  side: 'left' | 'right';
  widthPx: number;
  heightPx: number;
  pxPerM: number;
  railStartX: number;
  railEndX: number;
  blobKey: string;
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
    id: DetectorId;
    label: string;
    source: DetectorSource;
    modelUrl?: string;
    modelHash?: string;
  };

  capture: {
    frameCount: number;
    frameWidthPx: number;
    frameHeightPx: number;
    captureEveryM: number;
    speedMps: number;
  };

  panoramas: PanoramaMeta[];

  detections: FruitDetection[];
  totals: SurveyTotals;
  pathLengthM: number;
  elapsedMs: number;

  notes?: string;
  tags?: string[];
}

export interface SurveyRecordSummary {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: SurveyRecord['status'];
  scenarioId: string;
  cropDay: number;
  cropSeed: string;
  detectorLabel: string;
  totals: SurveyTotals;
  elapsedMs: number;
  tags?: string[];
}

// ── IndexedDB ──────────────────────────────────────────────────────

const DB_NAME = 'phytosim';
const DB_VERSION = 2;
const STORE_SURVEYS = 'surveys';
const STORE_PANORAMAS = 'panoramas';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      // v1 → v2: create panoramas store if missing, keep surveys.
      if (!db.objectStoreNames.contains(STORE_SURVEYS)) {
        const s = db.createObjectStore(STORE_SURVEYS, { keyPath: 'id' });
        s.createIndex('scenarioId', 'scenarioId', { unique: false });
        s.createIndex('startedAt', 'startedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PANORAMAS)) {
        db.createObjectStore(STORE_PANORAMAS); // key passed manually
      }
      // Note: ev unused — version upgrade is handled by store creation idempotency
      void ev;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
  return dbPromise;
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
    const tx = db.transaction(STORE_SURVEYS, 'readwrite');
    await reqToPromise(tx.objectStore(STORE_SURVEYS).put(record));
  },

  async list(filter?: { scenarioId?: string; fromDate?: string; toDate?: string }): Promise<SurveyRecordSummary[]> {
    const db = await openDb();
    const records = await reqToPromise(db.transaction(STORE_SURVEYS, 'readonly').objectStore(STORE_SURVEYS).getAll()) as SurveyRecord[];
    let arr = records;
    if (filter?.scenarioId) arr = arr.filter((r) => r.scenarioId === filter.scenarioId);
    if (filter?.fromDate) arr = arr.filter((r) => r.startedAt >= filter.fromDate!);
    if (filter?.toDate) arr = arr.filter((r) => r.startedAt <= filter.toDate!);
    arr.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return arr.map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      status: r.status,
      scenarioId: r.scenarioId,
      cropDay: r.cropDay,
      cropSeed: r.cropSeed,
      detectorLabel: r.detector?.label ?? '—',
      totals: r.totals,
      elapsedMs: r.elapsedMs,
      tags: r.tags,
    }));
  },

  async get(id: string): Promise<SurveyRecord | null> {
    const db = await openDb();
    const r = await reqToPromise(db.transaction(STORE_SURVEYS, 'readonly').objectStore(STORE_SURVEYS).get(id)) as SurveyRecord | undefined;
    return r ?? null;
  },

  async delete(id: string): Promise<void> {
    const db = await openDb();
    const rec = await this.get(id);
    // Delete associated panorama blobs first
    if (rec?.panoramas) {
      const tx = db.transaction(STORE_PANORAMAS, 'readwrite');
      const store = tx.objectStore(STORE_PANORAMAS);
      for (const p of rec.panoramas) {
        await reqToPromise(store.delete(p.blobKey));
      }
    }
    await reqToPromise(db.transaction(STORE_SURVEYS, 'readwrite').objectStore(STORE_SURVEYS).delete(id));
  },

  async putPanorama(key: string, blob: Blob): Promise<void> {
    const db = await openDb();
    await reqToPromise(db.transaction(STORE_PANORAMAS, 'readwrite').objectStore(STORE_PANORAMAS).put(blob, key));
  },

  async getPanorama(key: string): Promise<Blob | null> {
    const db = await openDb();
    const b = await reqToPromise(db.transaction(STORE_PANORAMAS, 'readonly').objectStore(STORE_PANORAMAS).get(key)) as Blob | undefined;
    return b ?? null;
  },

  async exportJSON(id: string): Promise<Blob> {
    const r = await this.get(id);
    if (!r) throw new Error(`Survey ${id} not found`);
    // Include panorama blobs as base64 in the exported JSON.
    const panoramasB64: Record<string, string> = {};
    for (const p of r.panoramas) {
      const blob = await this.getPanorama(p.blobKey);
      if (blob) {
        panoramasB64[p.blobKey] = await blobToBase64(blob);
      }
    }
    const payload = { record: r, panoramasB64 };
    const json = JSON.stringify(payload, null, 2);
    return new Blob([json], { type: 'application/json' });
  },

  async importJSON(blob: Blob): Promise<SurveyRecord> {
    const text = await blob.text();
    const parsed = JSON.parse(text) as { record: SurveyRecord; panoramasB64?: Record<string, string> };
    const r = parsed.record;
    if (r.schemaVersion !== SURVEY_SCHEMA_VERSION) {
      throw new Error(`Schema mismatch: expected ${SURVEY_SCHEMA_VERSION}, got ${r.schemaVersion}`);
    }
    if (parsed.panoramasB64) {
      for (const [key, b64] of Object.entries(parsed.panoramasB64)) {
        await this.putPanorama(key, base64ToBlob(b64));
      }
    }
    await this.save(r);
    return r;
  },
};

// ── helpers ────────────────────────────────────────────────────────

export function newSurveyId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const rnd = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${rnd()}-${rnd().slice(0, 4)}-4${rnd().slice(0, 3)}-${rnd().slice(0, 4)}-${rnd()}${rnd().slice(0, 4)}`;
}

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

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
