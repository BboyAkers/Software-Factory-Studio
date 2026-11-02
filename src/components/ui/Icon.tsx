import type { CSSProperties } from 'react';
import { cx } from './cx';

/** A Material Symbols Outlined glyph. Decorative by default: put the meaning in nearby text or an `aria-label` on the control. */
export function Icon({ name, size = 18, filled = false, className, style }: { name: string; size?: number; filled?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden="true" className={cx('material-symbols-outlined select-none leading-none', filled && 'filled', className)} style={{ fontSize: size, width: size, height: size, ...style }}>
      {name}
    </span>
  );
}
