// RightBottomToggles — Iter 35 PR 2 v6 final: 2 pills (Skeleton + Settings).
//
// Phase M (v6): Skeleton _단순 toggle_ (dbl-click 패턴 폐기).
//   Settings = PillWithPopover with 4 menu items → 각 drawer 진입.
//   사용자 명시 "각각 별도로 분리" 직접 충족 (옵션 A: Settings popover + 4 drawers).

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTwinStore } from '../../state/twinStore';
import type { DrawerKind } from '../../state/twinStore';
import { Popover } from './Popover';
import { FONT_MONO, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './styles';

interface MenuItem {
  drawer: DrawerKind;
  label: string;
}

const SETTINGS_MENU: MenuItem[] = [
  { drawer: 'lighting', label: '조명 / 렌더링' },
  { drawer: 'skeleton', label: '스켈레톤' },
  { drawer: 'wind',     label: '바람' },
  { drawer: 'settings', label: '기타' },
];

/** 적엽 (defoliation) — toggle ON 시 하부 plant-local Y 30cm 이하 leaves hide. */
const DEFOLIATION_HEIGHT_CM = 30;

export function RightBottomToggles() {
  const showSkeleton = useTwinStore((s) => s.showSkeleton);
  const setShowSkeleton = useTwinStore((s) => s.setShowSkeleton);
  const defoliationHeightCm = useTwinStore((s) => s.defoliationHeightCm);
  const setDefoliationHeightCm = useTwinStore((s) => s.setDefoliationHeightCm);
  const setOpenDrawer = useTwinStore((s) => s.setOpenDrawer);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const defoliationOn = defoliationHeightCm > 0;

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
      {/* Skeleton — direct toggle (단순 click) */}
      <Pill
        label="Skeleton"
        active={showSkeleton}
        onClick={() => setShowSkeleton(!showSkeleton)}
        title="Skeleton 표시 (lush mesh hide, wireframe + 노드 markers)"
      />

      {/* 적엽 — 하부 30cm 줄기 + 잎 통째 제거 toggle */}
      <Pill
        label="적엽"
        active={defoliationOn}
        onClick={() => setDefoliationHeightCm(defoliationOn ? 0 : DEFOLIATION_HEIGHT_CM)}
        title={`하부 ${DEFOLIATION_HEIGHT_CM}cm 줄기 + 잎 통째 제거 (시각화)`}
      />

      {/* Settings — popover with 4 menu items */}
      <PillWithPopover
        label="Settings ▾"
        open={settingsOpen}
        onOpen={() => setSettingsOpen((v) => !v)}
        onClose={() => setSettingsOpen(false)}
      >
        <SettingsMenu
          items={SETTINGS_MENU}
          onSelect={(drawer) => {
            setOpenDrawer(drawer);
            setSettingsOpen(false);
          }}
        />
      </PillWithPopover>
    </div>
  );
}

// ── Settings popover menu ────────────────────────────────────────────

function SettingsMenu({
  items, onSelect,
}: { items: MenuItem[]; onSelect: (d: DrawerKind) => void }) {
  return (
    <div style={{ padding: '6px 4px', minWidth: 160 }}>
      <div style={{
        fontSize: 10,
        color: C_FG_MUTE,
        marginBottom: 6,
        padding: '0 8px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        Settings
      </div>
      {items.map((item) => (
        <MenuRow key={item.drawer} label={item.label} onClick={() => onSelect(item.drawer)} />
      ))}
    </div>
  );
}

function MenuRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontFamily: FONT_MONO,
        fontSize: 12,
        color: C_FG,
        textAlign: 'left',
        transition: 'background 80ms',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      ▸ {label}
    </button>
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

function PillWithPopover({
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
