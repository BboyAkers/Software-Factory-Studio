import { ui, useUi } from '../../app/ui';
import { useMediaQuery } from '../../app/useMediaQuery';
import { Drawer, Icon, cx } from '../ui';
import { NavItems } from './NavItems';
import { CapacityMeter, PauseControl } from './PipelineControls';

function Brand({ expanded }: { expanded: boolean }) {
  return (
    <div className={cx('flex h-12 shrink-0 items-center gap-2.5 border-b border-fluent-border', expanded ? 'px-3.5' : 'justify-center')}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary-subtle text-fluent-blue-light">
        <Icon name="factory" size={18} />
      </span>
      {expanded && <span className="truncate text-[14px] font-semibold text-on-surface">Factory Studio</span>}
    </div>
  );
}

function Footer({ expanded }: { expanded: boolean }) {
  return (
    <div className={cx('flex shrink-0 flex-col gap-3 border-t border-fluent-border', expanded ? 'p-3' : 'items-center px-2 py-3')}>
      <CapacityMeter compact={!expanded} />
      <PauseControl compact={!expanded} />
    </div>
  );
}

/**
 * Left navigation. 256 px with labels from 1024 px up, a 56 px icon rail from 640 px, and below that it is
 * hidden: the header's menu button opens the same content in an off-canvas drawer (`MobileNav`).
 */
export function NavPane() {
  const wide = useMediaQuery('(min-width: 1024px)');
  const visible = useMediaQuery('(min-width: 640px)');
  if (!visible) return null;
  return (
    <aside aria-label="Primary" className={cx('flex shrink-0 flex-col border-r border-fluent-border bg-surface-card-subtle', wide ? 'w-64' : 'w-14')}>
      <Brand expanded={wide} />
      <NavItems expanded={wide} />
      <Footer expanded={wide} />
    </aside>
  );
}

/** The navigation as a left drawer, for screens under 640 px. */
export function MobileNav() {
  const { navOpen } = useUi();
  const visible = useMediaQuery('(min-width: 640px)');
  return (
    <Drawer open={navOpen && !visible} onClose={ui.closeNav} placement="left" size="sm" title="Navigation">
      <div className="-mx-5 -my-4 flex h-full min-h-[60vh] flex-col">
        <NavItems expanded />
        <Footer expanded />
      </div>
    </Drawer>
  );
}
