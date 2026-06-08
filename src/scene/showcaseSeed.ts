// Iter 33 V1 baseline seed — 순환 import 회피 위해 별도 파일로 분리.
//   SceneInfrastructure 와 useSinglePlantState 둘 다 의존.

const SHOWCASE_SEED_DEFAULT = 20260520;

export function resolveShowcaseSeed(): number {
  if (typeof location !== 'undefined') {
    const param = new URLSearchParams(location.search).get('seed');
    if (param !== null) {
      const n = Number.parseInt(param, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return SHOWCASE_SEED_DEFAULT;
}

export const SHOWCASE_SEED = resolveShowcaseSeed();
