// Showcase seed — lives in its own file because both SceneInfrastructure
// and useSinglePlantState import it.

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
