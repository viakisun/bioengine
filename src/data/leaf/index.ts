// ★ Iter 39 Phase L4-4 (S32) — Leaf spec data registry.
//
// 책임 (원칙 #42 — engine purity):
//   - src/scene/leaf/ (engine) = plant-agnostic 산식 — _"tomato" 단어 0_
//   - src/data/leaf/  (data)   = crop/cultivar JSON spec + registry (이 파일)
//
// engine은 spec을 _주입받아_ mesh를 만든다. plant identifier ('tomato.json')는
// _caller_ (application 선택) + _registry key_에만 존재.
//
// 연구자: src/data/leaf/specs/*.json 수정 → 코드 변경 없이 실험 설계.

import { parseLeafSpec, type LeafSpec } from '../../scene/leaf/LeafSpec';
import tomatoJson from './specs/tomato.json' with { type: 'json' };

/**
 * Registry — manifest 기반 dispatch.
 * 미래 cucumber/lettuce 등 plant 추가 시 _이 entry만_ 추가, engine 변경 0.
 */
const REGISTRY: Record<string, unknown> = {
  'tomato.json': tomatoJson,
  // 'cucumber.json': cucumberJson,
  // 'lettuce.json': lettuceJson,
};

const cache = new Map<string, LeafSpec>();

/**
 * Load + validate a leaf spec by registry name.
 * Throws on unknown name or schema mismatch (Zod ZodError).
 */
export function getLeafSpec(name: string): LeafSpec {
  const cached = cache.get(name);
  if (cached) return cached;
  const raw = REGISTRY[name];
  if (!raw) {
    throw new Error(
      `LeafSpec not found: '${name}'. Available: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  const spec = parseLeafSpec(raw);
  cache.set(name, spec);
  return spec;
}

/** Names registered in the registry — useful for UI dropdowns / debug. */
export function listAvailableLeafSpecs(): string[] {
  return Object.keys(REGISTRY);
}
