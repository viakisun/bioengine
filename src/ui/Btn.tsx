import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
  ghost?: boolean;
}

export function Btn({ children, active, ghost, className, ...rest }: BtnProps) {
  const base = ghost ? 'btn-ghost' : 'btn';
  const classes = [base, active ? 'is-active' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
