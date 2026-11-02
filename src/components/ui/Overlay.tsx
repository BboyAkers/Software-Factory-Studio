import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from './cx';
import { IconButton } from './Button';

interface ShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Escape and a click on the backdrop close it. Turn off while a request is in flight. */
  dismissible?: boolean;
  /** Extra header content next to the close button (badges, a menu). */
  headerExtra?: ReactNode;
}

/**
 * Shared by Dialog and Drawer. It is a native `<dialog>` opened with `showModal()`, so the browser traps focus,
 * makes the page behind inert, closes on Escape, and returns focus to whatever opened it.
 * Children are mounted only while open, so a closed form never keeps stale state.
 */
function Modal({ open, onClose, title, description, children, footer, dismissible = true, headerExtra, side, panelClass }: ShellProps & { side: 'center' | 'left' | 'right'; panelClass: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-side={side === 'center' ? undefined : side}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        // A click that lands on the dialog element itself, not on its panel, is a click on the backdrop.
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={cx(
        'm-0 bg-transparent p-0 text-on-surface backdrop:bg-black/60',
        side === 'right' && 'fixed inset-y-0 right-0 left-auto h-dvh max-h-none max-w-[100vw]',
        side === 'left' && 'fixed inset-y-0 right-auto left-0 h-dvh max-h-none max-w-[100vw]',
        side === 'center' && 'm-auto max-h-[88vh] max-w-[calc(100vw-2rem)]',
        panelClass,
      )}
    >
      {open && (
        <div className={cx('flex min-h-0 flex-col border border-fluent-border bg-surface-card shadow-fluent-elevation-28', side === 'right' && 'h-full rounded-l-lg', side === 'left' && 'h-full rounded-r-lg', side === 'center' && 'max-h-[88vh] rounded-lg')}>
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-fluent-border px-5 pt-4 pb-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[16px] leading-6 font-semibold text-on-surface">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-[13px] leading-5 text-on-surface-variant">
                  {description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {headerExtra}
              <IconButton icon="close" label="Close" onClick={onClose} />
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-fluent-border px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

const DIALOG_WIDTH = { sm: 'w-[420px]', md: 'w-[560px]', lg: 'w-[760px]' } as const;
const DRAWER_WIDTH = { sm: 'w-[300px]', md: 'w-[480px]', lg: 'w-[640px]', xl: 'w-[820px]' } as const;

/** A centered modal. Use it only when the task cannot continue until the person answers (spec: modals only when needed). */
export function Dialog({ size = 'md', ...props }: ShellProps & { size?: keyof typeof DIALOG_WIDTH }) {
  return <Modal {...props} side="center" panelClass={DIALOG_WIDTH[size]} />;
}

/** A panel that slides in from the right (or the left, for navigation) and keeps the page behind it in context. */
export function Drawer({ size = 'md', placement = 'right', ...props }: ShellProps & { size?: keyof typeof DRAWER_WIDTH; placement?: 'left' | 'right' }) {
  return <Modal {...props} side={placement} panelClass={DRAWER_WIDTH[size]} />;
}
