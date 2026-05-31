// RightBottomToggles — compact HUD pills replacing the old left-dock
// Display / Camera sections. Direct toggles for the binary actions
// (Skeleton, Heatmap, Settings) and popover dropdowns for the multi-
// choice ones (Layer set, Camera preset).

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTwinStore } from '../../store/twinStore';
import { Popover } from './Popover';
import { FONT_MONO, C_FG, C_FG_MUTE, C_BORDER, C_ACCENT } from './styles';

type Camera = 'free' | 'truss' | 'fruit' | 'top';

const CAMERAS: { id: Camera; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'truss', label: 'Truss' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'top', label: 'Top' },
];

export function RightBottomToggles() {
  const camera = useTwinStore((s) => s.singlePlantCamera);
  const setCamera = useTwinStore((s) => s.setSinglePlantCamera);
  const showSkeleton = useTwinStore((s) => s.showSkeleton);
  const setShowSkeleton = useTwinStore((s) => s.setShowSkeleton);
  const setOpenDrawer = useTwinStore((s) => s.setOpenDrawer);
  const metricsOpen = useTwinStore((s) => s.singlePlantMetricsOpen);
  const toggleMetrics = useTwinStore((s) => s.toggleSinglePlantMetrics);

  const [layerOpen, setLayerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

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
      {/* Layer — popover */}
      <PillWithPopover
        label="Layer"
        open={layerOpen}
        onOpen={() => setLayerOpen((v) => !v)}
        onClose={() => setLayerOpen(false)}
      >
        <Section label="Layer">
          <CheckRow label="Plant" checked disabled />
          <CheckRow
            label="Skeleton"
            checked={showSkeleton}
            onClick={() => setShowSkeleton(!showSkeleton)}
          />
          <CheckRow label="Wireframe" checked={false} disabled />
          <CheckRow label="Heatmap" checked={false} disabled />
          <CheckRow label="Light field" checked={false} disabled />
        </Section>
      </PillWithPopover>

      {/* Skeleton — direct toggle */}
      <Pill
        label="Skeleton"
        active={showSkeleton}
        onClick={() => setShowSkeleton(!showSkeleton)}
        title="Skeleton 표시 (lush mesh hide, 노드/곁가지/apex 만)"
      />

      {/* Iter 35 PR 2: Skin pill 제거 — SkinMesh가 유일 renderer (toggle 부재). */}

      {/* Heatmap — disabled stub */}
      <Pill label="Heatmap" active={false} disabled title="Phase E+" />

      {/* Metrics — chart panel toggle */}
      <Pill
        label="Metrics"
        active={metricsOpen}
        onClick={toggleMetrics}
        title="LAI / H / Fruits 시계열 차트"
      />

      {/* Camera — popover */}
      <PillWithPopover
        label={`Camera · ${CAMERAS.find((c) => c.id === camera)?.label ?? 'Free'}`}
        open={cameraOpen}
        onOpen={() => setCameraOpen((v) => !v)}
        onClose={() => setCameraOpen(false)}
      >
        <Section label="Camera">
          {CAMERAS.map((c) => (
            <RadioRow
              key={c.id}
              label={c.label}
              checked={camera === c.id}
              onSelect={() => {
                setCamera(c.id);
                setCameraOpen(false);
              }}
            />
          ))}
        </Section>
      </PillWithPopover>

      {/* Settings — opens lighting drawer */}
      <Pill
        label="Settings"
        active={false}
        onClick={() => setOpenDrawer('lighting')}
        title="조명 · 환경 · 렌더 설정"
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

// ── Popover content rows ─────────────────────────────────────────────

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ padding: '4px 8px', minWidth: 140 }}>
      <div style={{ fontSize: 10, color: C_FG_MUTE, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function CheckRow({
  label, checked, disabled, onClick,
}: { label: string; checked: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={!disabled && onClick ? onClick : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontFamily: FONT_MONO,
        fontSize: 11,
        cursor: !disabled && onClick ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1,
        color: checked ? C_FG : C_FG_MUTE,
      }}
    >
      <span style={{ width: 12 }}>{checked ? '☑' : '☐'}</span>
      <span>{label}</span>
    </div>
  );
}

function RadioRow({
  label, checked, onSelect,
}: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontFamily: FONT_MONO,
        fontSize: 11,
        cursor: 'pointer',
        color: checked ? C_FG : C_FG_MUTE,
      }}
    >
      <span style={{ width: 12 }}>{checked ? '◉' : '○'}</span>
      <span>{label}</span>
    </div>
  );
}
