import { type ReactNode } from 'react';

interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

/** Small-caps section label. Use above a Panel section title. */
export function Eyebrow({ children, className }: EyebrowProps) {
  const classes = ['h-eyebrow', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}
