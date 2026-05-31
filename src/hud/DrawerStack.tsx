// DrawerStack — unified right-side drawer system for single-plant mode.
// Iter 35 PR 2 Phase M: 4 drawers (lighting + skeleton + wind + settings).
//   각 drawer _완전 분리_ (사용자 명시). Settings popover (RightBottomToggles)
//   가 4 menu items로 각 drawer 진입.

import { useEffect, type ReactNode } from 'react';
import { useTwinStore } from '../state/twinStore';
import type { DrawerKind } from '../state/twinStore';
import { LightingTab } from './LightingTab';
import { SkeletonTab } from './SkeletonTab';
import { WindTab } from './WindTab';
import { SettingsTab } from './SettingsTab';

interface DrawerSpec {
  id: DrawerKind;
  label: string;
  title: string;
  content: () => ReactNode;
}

const DRAWERS: DrawerSpec[] = [
  { id: 'lighting',  label: '조명',     title: '조명 / 렌더링 설정',  content: () => <LightingTab /> },
  { id: 'skeleton',  label: '스켈레톤', title: 'Skeleton 표시 설정',  content: () => <SkeletonTab /> },
  { id: 'wind',      label: '바람',     title: '바람 설정',           content: () => <WindTab /> },
  { id: 'settings',  label: '기타',     title: '기타 설정',           content: () => <SettingsTab /> },
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
