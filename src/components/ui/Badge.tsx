import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';

/** Text colors are the contrast-safe tints (≥ 4.5:1 on every surface), not the raw accent colors. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-on-surface-variant',
  info: 'text-fluent-blue-light',
  success: 'text-fluent-success',
  warning: 'text-fluent-warning',
  danger: 'text-fluent-danger-text',
  purple: 'text-fluent-purple-text',
};

const TONE_SURFACE: Record<Tone, string> = {
  neutral: 'bg-white/8 border-fluent-border',
  info: 'bg-primary-subtle border-primary/30',
  success: 'bg-fluent-success-subtle border-fluent-success/30',
  warning: 'bg-fluent-warning-subtle border-fluent-warning/30',
  danger: 'bg-fluent-error-subtle border-fluent-error/30',
  purple: 'bg-fluent-purple-subtle border-fluent-purple/30',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-on-surface-muted',
  info: 'bg-primary',
  success: 'bg-fluent-success',
  warning: 'bg-fluent-warning',
  danger: 'bg-fluent-error',
  purple: 'bg-fluent-purple',
};

/** A compact status label. Meaning is never carried by color alone: give it text, and an icon where it helps. */
export function Badge({ tone = 'neutral', icon, children, mono = false, className, title }: { tone?: Tone; icon?: string; children: ReactNode; mono?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[12px] leading-none font-medium whitespace-nowrap', TONE_SURFACE[tone], TONE_TEXT[tone], mono && 'font-mono', className)}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone = 'neutral', pulse = false, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block size-2 shrink-0 rounded-full', TONE_DOT[tone], pulse && 'animate-pulse motion-reduce:animate-none', className)} />;
}

const AVATAR: Record<string, string> = {
  blue: 'bg-primary-subtle text-fluent-blue-light border-primary/30',
  green: 'bg-fluent-success-subtle text-fluent-success border-fluent-success/30',
  amber: 'bg-fluent-warning-subtle text-fluent-warning border-fluent-warning/30',
  purple: 'bg-fluent-purple-subtle text-fluent-purple-text border-fluent-purple/30',
  red: 'bg-fluent-error-subtle text-fluent-danger-text border-fluent-error/30',
  sky: 'bg-fluent-blue-light/15 text-fluent-blue-light border-fluent-blue-light/30',
};

/** Initials in a tinted circle: an agent or a person. `color` is an agent's `color` field. */
export function Avatar({ initials, color = 'blue', size = 28, title }: { initials: string; color?: string; size?: number; title?: string }) {
  return (
    <span title={title} aria-hidden={title ? undefined : true} style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.4)) }} className={cx('inline-flex shrink-0 items-center justify-center rounded-full border font-semibold', AVATAR[color] ?? AVATAR.blue)}>
      {initials}
    </span>
  );
}
