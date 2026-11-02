import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-fluent-border-high bg-white/6 px-1 font-mono text-[12px] leading-none text-on-surface-variant">{children}</kbd>;
}
