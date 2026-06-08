// S1.f (RFP §15) — ValueChip.
//
// 헤더에 노출하는 V1~V5 가치명제 칩. 현재 화면이 어떤 가치를 실현하는지 30초 안에 전달
// (UX 원칙 §3.6 #1). 모드별로 활성 가치명제 색상 진하게, 비활성은 dim.

import { BRAND, type ValuePropKey } from '../modes/brand';

interface ValueChipProps {
  /** 강조할 가치명제 (mode.valueProps). 비어 있으면 전부 dim. */
  active: readonly ValuePropKey[];
  /** 컴팩트 모드 — 약자만 표시 (헤더 좁을 때). */
  compact?: boolean;
}

export function ValueChip({ active, compact = false }: ValueChipProps) {
  const activeSet = new Set(active);

  return (
    <div
      className="phytosim-valuechip-row"
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}
      aria-label="활성 가치명제"
    >
      {BRAND.valueProps.map((v) => {
        const isActive = activeSet.has(v.key);
        return (
          <span
            key={v.key}
            className={`phytosim-valuechip ${isActive ? 'active' : 'dim'}`}
            title={`${v.key} — ${v.name}: ${v.description}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: compact ? '2px 6px' : '3px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              background: isActive ? 'var(--p-accent-muted, #d6e4ff)' : 'transparent',
              color: isActive ? 'var(--p-fg, #1a1a1a)' : 'var(--p-fg-dim, #888)',
              border: `1px solid ${isActive ? 'var(--p-border-accent, #4080d0)' : 'var(--p-border, #ddd)'}`,
              lineHeight: 1.2,
              userSelect: 'none',
              cursor: 'default',
            }}
          >
            <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{v.key}</span>
            {!compact && <span>{v.ko}</span>}
          </span>
        );
      })}
    </div>
  );
}
