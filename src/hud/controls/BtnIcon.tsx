import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface BtnIconProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/** 32×32 square icon button. Children should be a single glyph / SVG. */
export function BtnIcon({ children, className, ...rest }: BtnIconProps) {
  const classes = ['btn-icon', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
