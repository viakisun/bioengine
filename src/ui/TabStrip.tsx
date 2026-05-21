import { type ReactNode } from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
}

interface TabStripProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onSelect: (id: T) => void;
  className?: string;
}

export function TabStrip<T extends string>({
  items,
  active,
  onSelect,
  className,
}: TabStripProps<T>) {
  const classes = ['tab-strip', className].filter(Boolean).join(' ');
  return (
    <div className={classes} role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={active === it.id}
          className={active === it.id ? 'is-on' : ''}
          onClick={() => onSelect(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
