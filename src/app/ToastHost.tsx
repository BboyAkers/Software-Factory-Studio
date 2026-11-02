import { useEffect, useRef } from 'react';
import { Button, Icon, IconButton, TONE_TEXT, type Tone } from '../components/ui';
import { dismissToast, useToasts, type Toast, type ToastTone } from './toast';

const ICON: Record<ToastTone, string> = { success: 'check_circle', info: 'info', warning: 'warning', error: 'error' };
const TONE: Record<ToastTone, Tone> = { success: 'success', info: 'info', warning: 'warning', error: 'danger' };

function ToastItem({ toast }: { toast: Toast }) {
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="toast pointer-events-auto flex animate-[toast-in_160ms_ease-out] items-start gap-3 rounded-lg border border-fluent-border-high bg-surface-card-high p-3 shadow-fluent-elevation-16"
    >
      <Icon name={ICON[toast.tone]} size={20} filled className={`mt-px ${TONE_TEXT[TONE[toast.tone]]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-5 font-semibold text-on-surface">{toast.message}</p>
        {toast.detail && <p className="mt-0.5 text-[12px] leading-4 text-on-surface-variant">{toast.detail}</p>}
        {toast.action && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              toast.action?.run();
              dismissToast(toast.id);
            }}
          >
            {toast.action.label}
          </Button>
        )}
      </div>
      <IconButton icon="close" label="Dismiss" size="sm" iconSize={16} onClick={() => dismissToast(toast.id)} />
    </div>
  );
}

/**
 * The stack of toasts, bottom right. It is a manual popover, which puts it in the browser's top layer: a
 * toast stays visible above an open drawer or dialog instead of hiding behind it. Each new toast re-shows the
 * popover so it is the topmost layer even if a dialog opened after the last one.
 */
export function ToastHost() {
  const toasts = useToasts();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.matches(':popover-open')) element.hidePopover();
    if (toasts.length > 0) element.showPopover();
  }, [toasts]);

  return (
    <div
      ref={ref}
      popover="manual"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-auto right-4 bottom-4 m-0 flex [&:not(:popover-open)]:hidden w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-visible border-0 bg-transparent p-0"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
