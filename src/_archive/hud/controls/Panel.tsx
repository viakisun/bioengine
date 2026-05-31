import { type CSSProperties, type ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Panel({ children, className, style }: PanelProps) {
  return (
    <div className={['panel', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}
