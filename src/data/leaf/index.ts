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

import {
  parseLeafSpec,
  type LeafSpec,
  type MeshConfigPreset,
  type MeshPresetKey,
} from '../../scene/leaf/LeafSpec';
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

// ─── Mesh preset selection (★ S142) ───────────────────────────────────────

/** ★ S142 — SSR/test 환경 안전한 URL lookup. */
function readLeafConfigFromUrl(): string | null {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) return null;
  const loc = (globalThis as { location?: Location }).location;
  if (!loc) return null;
  try {
    return new URLSearchParams(loc.search).get('leafConfig');
  } catch {
    return null;
  }
}

function isValidMeshPresetKey(k: string | null | undefined): k is MeshPresetKey {
  return k === 'baseline' || k === 'lite' || k === 'aggressive';
}

/**
 * ★ S142 — Active mesh preset 선택.
 *   우선순위:
 *     1) `overrideKey` (Playwright probe / programmatic 직접 주입)
 *     2) URL `?leafConfig=baseline|lite|aggressive`
 *     3) `spec.meshConfig.default`
 *   알 수 없는 key는 default로 fallback.
 */
export function getActiveMeshPreset(
  spec: LeafSpec,
  overrideKey?: string | null,
): { key: MeshPresetKey; preset: MeshConfigPreset } {
  const raw = overrideKey ?? readLeafConfigFromUrl();
  const key: MeshPresetKey = isValidMeshPresetKey(raw) ? raw : spec.meshConfig.default;
  return { key, preset: spec.meshConfig.presets[key] };
}
