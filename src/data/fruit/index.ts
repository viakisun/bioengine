// ★ Iter 39 Phase L7-A-2 (S62) — Fruit spec data registry.
//
// 책임 (원칙 #42 — engine purity):
//   - src/scene/fruit/ (engine) = plant-agnostic 산식 — _'tomato' 단어 0_
//   - src/data/fruit/  (data)   = crop/cultivar JSON spec + registry (이 파일)
//
// engine은 spec을 _주입받아_ fruit mesh + material을 만든다. plant identifier
// ('tomato.json')는 _caller_ (application 선택) + _registry key_에만 존재.

import { parseFruitSpec, type FruitSpec } from '../../scene/fruit/FruitSpec';
import tomatoJson from './specs/tomato.json' with { type: 'json' };

const REGISTRY: Record<string, unknown> = {
  'tomato.json': tomatoJson,
};

const cache = new Map<string, FruitSpec>();

/**
 * Load + validate a fruit spec by registry name.
 * Throws on unknown name or schema mismatch (Zod ZodError).
 */
export function getFruitSpec(name: string): FruitSpec {
  const cached = cache.get(name);
  if (cached) return cached;
  const raw = REGISTRY[name];
  if (!raw) {
    throw new Error(
      `FruitSpec not found: '${name}'. Available: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  const spec = parseFruitSpec(raw);
  cache.set(name, spec);
  return spec;
}

export function listAvailableFruitSpecs(): string[] {
  return Object.keys(REGISTRY);
}
