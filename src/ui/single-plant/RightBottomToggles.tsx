// RightBottomToggles — Iter 35 PR 2 Phase J: 2 pills only (Skeleton + Settings).
//
// Phase J: Layer/Skin/Heatmap/Metrics/Camera 5 pills 제거.
//   PillWithPopover + Section + CheckRow + RadioRow + Popover은 _보존_
//   (Phase M Settings popover에서 재사용).
//
// Phase M (예정): Skeleton dbl-click → drawer 폐기 (단순 toggle).
//   Settings = PillWithPopover (4 menu items → lighting/skeleton/wind/settings drawer).

import { type CSSProperties, type ReactNode } from 'react';
import { useTwinStore } from '../../store/twinStore';
import { Popover } from './Popover';
import { FONT_MONO, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './styles';

export function RightBottomToggles() {
  const showSkeleton = useTwinStore((s) => s.showSkeleton);
  const setShowSkeleton = useTwinStore((s) => s.setShowSkeleton);
  const setOpenDrawer = useTwinStore((s) => s.setOpenDrawer);

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 88,
        pointerEvents: 'auto',
        display: 'flex',
        gap: 6,
        alignItems: 'flex-end',
      }}
    >
      {/* Skeleton — direct toggle */}
      <Pill
        label="Skeleton"
        active={showSkeleton}
        onClick={() => setShowSkeleton(!showSkeleton)}
        title="Skeleton 표시 (lush mesh hide, wireframe + 노드 markers)"
      />

      {/* Settings — Phase M: PillWithPopover (4-menu) 변환 예정. 현재는 lighting drawer 직접. */}
      <Pill
        label="Settings"
        active={false}
        onClick={() => setOpenDrawer('lighting')}
        title="조명 · 환경 · 렌더 설정 (Phase M에서 4-menu popover로 확장)"
      />
    </div>
  );
}

// ── Pill primitives ──────────────────────────────────────────────────

function Pill({
  label, active, disabled, onClick, title,
}: { label: string; active: boolean; disabled?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={!disabled ? onClick : undefined}
      title={title}
      style={pillStyle(active, !!disabled)}
    >
      {label}
    </button>
  );
}

/** Phase M 사용 예정 — Settings popover에서 4-menu 표시. */
export function PillWithPopover({
  label, open, onOpen, onClose, children,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onOpen}
        style={pillStyle(open, false)}
        aria-expanded={open}
      >
        {label}
      </button>
      <Popover open={open} onClose={onClose}>{children}</Popover>
    </div>
  );
}

function pillStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    background: active ? C_ACCENT : 'rgba(255, 255, 255, 0.92)',
    color: active ? '#fff' : (disabled ? C_FG_MUTE : C_FG),
    border: `1px solid ${active ? C_ACCENT : C_BORDER}`,
    borderRadius: 18,
    padding: '6px 12px',
    fontSize: 11,
    fontFamily: FONT_MONO,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    letterSpacing: '0.02em',
    height: 28,
    whiteSpace: 'nowrap',
  };
}

// ── Popover content rows (Phase M 재사용) ────────────────────────────────

/** Section header for popover groups. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ padding: '4px 8px', minWidth: 140 }}>
      <div style={{ fontSize: 10, color: C_FG_MUTE, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </div>
  );
}
