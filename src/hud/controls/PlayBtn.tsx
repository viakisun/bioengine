import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface PlayBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'md' | 'lg';
}

/** Round dark play/pause button. 44px default, 52px for `lg`. */
export function PlayBtn({ children, size = 'md', className, ...rest }: PlayBtnProps) {
  const classes = ['play-btn', size === 'lg' ? 'lg' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
