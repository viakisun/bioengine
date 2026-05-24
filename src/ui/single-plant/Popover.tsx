// Popover — minimal absolute-positioned panel anchored above its trigger.
// Outside-click + ESC close. Used by RightBottomToggles for Layer / Camera
// dropdowns.

import { useEffect, useRef, type ReactNode } from 'react';
import { FONT_SANS, C_FG, C_BORDER } from './styles';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Anchor side ('right' anchors the popover's right edge to the trigger). */
  align?: 'left' | 'right';
}

export function Popover({ open, onClose, children, align = 'right' }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer to next tick — otherwise the click that opened the popover
    // immediately closes it.
    const t = window.setTimeout(() => window.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        [align]: 0,
        minWidth: 160,
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${C_BORDER}`,
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
        padding: '8px 6px',
        fontFamily: FONT_SANS,
        fontSize: 12,
        color: C_FG,
        zIndex: 50,
      }}
    >
      {children}
    </div>
  );
}
