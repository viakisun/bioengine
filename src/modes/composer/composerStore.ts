// S2.b·c (RFP §15) — Composer 상태 모델.
//
// 시나리오는 불변 템플릿, Composer는 그 위에서 25개 dial로 fine-tune.
// S2 mvp는 5 dial만 (day · seed · cultivar · leafDensityScale · manualHour).
// 나머지 20 dial은 후속 슬라이스에서 확장.
//
// Lock/Variable 토글:
//   - Lock: 고정 값. 모든 frame에 동일.
//   - Variable: Foundry 매트릭스 차원으로 promote (S5에서 활용).

import { create } from 'zustand';
import type { ScenarioSpec } from '../../scenarios/types';

/** S2 mvp 다이얼 키 (5개). 후속 슬라이스에서 확장. */
export type DialKey = 'day' | 'seed' | 'cultivar' | 'leafDensityScale' | 'manualHour';

export type DialMode = 'lock' | 'variable';

export interface DialState {
  value: number | string;
  mode: DialMode;
}

export interface ComposerState {
  /** Fork 베이스 시나리오 (없으면 ad-hoc 신규). */
  base: ScenarioSpec | null;
  /** 5 dial 상태. */
  dials: Record<DialKey, DialState>;
  /** 작성 중 임시 id (Save 시 사용자가 확정). */
  draftId: string;
  /** Save 후 발급된 영구 id (이후 fork 가능). */
  savedId: string | null;

  loadFromScenario(s: ScenarioSpec): void;
  resetToAdHoc(): void;
  setDial(key: DialKey, value: number | string): void;
  toggleDialMode(key: DialKey): void;
  setDraftId(id: string): void;
  setSavedId(id: string | null): void;
}

/** 시나리오 → 5 dial 초깃값 변환. */
function dialsFrom(s: ScenarioSpec): Record<DialKey, DialState> {
  return {
    day: { value: s.crop.day, mode: 'lock' },
    seed: { value: s.crop.seed, mode: 'lock' },
    cultivar: { value: s.crop.cultivar ?? 'tomimaru', mode: 'lock' },
    leafDensityScale: {
      value: s.crop.perturbation?.leafDensityScale ?? 1.0,
      mode: 'lock',
    },
    manualHour: { value: s.env.manualHour, mode: 'lock' },
  };
}

function defaultDials(): Record<DialKey, DialState> {
  return {
    day: { value: 60, mode: 'lock' },
    seed: { value: '0xC0FFEE', mode: 'lock' },
    cultivar: { value: 'tomimaru', mode: 'lock' },
    leafDensityScale: { value: 1.0, mode: 'lock' },
    manualHour: { value: 12, mode: 'lock' },
  };
}

export const useComposerStore = create<ComposerState>((set) => ({
  base: null,
  dials: defaultDials(),
  draftId: '',
  savedId: null,

  loadFromScenario(s) {
    set({
      base: s,
      dials: dialsFrom(s),
      draftId: `${s.id}-fork`,
      savedId: null,
    });
  },

  resetToAdHoc() {
    set({
      base: null,
      dials: defaultDials(),
      draftId: 'my-scenario',
      savedId: null,
    });
  },

  setDial(key, value) {
    set((prev) => ({
      dials: { ...prev.dials, [key]: { ...prev.dials[key], value } },
    }));
  },

  toggleDialMode(key) {
    set((prev) => ({
      dials: {
        ...prev.dials,
        [key]: { ...prev.dials[key], mode: prev.dials[key].mode === 'lock' ? 'variable' : 'lock' },
      },
    }));
  },

  setDraftId(id) {
    set({ draftId: id });
  },

  setSavedId(id) {
    set({ savedId: id });
  },
}));

/** Composer dials를 ScenarioSpec 부분으로 변환 (Save·Run에 사용). */
export function dialsToScenarioPatch(dials: Record<DialKey, DialState>): Pick<ScenarioSpec, 'crop' | 'env'> {
  return {
    crop: {
      day: Number(dials.day.value),
      seed: String(dials.seed.value),
      cultivar: String(dials.cultivar.value),
      perturbation: {
        leafDensityScale: Number(dials.leafDensityScale.value),
      },
    },
    env: {
      manualHour: Number(dials.manualHour.value),
      lightingPreset: 'default',
    },
  };
}

/** 두 dial 상태 diff (변경된 dial만 강조). */
export interface DialDiff {
  key: DialKey;
  base: number | string;
  next: number | string;
  modeChanged: boolean;
}

export function diffDials(
  a: Record<DialKey, DialState>,
  b: Record<DialKey, DialState>,
): DialDiff[] {
  const out: DialDiff[] = [];
  for (const k of Object.keys(a) as DialKey[]) {
    const av = a[k];
    const bv = b[k];
    const valueChanged = av.value !== bv.value;
    const modeChanged = av.mode !== bv.mode;
    if (valueChanged || modeChanged) {
      out.push({ key: k, base: av.value, next: bv.value, modeChanged });
    }
  }
  return out;
}
