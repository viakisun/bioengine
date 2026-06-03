// ★ S77 — Tomato Data Catalog drift guardrail.
//
// INDEX.jsonc (packages/tomato-engine/models/INDEX.jsonc) = SSOT for the
// tomato data map. This spec enforces:
//
//   1. Every `path` / `glob` in INDEX resolves to an existing file (1+ for glob)
//   2. Every runtime data file carries `"layer": "<key>"` matching INDEX layers
//   3. INDEX `layers` keys match exactly the union of `layer` fields in files
//   4. CLAUDE.md anchors both INDEX.jsonc and TOMATO_DATA_MAP.md
//
// 신규 layer/파일 추가 시 INDEX 갱신 누락을 즉시 catch.

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** Resolve `dir/*.ext` glob via readdir — no external dep. */
async function expandGlob(pattern: string): Promise<string[]> {
  const dir = path.dirname(pattern);
  const base = path.basename(pattern); // e.g. "*.jsonc" or "tomato*.jsonc"
  const star = base.indexOf('*');
  if (star < 0) {
    // not a glob — return as single file if exists
    try {
      await fs.access(pattern);
      return [pattern];
    } catch {
      return [];
    }
  }
  const prefix = base.slice(0, star);
  const suffix = base.slice(star + 1);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter(e => e.startsWith(prefix) && e.endsWith(suffix))
    .map(e => path.join(dir, e));
}

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');
const INDEX_PATH = path.join(
  REPO_ROOT,
  'packages/tomato-engine/models/INDEX.jsonc',
);
const INDEX_DIR = path.dirname(INDEX_PATH);

/** JSONC parser — strip // and block comments, drop trailing commas. */
function parseJsonc<T = unknown>(text: string): T {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped) as T;
}

interface IndexEntry {
  path?: string;
  glob?: string;
  reader: string;
  owner: string;
  lifecycle: string;
  schemaVersion?: string;
  description: string;
  runtime?: boolean;
  readOnly?: boolean;
}

interface IndexFile {
  schemaVersion: string;
  crop: string;
  layers: Record<string, IndexEntry>;
  audit: Record<string, IndexEntry>;
}

