interface MiniUWBProps {
  /** 6 zone health states; controls cell color. */
  zoneHealth: ReadonlyArray<'ok' | 'warn' | 'bad'>;
  /** Optional caption shown bottom-right (e.g. "7m · 6베드"). */
  caption?: string;
  /** Optional left caption (e.g. "0m"). */
  leftCaption?: string;
}

const COLOR_FOR: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'var(--ok-soft)',
  warn: 'var(--warn-soft)',
  bad: 'var(--bad-soft)',
};

const ANCHOR_DOT: React.CSSProperties = {
  position: 'absolute',
  width: 8,
  height: 8,
  borderRadius: 4,
  background: 'var(--accent)',
  boxShadow: '0 0 0 3px rgba(14, 165, 233, 0.18)',
};

/**
 * Compressed "top-down" UWB plan view: 4 anchors + 6 bed cells.
 * Replaces the larger Minimap component for sidebar use.
 */
export function MiniUWB({ zoneHealth, caption, leftCaption }: MiniUWBProps) {
  return (
    <div
      style={{
        position: 'relative',
        height: 96,
        padding: '10px 8px 8px',
        background: 'var(--bg-soft)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
      }}
    >
      {/* Top-left + top-right + bottom-left + bottom-right anchors */}
      <span style={{ ...ANCHOR_DOT, top: 8, left: 8 }} />
      <span style={{ ...ANCHOR_DOT, top: 8, right: 8 }} />
      <span style={{ ...ANCHOR_DOT, bottom: 8, left: 8 }} />
      <span style={{ ...ANCHOR_DOT, bottom: 8, right: 8 }} />

      {/* Bed (6 zone strip) */}
      <div
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          top: '50%',
          transform: 'translateY(-50%)',
          height: 18,
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 2,
        }}
      >
        {zoneHealth.map((h, i) => (
          <div key={i} style={{ background: COLOR_FOR[h], borderRadius: 2 }} />
        ))}
      </div>

      {leftCaption && (
        <span
          className="mono"
          style={{
            position: 'absolute',
            bottom: 8,
            left: 24,
            fontSize: 9.5,
            color: 'var(--fg-dim)',
          }}
        >
          {leftCaption}
        </span>
      )}
      {caption && (
        <span
          className="mono"
          style={{
            position: 'absolute',
            bottom: 8,
            right: 24,
            fontSize: 9.5,
            color: 'var(--fg-dim)',
          }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}
