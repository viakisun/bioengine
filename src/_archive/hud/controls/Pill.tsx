import { type CSSProperties, type ReactNode } from 'react';

export type PillTone = 'ok' | 'warn' | 'bad';

interface PillProps {
  children: ReactNode;
  tone?: PillTone;          // controls the status dot color (omit = no dot)
  className?: string;
  style?: CSSProperties;
}

/**
 * A glass status badge. Children are rendered inline-flex with a small
 * gap; embed `<PillSep />` between sections and `<span className="mono">`
 * around numerics so monospace numerals align.
 */
export function Pill({ children, tone, className, style }: PillProps) {
  return (
    <span className={['pill', className].filter(Boolean).join(' ')} style={style}>
      {tone && <span className={`dot${tone === 'ok' ? '' : ' dot-' + tone}`} />}
      {children}
    </span>
  );
}

export function PillSep() {
  return <span className="sep" />;
}
