import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-fluent-blue text-white border-white/15 hover:bg-primary active:bg-primary-pressed',
  secondary: 'bg-white/6 text-on-surface border-white/10 hover:bg-white/10 hover:border-white/15 active:bg-white/4',
  ghost: 'bg-transparent text-on-surface-variant border-transparent hover:bg-white/6 hover:text-on-surface active:bg-white/4',
  danger: 'bg-fluent-error-subtle text-fluent-danger-text border-fluent-error/40 hover:bg-fluent-error/25 active:bg-fluent-error/15',
};

/** The classes of a Button, for a link or another element that must look like one. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: 'sm' | 'md' = 'md'): string {
  return cx(
    'focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors duration-150',
    size === 'md' ? 'h-8 px-3 text-[13px]' : 'h-7 px-2.5 text-[12px]',
    VARIANT[variant],
  );
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  /**
   * Why this control cannot be used right now ("Requires Maintainer", "Needs a connection"). When set together with
   * `disabled`, the button stays focusable so keyboard users can read the reason, but it does nothing.
   */
  disabledReason?: ReactNode;
  children?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, loading = false, disabled = false, disabledReason, className, onClick, children, type = 'button', ...rest }: ButtonProps) {
  const soft = disabled && !!disabledReason;
  const inert = disabled || loading;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (soft || loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  const button = (
    <button
      {...rest}
      type={type}
      disabled={disabled && !disabledReason}
      aria-disabled={inert || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={cx(buttonClass(variant, size), inert && 'cursor-not-allowed opacity-50', className)}
    >
      {loading ? <span className="spinner size-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'md' ? 16 : 15} /> : null}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'md' ? 16 : 15} />}
    </button>
  );
  return soft ? <Tooltip content={disabledReason}>{button}</Tooltip> : button;
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconRight' | 'icon'> {
  icon: string;
  /** Required: an icon alone says nothing to a screen reader. Also shown as the tooltip. */
  label: string;
  iconSize?: number;
}

export function IconButton({ icon, label, iconSize = 18, variant = 'ghost', size = 'md', loading = false, disabled = false, disabledReason, className, onClick, type = 'button', ...rest }: IconButtonProps) {
  const soft = disabled && !!disabledReason;
  const button = (
    <button
      {...rest}
      type={type}
      aria-label={label}
      disabled={disabled && !disabledReason}
      aria-disabled={disabled || loading || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (soft || loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cx(
        'focus-ring inline-flex shrink-0 items-center justify-center rounded-md border transition-colors duration-150',
        size === 'md' ? 'size-8' : 'size-7',
        VARIANT[variant],
        (disabled || loading) && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {loading ? <span className="spinner size-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : <Icon name={icon} size={iconSize} />}
    </button>
  );
  return <Tooltip content={soft ? disabledReason : label}>{button}</Tooltip>;
}
