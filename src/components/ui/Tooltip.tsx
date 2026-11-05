import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { portalRoot } from './portal';

/**
 * A hint on hover or keyboard focus. Falsy `content` renders the children untouched, so a role tooltip can
 * be passed unconditionally. The bubble is fixed-positioned, so scrolling panels never clip it.
 */
export function Tooltip({ content, children, side = 'top', className = 'inline-flex' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'right'; className?: string }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const isOpen = at !== null;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAt(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!content) return <>{children}</>;

  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    if (side === 'right') setAt({ x: rect.right, y: rect.top + rect.height / 2 });
    else setAt({ x: rect.left + rect.width / 2, y: side === 'top' ? rect.top : rect.bottom });
  };

  return (
    <span ref={anchor} className={className} onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocusCapture={show} onBlurCapture={() => setAt(null)} aria-describedby={at ? id : undefined}>
      {children}
      {at &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              left: at.x,
              top: at.y,
              transform: side === 'top' ? 'translate(-50%, calc(-100% - 6px))' : side === 'bottom' ? 'translate(-50%, 6px)' : 'translate(8px, -50%)',
            }}
            className="pointer-events-none z-[100] max-w-72 rounded-md border border-fluent-border-high bg-surface-card-high px-2 py-1 text-[12px] leading-snug text-on-surface shadow-fluent-elevation-8"
          >
            {content}
          </span>,
          portalRoot(anchor.current),
        )}
    </span>
  );
}
