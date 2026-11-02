import type { Tone } from '../ui';

/** The header's state pills: 28 px, rounded, text at least 12 px. Colors say the tone; the words say what it is. */
export const PILL = 'focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] leading-none font-medium whitespace-nowrap transition-colors duration-150';

export const PILL_TONE: Record<Tone, string> = {
  neutral: 'border-fluent-border bg-white/5 text-on-surface-variant hover:bg-white/10 hover:text-on-surface',
  info: 'border-primary/30 bg-primary-subtle text-fluent-blue-light hover:bg-primary/20',
  success: 'border-fluent-success/30 bg-fluent-success-subtle text-fluent-success',
  warning: 'border-fluent-warning/30 bg-fluent-warning-subtle text-fluent-warning hover:bg-fluent-warning/25',
  danger: 'border-fluent-error/30 bg-fluent-error-subtle text-fluent-danger-text hover:bg-fluent-error/25',
  purple: 'border-fluent-purple/30 bg-fluent-purple-subtle text-fluent-purple-text',
};
