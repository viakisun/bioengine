import { useEffect, useState } from 'react';
import { LightingTab } from './LightingTab';

/**
 * Right-side slide-in drawer wrapping LightingTab. Single-plant mode has
 * no sidebar (Inspector takes that real estate), so lighting controls
 * were inaccessible — this drawer puts them one click away while leaving
 * the viewport unobstructed by default.
 *
 * Open/close:
 *   - 「조명」 button on the right edge → open
 *   - ✕ in drawer header → close
 *   - ESC key → close
 */
export function LightingDrawer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          className="lighting-drawer-toggle"
          onClick={() => setOpen(true)}
          aria-label="조명/포스트FX 패널 열기"
        >
          조명
        </button>
      )}
      <aside
        className={`lighting-drawer${open ? ' open' : ''}`}
        aria-hidden={!open}
      >
        <header className="lighting-drawer-head">
          <span>조명 / 포스트FX 튜닝</span>
          <button
            type="button"
            className="lighting-drawer-close"
            onClick={() => setOpen(false)}
            aria-label="패널 닫기"
          >
            ✕
          </button>
        </header>
        <div className="lighting-drawer-body">
          <LightingTab />
        </div>
      </aside>
    </>
  );
}
