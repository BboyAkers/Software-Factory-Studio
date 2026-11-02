import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

/** A dense data table: 36 px rows, sticky header, hover and keyboard-focusable rows when they open something. */
export function Table({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className={cx('overflow-auto', className)}>
      <table aria-label={label} className="w-full border-separate border-spacing-0 text-left text-[13px]">
        {children}
      </table>
    </div>
  );
}

export const THead = ({ children }: { children: ReactNode }) => <thead>{children}</thead>;
export const TBody = ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>;

export function Tr({ children, onActivate, selected, className, ...rest }: HTMLAttributes<HTMLTableRowElement> & { onActivate?: () => void; selected?: boolean }) {
  return (
    <tr
      {...rest}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (onActivate && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onActivate();
        }
        rest.onKeyDown?.(event);
      }}
      aria-selected={selected}
      className={cx('h-9 transition-colors duration-100', onActivate && 'focus-ring cursor-pointer hover:bg-white/5 focus:bg-white/5', selected && 'bg-primary-subtle', className)}
    >
      {children}
    </tr>
  );
}

export function Th({ children, sort, onSort, className, ...rest }: Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> & { sort?: 'asc' | 'desc' | null; onSort?: () => void }) {
  return (
    <th
      {...rest}
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : onSort ? 'none' : undefined}
      className={cx('sticky top-0 z-10 h-9 border-b border-fluent-border bg-surface-card px-3 text-[12px] font-semibold whitespace-nowrap text-on-surface-variant', className)}
    >
      {onSort ? (
        <button type="button" onClick={onSort} className="focus-ring -mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-on-surface">
          {children}
          <Icon name={sort === 'asc' ? 'arrow_upward' : sort === 'desc' ? 'arrow_downward' : 'unfold_more'} size={14} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export const Td = ({ children, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...rest} className={cx('border-b border-fluent-border/60 px-3 align-middle', className)}>
    {children}
  </td>
);
