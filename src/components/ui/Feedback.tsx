import type { ReactNode } from 'react';
import { ApiError, isApiError } from '../../api/client';
import { describeError } from '../../api/errors';
import { Button } from './Button';
import { TONE_TEXT, type Tone } from './Badge';
import { cx } from './cx';
import { Icon } from './Icon';

/** A determinate bar. `value` is 0–100. Always give it a `label` so a screen reader can say what is progressing. */
export function ProgressBar({ value, label, tone = 'info', size = 'md', className }: { value: number; label: string; tone?: Tone; size?: 'sm' | 'md'; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill: Record<Tone, string> = { neutral: 'bg-on-surface-muted', info: 'bg-primary', success: 'bg-fluent-success', warning: 'bg-fluent-warning', danger: 'bg-fluent-error', purple: 'bg-fluent-purple' };
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} className={cx('w-full overflow-hidden rounded-full bg-white/10', size === 'md' ? 'h-1.5' : 'h-1', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-300 ease-out', fill[tone])} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** A placeholder shaped like the content it stands in for. Never use a centered spinner for a region. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton animate-[skeleton-pulse_1.4s_ease-in-out_infinite] rounded bg-white/8', className)} />;
}

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return <span role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ width: size, height: size }} className="spinner inline-block animate-[spin_700ms_linear_infinite] rounded-full border-2 border-on-surface-muted border-t-primary" />;
}

/** One sentence on what belongs here, and the action that creates it. Teach the interface; do not just say "nothing". */
export function EmptyState({ icon = 'inbox', title, description, action, compact = false }: { icon?: string; title: string; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12')}>
      <span className="flex size-10 items-center justify-center rounded-full border border-fluent-border bg-white/5 text-on-surface-variant">
        <Icon name={icon} size={20} />
      </span>
      <div className="max-w-sm">
        <p className="text-[14px] font-semibold text-on-surface">{title}</p>
        {description && <p className="mt-1 text-[13px] leading-5 text-on-surface-variant">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A failed read: what went wrong, a Retry, and the request id to quote. */
export function ErrorState({ error, onRetry, compact = false, title }: { error: unknown; onRetry?: () => void; compact?: boolean; title?: string }) {
  const { title: problem, detail } = describeError(error);
  const requestId = isApiError(error) ? (error as ApiError).requestId : null;
  return (
    <div role="alert" className={cx('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12')}>
      <span className="flex size-10 items-center justify-center rounded-full border border-fluent-error/30 bg-fluent-error-subtle text-fluent-danger-text">
        <Icon name="error" size={20} />
      </span>
      <div className="max-w-md">
        <p className="text-[14px] font-semibold text-on-surface">{title ?? problem}</p>
        {(title ? problem : detail) && <p className="mt-1 text-[13px] leading-5 text-on-surface-variant">{title ? [problem, detail].filter(Boolean).join(' ') : detail}</p>}
        {requestId && <p className="mt-1 font-mono text-[12px] text-on-surface-muted">Request {requestId}</p>}
      </div>
      {onRetry && (
        <Button icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Shown above stale data when a refetch failed: the old content stays visible underneath (spec §16.2). */
export function StaleStrip({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="status" className="flex items-center justify-between gap-3 border-b border-fluent-warning/30 bg-fluent-warning-subtle px-4 py-1.5 text-[13px] text-fluent-warning">
      <span className="flex items-center gap-1.5">
        <Icon name="history" size={16} />
        Out of date. Showing the last data we have.
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="focus-ring rounded font-medium underline underline-offset-2 hover:text-on-surface">
          Retry
        </button>
      )}
    </div>
  );
}

/** A full-width message strip: the shell banners, and inline warnings inside a panel. */
export function Banner({ tone = 'info', icon, title, children, action, className }: { tone?: Tone; icon?: string; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const surface: Record<Tone, string> = {
    neutral: 'border-fluent-border bg-white/5',
    info: 'border-primary/30 bg-primary-subtle',
    success: 'border-fluent-success/30 bg-fluent-success-subtle',
    warning: 'border-fluent-warning/30 bg-fluent-warning-subtle',
    danger: 'border-fluent-error/30 bg-fluent-error-subtle',
    purple: 'border-fluent-purple/30 bg-fluent-purple-subtle',
  };
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cx('flex items-center gap-3 border px-4 py-2 text-[13px]', surface[tone], className)}>
      {icon && <Icon name={icon} size={18} className={TONE_TEXT[tone]} />}
      <div className="min-w-0 flex-1 text-on-surface">
        {title && <span className="font-semibold">{title} </span>}
        {children}
      </div>
      {action}
    </div>
  );
}
