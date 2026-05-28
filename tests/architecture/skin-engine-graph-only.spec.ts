// SSOT #187 원칙 4 — SkinEngine purity invariant.
//
// Iter 26 PR 5-1: SkinEngine receives only the graph + scene + parent. It
// does NOT import PlantBase / PlantState / cultivar types; the
// SkinEngineRenderOpts interface does NOT name them. Biology lives in the
// populator (`buildTomatoSkeletonGraph`), not in Skin.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = process.cwd();
const SKIN_ENGINE_PATH = join(REPO_ROOT, 'src/plant/skin/SkinEngine.ts');
const DEFAULT_SKIN_ENGINE_PATH = join(REPO_ROOT, 'src/plant/skin/defaultSkinEngine.ts');

const SIM_IMPORT = /from\s+['"][^'"]*(?:PlantBase|PlantState|tomato-engine\b)[^'"]*['"]/;

function findImports(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import')) continue;
    if (SIM_IMPORT.test(line)) out.push(line.trim());
  }
  return out;
}

test.describe('SkinEngine Purity (SSOT #187 원칙 4)', () => {
  test('SKIN-PURE-01: SkinEngine.ts has zero simulation imports', async () => {
    const content = readFileSync(SKIN_ENGINE_PATH, 'utf-8');
    const violations = findImports(content);
    expect(
      violations,
      `src/plant/skin/SkinEngine.ts must not import PlantBase / PlantState /\n` +
        `tomato-engine simulation symbols. Found:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  test('SKIN-PURE-02: defaultSkinEngine.ts has zero simulation imports', async () => {
    const content = readFileSync(DEFAULT_SKIN_ENGINE_PATH, 'utf-8');
    const violations = findImports(content);
    expect(
      violations,
      `src/plant/skin/defaultSkinEngine.ts must not import simulation symbols. Found:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  test('SKIN-PURE-03: SkinEngineRenderOpts schema has no plantBase / state field', async () => {
    const content = readFileSync(SKIN_ENGINE_PATH, 'utf-8');
    // Extract interface body.
    const match = content.match(/export interface SkinEngineRenderOpts\s*\{([\s\S]*?)\n\}/);
    expect(match, 'SkinEngineRenderOpts interface found').not.toBeNull();
    const body = match![1];
    expect(body, 'no plantBase field').not.toMatch(/\bplantBase\b/);
    expect(body, 'no state field').not.toMatch(/\bstate\b/);
    expect(body, 'no cultivarKey field').not.toMatch(/\bcultivarKey\b/);
    expect(body, 'no engine field').not.toMatch(/\bengine\b/);
  });
});