async function loadIndex(): Promise<IndexFile> {
  const text = await fs.readFile(INDEX_PATH, 'utf-8');
  return parseJsonc<IndexFile>(text);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

test.describe('S77 — Tomato Data Catalog (INDEX.jsonc) drift guardrail', () => {
  test('TOMATO-INDEX-EXISTS-01: INDEX.jsonc + TOMATO_DATA_MAP.md present', async () => {
    expect(await fileExists(INDEX_PATH), 'INDEX.jsonc exists').toBe(true);
    const mapPath = path.join(REPO_ROOT, 'docs/architecture/TOMATO_DATA_MAP.md');
    expect(await fileExists(mapPath), 'TOMATO_DATA_MAP.md exists').toBe(true);
  });

  test('TOMATO-INDEX-SCHEMA-01: INDEX.jsonc parseable + 8 singular layer keys', async () => {
    const idx = await loadIndex();
    expect(idx.schemaVersion).toBe('tomato.index.v1');
    expect(idx.crop).toBe('tomato');

    const expectedKeys = [
      'visual.leaf',
      'visual.fruit',
      'physiology',
      'botanical',
      'cultivar',
      'training',
      'calibration',
      'diagnostic',
    ];
    const actualKeys = Object.keys(idx.layers).sort();
    expect(actualKeys, 'layer keys must match (singular)').toEqual(
      expectedKeys.sort(),
    );

    // singular guard — 흔한 실수 (cultivars/trainings/diagnostics) catch
    expect(actualKeys, 'no plural keys').not.toContain('cultivars');
    expect(actualKeys, 'no plural keys').not.toContain('trainings');
    expect(actualKeys, 'no plural keys').not.toContain('diagnostics');
  });

  test('TOMATO-INDEX-PATH-RESOLVES-01: every path/glob entry resolves to existing file(s)', async () => {
    const idx = await loadIndex();

    for (const [key, entry] of Object.entries(idx.layers)) {
      if (entry.path) {
        const resolved = path.resolve(INDEX_DIR, entry.path);
        expect(
          await fileExists(resolved),
          `layer '${key}' path resolves: ${entry.path} → ${resolved}`,
        ).toBe(true);
      } else if (entry.glob) {
        const pattern = path.resolve(INDEX_DIR, entry.glob);
        const matches = await expandGlob(pattern);
        expect(
          matches.length,
          `layer '${key}' glob matches 1+: ${entry.glob}`,
        ).toBeGreaterThan(0);
      } else {
        throw new Error(`layer '${key}' has neither path nor glob`);
      }
    }

    // audit entries 동일 (단 runtime: false)
    for (const [key, entry] of Object.entries(idx.audit)) {
      if (entry.path) {
        const resolved = path.resolve(INDEX_DIR, entry.path);
        expect(
          await fileExists(resolved),
          `audit '${key}' path resolves: ${entry.path}`,
        ).toBe(true);
        expect(entry.runtime, `audit '${key}' runtime: false`).toBe(false);
        expect(entry.readOnly, `audit '${key}' readOnly: true`).toBe(true);
      }
    }
  });

  test('TOMATO-INDEX-LAYER-FIELD-01: every runtime data file carries matching layer field', async () => {
    const idx = await loadIndex();

    for (const [key, entry] of Object.entries(idx.layers)) {
      const files: string[] = [];

      if (entry.path) {
        files.push(path.resolve(INDEX_DIR, entry.path));
      } else if (entry.glob) {
        const pattern = path.resolve(INDEX_DIR, entry.glob);
        files.push(...(await expandGlob(pattern)));
      }
      expect(files.length, `layer '${key}' resolves to 1+ files`).toBeGreaterThan(0);

      for (const file of files) {
        const text = await fs.readFile(file, 'utf-8');
        const data = parseJsonc<Record<string, unknown>>(text);

        expect(
          data.layer,
          `file ${path.relative(REPO_ROOT, file)} must carry "layer": "${key}"`,
        ).toBe(key);

        expect(
          data.crop,
          `file ${path.relative(REPO_ROOT, file)} must carry "crop": "tomato"`,
        ).toBe('tomato');
      }
    }
  });

  test('TOMATO-INDEX-AUDIT-NO-LAYER-01: audit files do NOT carry runtime layer field', async () => {
    // audit (review.json)는 runtime 데이터 아님 → layer field 추가 X.
    // runtime layer field가 있으면 잘못 카탈로그됨.
    const idx = await loadIndex();
    for (const [, entry] of Object.entries(idx.audit)) {
      if (entry.path) {
        const resolved = path.resolve(INDEX_DIR, entry.path);
        const text = await fs.readFile(resolved, 'utf-8');
        const data = parseJsonc<Record<string, unknown>>(text);
        expect(data.layer, 'audit file has no runtime layer field').toBeUndefined();
      }
    }
  });

  test('TOMATO-INDEX-CLAUDE-MD-ANCHOR-01: CLAUDE.md anchors INDEX.jsonc + MAP.md', async () => {
    const claudeMd = await fs.readFile(
      path.join(REPO_ROOT, 'CLAUDE.md'),
      'utf-8',
    );
    expect(claudeMd, 'CLAUDE.md references INDEX.jsonc').toContain(
      'INDEX.jsonc',
    );
    expect(claudeMd, 'CLAUDE.md references TOMATO_DATA_MAP.md').toContain(
      'TOMATO_DATA_MAP.md',
    );
    expect(claudeMd, 'CLAUDE.md references this drift guard').toContain(
      'tomato-data-index.spec.ts',
    );
  });

  test('TOMATO-INDEX-MANIFEST-LINK-01: visual manifests link to INDEX', async () => {
    // src/data/{leaf,fruit}/manifest.json 둘 다 linkedDataIndex 보유.
    for (const subdir of ['leaf', 'fruit']) {
      const manifestPath = path.join(REPO_ROOT, `src/data/${subdir}/manifest.json`);
      const text = await fs.readFile(manifestPath, 'utf-8');
      const data = JSON.parse(text) as Record<string, unknown>;
      expect(data.crop, `${subdir}/manifest.json crop`).toBe('tomato');
      expect(
        data.linkedDataIndex,
        `${subdir}/manifest.json linkedDataIndex points to INDEX.jsonc`,
      ).toContain('packages/tomato-engine/models/INDEX.jsonc');

      // resolves
      const resolved = path.resolve(
        path.dirname(manifestPath),
        data.linkedDataIndex as string,
      );
      expect(
        await fileExists(resolved),
        `${subdir}/manifest.json linkedDataIndex resolves: ${data.linkedDataIndex} → ${resolved}`,
      ).toBe(true);
    }
  });
});
