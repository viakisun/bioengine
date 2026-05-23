// DrawerStack — unified right-side drawer system for single-plant mode.
// 3 drawers: 조명 / 정보 (Inspector) / 스켈레톤.
//   • 우측 모서리에 vertical 한 tab 3개 stacked.
//   • 하나만 동시 open. tab 클릭 → 그 drawer 가 슬라이드 인 + 다른 건 close.
//   • ESC 또는 ✕ 로 close.
//
// Why a unified stack instead of 3 independent drawers:
//   • 화면 우측 공간 380px 만 사용 (배타적).
//   • 사용자가 어떤 drawer 가 열려있는지 명확.
//   • store.openDrawer 로 중앙 관리 → localStorage persist 가능 (선택).

import { useEffect, type ReactNode } from 'react';
import { useTwinStore } from '../store/twinStore';
import type { DrawerKind } from '../store/twinStore';
import { LightingTab } from './LightingTab';
import { InspectorPanel } from '../ui/single-plant/InspectorPanel';
import { SkeletonTab } from './SkeletonTab';

interface DrawerSpec {
  id: DrawerKind;
  label: string;
  title: string;
  content: () => ReactNode;
}

const DRAWERS: DrawerSpec[] = [
  { id: 'lighting',  label: '조명',     title: '조명 / 포스트FX 튜닝',  content: () => <LightingTab /> },
  { id: 'inspector', label: '정보',     title: 'Plant Inspector',       content: () => <InspectorPanel /> },
  { id: 'skeleton',  label: '스켈레톤', title: 'Skeleton 표시 설정',    content: () => <SkeletonTab /> },
];

export function DrawerStack() {
  const open = useTwinStore((s) => s.openDrawer);
  const setOpen = useTwinStore((s) => s.setOpenDrawer);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const active = DRAWERS.find((d) => d.id === open);

  return (
    <>
      {/* Toggle 탭 — drawer 가 닫혀있을 때만 표시 */}
      {!open && (
        <div className="drawer-toggles">
          {DRAWERS.map((d) => (
            <button
              key={d.id}
              type="button"
              className="drawer-toggle"
              onClick={() => setOpen(d.id)}
              aria-label={`${d.title} 열기`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* Drawer body — 활성 drawer 의 content. */}
      <aside
        className={`lighting-drawer${open ? ' open' : ''}`}
        aria-hidden={!open}
      >
        {active && (
          <>
            <header className="lighting-drawer-head">
              <span>{active.title}</span>
              <button
                type="button"
                className="lighting-drawer-close"
                onClick={() => setOpen(null)}
                aria-label="패널 닫기"
              >
                ✕
              </button>
            </header>
            <div className="lighting-drawer-body">
              {active.content()}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
