import type { ReactNode } from 'react';
import { cx } from '../ui';

/**
 * The area a page fills. `scroll="page"` (the default) scrolls the whole page, which suits dashboards and
 * forms. Use `scroll="contain"` when the page manages its own scrolling regions (a board, a workspace) so
 * only those regions scroll and the header stays put.
 */
export function Page({ children, scroll = 'page', className, busy }: { children: ReactNode; scroll?: 'page' | 'contain'; className?: string; busy?: boolean }) {
  return (
    <div className={cx('h-full min-h-0 min-w-0', scroll === 'page' ? 'overflow-y-auto' : 'flex flex-col overflow-hidden', className)} aria-busy={busy || undefined}>
      <div className={cx('px-6 py-5', scroll === 'page' ? 'mx-auto w-full max-w-[1680px]' : 'flex min-h-0 flex-1 flex-col')}>{children}</div>
    </div>
  );
}

/** Title row of a page: the one `h1`, an optional line of context, status chips, and the page's primary actions. */
export function PageHeader({ title, description, meta, actions }: { title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[20px] leading-7 font-semibold text-on-surface">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-0.5 max-w-3xl text-[13px] leading-5 text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
