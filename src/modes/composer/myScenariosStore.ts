// S2.c (RFP §15) — My Scenarios 영속 store.
//
// 사용자가 Composer에서 Save한 변형 시나리오 라이브러리.
// localStorage 영속. id 네임스페이스 'my/{slug}'.
//
// 정식 카탈로그 승격 (docs/proposal/scenarios/ 로 이동)은 거버넌스 절차 후 별도.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScenarioSpec } from '../../scenarios/types';
import type { DialKey, DialState } from './composerStore';

/** Save된 시나리오 + Composer dial 상태 보존 (Diff 가능). */
export interface SavedScenario {
  id: string;
  spec: ScenarioSpec;
  dials: Record<DialKey, DialState>;
  /** Fork 가계도 추적 — null이면 ad-hoc. */
  parentId: string | null;
  createdAt: string;
  description?: string;
}

interface MyScenariosState {
  items: SavedScenario[];
  add(item: SavedScenario): void;
  remove(id: string): void;
  clear(): void;
  byId(id: string): SavedScenario | undefined;
}

export const useMyScenariosStore = create<MyScenariosState>()(
  persist(
    (set, get) => ({
      items: [],
      add(item) {
        set((prev) => ({
          // 같은 id가 있으면 교체 (사용자 편의).
          items: [...prev.items.filter((s) => s.id !== item.id), item],
        }));
      },
      remove(id) {
        set((prev) => ({ items: prev.items.filter((s) => s.id !== id) }));
      },
      clear() {
        set({ items: [] });
      },
      byId(id) {
        return get().items.find((s) => s.id === id);
      },
    }),
    {
      name: 'phytosim:my-scenarios:v1',
    },
  ),
);
