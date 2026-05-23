/**
 * Reusable sidebar control primitives: SliderRow / ToggleBtn / ColorRow.
 *
 * These were originally inline in AnalysisPanel.tsx (EnvTab). Lifted here
 * because the new LightingTab uses the same patterns and the duplicates
 * were drifting.
 *
 * All three are visual primitives — they do NOT bind to the store
 * themselves; callers wire value + onChange.
 */

import type { ReactNode } from 'react';

interface SliderRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  valueText?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function SliderRow({
  label,
  value,
  onChange,
  valueText,
  min = 0,
  max = 1,
  step = 0.05,
  disabled = false,
}: SliderRowProps) {
  return (
    <div className="slider-row">
      <div className="slider-row-header">
        <span className="tag-mute">{label}</span>
        <span className="mono tag-ok">{valueText ?? value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        className="slim"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

interface ToggleBtnProps {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}

export function ToggleBtn({ on, onClick, children, disabled }: ToggleBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn${on ? ' is-active' : ''}`}
    >
      {children}
    </button>
  );
}

interface ColorRowProps {
  label: string;
  value: string;            // hex string, "#rrggbb"
  onChange: (hex: string) => void;
}

export function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <label className="color-row">
      <span className="tag-mute">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="mono tag-dim">{value.toUpperCase()}</span>
    </label>
  );
}
