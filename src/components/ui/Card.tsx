import type { ReactNode } from 'react';
import { cx } from './cx';

/** A surface. Padding is the caller's business: use `CardHeader` and a `div` with the spacing the content needs. */
export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'aside' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...rest} className={cx('rounded-lg border border-fluent-border bg-surface-card shadow-fluent-elevation-2', className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, actions, level = 2 }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
      <div className="min-w-0">
        <Heading className="text-[14px] leading-5 font-semibold text-on-surface">{title}</Heading>
        {description && <p className="mt-0.5 text-[12px] leading-4 text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}
