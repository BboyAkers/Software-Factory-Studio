import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { portalRoot } from './portal';
import { cx } from './cx';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

interface Position {
  left: number;
  top: number;
  minWidth: number;
  above: boolean;
}

/** Fixed-position panel anchored to an element: closes on outside press, Escape, resize, and scroll of the page. */
function usePanel(open: boolean, onClose: () => void, anchor: React.RefObject<HTMLElement | null>, align: 'start' | 'end') {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const height = panel.current?.offsetHeight ?? 0;
    const width = panel.current?.offsetWidth ?? 0;
    const above = rect.bottom + height + 8 > window.innerHeight && rect.top > height + 8;
    const left = align === 'end' ? Math.max(8, rect.right - Math.max(width, rect.width)) : Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    setPosition({ left, top: above ? rect.top - height - 4 : rect.bottom + 4, minWidth: rect.width, above });
  }, [open, align, anchor]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Handled here, so an enclosing dialog must not also see it as a request to close.
        event.preventDefault();
        event.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, { capture: true });
    };
  }, [open, onClose, anchor]);

  return { panel, position };
}

export interface TriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
}

/** A floating panel for arbitrary content (a "who paused this" card, a queue list). For a list of actions use `Menu`. */
export function Popover({ trigger, children, align = 'start', className, label }: { trigger: (props: TriggerProps) => ReactElement; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; className?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  const { panel, position } = usePanel(open, close, anchor, align);
  return (
    <>
      {trigger({ ref: anchor, onClick: () => setOpen((o) => !o), 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? id : undefined })}
      {open &&
        createPortal(
          <div ref={panel} id={id} role="dialog" aria-label={label} style={{ position: 'fixed', left: position?.left ?? -9999, top: position?.top ?? -9999, minWidth: position?.minWidth }} className={cx('z-50 rounded-lg border border-fluent-border-high bg-surface-card-high shadow-fluent-elevation-16', className)}>
            {children(close)}
          </div>,
          portalRoot(anchor.current),
        )}
    </>
  );
}

export interface MenuItem {
  id: string;
  label: ReactNode;
  /** A second, quieter line under the label. */
  description?: ReactNode;
  /** Marks the item that is already selected (the current project). */
  current?: boolean;
  icon?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Why it is disabled: "Requires Maintainer". The item stays reachable by keyboard so the reason can be read. */
  reason?: string;
  tone?: 'danger';
  separatorBefore?: boolean;
}

/** A menu of actions with arrow-key navigation. Disabled items explain themselves instead of vanishing. */
export function Menu({ trigger, items, align = 'end', label }: { trigger: (props: TriggerProps) => ReactElement; items: MenuItem[]; align?: 'start' | 'end'; label: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  const { panel, position } = usePanel(open, close, anchor, align);

  useEffect(() => {
    if (open && position) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, position, panel]);

  const move = (delta: number, from: HTMLElement | null, absolute?: 'first' | 'last') => {
    const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (nodes.length === 0) return;
    const index = from ? nodes.indexOf(from) : -1;
    const next = absolute === 'first' ? 0 : absolute === 'last' ? nodes.length - 1 : (index + delta + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <>
      {trigger({ ref: anchor, onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? id : undefined })}
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label={label}
            style={{ position: 'fixed', left: position?.left ?? -9999, top: position?.top ?? -9999, minWidth: Math.max(176, position?.minWidth ?? 0) }}
            onKeyDown={(event) => {
              const current = document.activeElement as HTMLElement | null;
              switch (event.key) {
                case 'ArrowDown':
                  event.preventDefault();
                  move(1, current);
                  break;
                case 'ArrowUp':
                  event.preventDefault();
                  move(-1, current);
                  break;
                case 'Home':
                  event.preventDefault();
                  move(0, current, 'first');
                  break;
                case 'End':
                  event.preventDefault();
                  move(0, current, 'last');
                  break;
                case 'Tab':
                  close();
                  break;
              }
            }}
            className="z-50 rounded-lg border border-fluent-border-high bg-surface-card-high py-1 shadow-fluent-elevation-16"
          >
            {items.map((item) => (
              <div key={item.id}>
                {item.separatorBefore && <div role="separator" className="my-1 border-t border-fluent-border" />}
                <Tooltip content={item.disabled ? item.reason : null} side="bottom">
                  <button
                    type="button"
                    role="menuitem"
                    aria-disabled={item.disabled || undefined}
                    aria-current={item.current ? 'true' : undefined}
                    onClick={() => {
                      if (item.disabled) return;
                      close();
                      item.onSelect();
                    }}
                    className={cx(
                      'focus-ring flex min-h-8 w-full items-center gap-2 px-3 py-1 text-left text-[13px] transition-colors duration-100 outline-offset-[-2px]',
                      item.disabled ? 'cursor-not-allowed text-on-surface-muted' : item.tone === 'danger' ? 'text-fluent-danger-text hover:bg-fluent-error/15 focus:bg-fluent-error/15' : 'text-on-surface hover:bg-white/8 focus:bg-white/8',
                    )}
                  >
                    {item.icon ? <Icon name={item.icon} size={16} /> : <span className="size-4 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      {item.description && <span className="block truncate text-[12px] leading-4 text-on-surface-variant">{item.description}</span>}
                    </span>
                    {item.current && <Icon name="check" size={16} className="shrink-0 text-fluent-blue-light" />}
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>,
          portalRoot(anchor.current),
        )}
    </>
  );
}
