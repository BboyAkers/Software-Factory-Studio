import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

/** What a control needs to be wired to its label, hint and error. Spread it onto the Input, Select or Textarea. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
}

/**
 * A labelled form row. Usage: `<Field label="Title" error={e}>{(props) => <Input {...props} />}</Field>`.
 * The render prop hands over the ids that connect the label, hint and error to the control.
 */
export function Field({ label, hint, error, required, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: (props: FieldControlProps) => ReactNode; className?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-on-surface">
        {label}
        {required && <span className="ml-0.5 text-fluent-danger-text" aria-hidden="true">*</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required ? true : undefined })}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1 text-[12px] leading-4 text-fluent-danger-text">
          <Icon name="error" size={14} className="mt-px" />
          <span>{error}</span>
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-[12px] leading-4 text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-md border bg-white/5 text-[13px] text-on-surface placeholder:text-on-surface-muted transition-colors duration-150 focus-ring ' +
  'border-fluent-border border-b-white/40 hover:bg-white/8 focus:bg-white/8 focus:border-b-primary disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-fluent-error aria-[invalid=true]:border-b-fluent-error';

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cx(CONTROL, 'h-8 px-2.5', className)} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={cx(CONTROL, 'min-h-20 resize-y px-2.5 py-1.5 leading-5', className)} />;
}

export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <span className="relative block w-full">
      <select {...rest} className={cx(CONTROL, 'h-8 cursor-pointer appearance-none pr-8 pl-2.5', className)}>
        {children}
      </select>
      <Icon name="expand_more" size={18} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-on-surface-variant" />
    </span>
  );
}

/** An on/off switch with its own label (and optional description), exposed as `role="switch"`. */
export function Toggle({ checked, onChange, label, description, disabled = false, disabledReason }: { checked: boolean; onChange: (next: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; disabledReason?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4" title={disabled ? disabledReason : undefined}>
      <div className="min-w-0">
        <label htmlFor={id} className={cx('text-[13px] font-medium text-on-surface', disabled && 'opacity-60')}>
          {label}
        </label>
        {description && <p className={cx('mt-0.5 text-[12px] leading-4 text-on-surface-variant', disabled && 'opacity-60')}>{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && onChange(!checked)}
        className={cx('focus-ring relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-150', checked ? 'border-primary bg-fluent-blue' : 'border-fluent-border-high bg-white/10', disabled && 'cursor-not-allowed opacity-50')}
      >
        <span className={cx('absolute top-0.5 size-3.5 rounded-full bg-white transition-all duration-150', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

/** A small set of mutually exclusive choices shown side by side (Board | Table, 24h | 7d). */
export function SegmentedControl<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (next: T) => void; options: { value: T; label: ReactNode; icon?: string; disabled?: boolean }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-fluent-border bg-white/4 p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              'focus-ring inline-flex items-center gap-1.5 rounded px-2.5 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
              size === 'md' ? 'h-7' : 'h-6 text-[12px]',
              selected ? 'bg-white/12 text-on-surface shadow-fluent-elevation-2' : 'text-on-surface-variant hover:bg-white/6 hover:text-on-surface',
            )}
          >
            {o.icon && <Icon name={o.icon} size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
