import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

/** `id` of the tab button and `aria-labelledby` of its panel, so both stay in step. */
export const tabId = (group: string, id: string) => `${group}-tab-${id}`;
export const panelId = (group: string, id: string) => `${group}-panel-${id}`;

/** An ARIA tab list with arrow-key navigation. Render the matching content in a `TabPanel`. */
export function Tabs<T extends string>({ group, value, onChange, items, label }: { group: string; value: T; onChange: (next: T) => void; items: TabItem<T>[]; label: string }) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const enabled = items.filter((i) => !i.disabled);

  const onKeyDown = (event: KeyboardEvent) => {
    const index = enabled.findIndex((i) => i.id === value);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;
    event.preventDefault();
    const target = enabled[next];
    if (target) {
      onChange(target.id);
      refs.current.get(target.id)?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 border-b border-fluent-border">
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) refs.current.set(item.id, node);
              else refs.current.delete(item.id);
            }}
            id={tabId(group, item.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(group, item.id)}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cx(
              'focus-ring -mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
              selected ? 'border-primary text-on-surface' : 'border-transparent text-on-surface-variant hover:text-on-surface',
            )}
          >
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ group, id, value, children, className }: { group: string; id: string; value: string; children: ReactNode; className?: string }) {
  if (id !== value) return null;
  return (
    <div role="tabpanel" id={panelId(group, id)} aria-labelledby={tabId(group, id)} tabIndex={0} className={cx('focus-ring', className)}>
      {children}
    </div>
  );
}
