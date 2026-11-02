import { useGo } from '../../app/nav';
import { Can } from '../../app/session';
import { ui } from '../../app/ui';
import { useMediaQuery } from '../../app/useMediaQuery';
import { Button, IconButton, Kbd } from '../ui';
import { Breadcrumb } from './Breadcrumb';
import { BudgetPill } from './BudgetPill';
import { ConnectionPill } from './ConnectionPill';
import { PausedPill } from './PausedPill';
import { ProjectSwitcher } from './ProjectSwitcher';
import { UserMenu } from './UserMenu';

/** ⌘ on Apple platforms, Ctrl elsewhere. */
const MODIFIER = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

function SearchTrigger() {
  const wide = useMediaQuery('(min-width: 1024px)');
  if (!wide) return <IconButton icon="search" label="Search" onClick={ui.openPalette} />;
  return (
    <Button icon="search" onClick={ui.openPalette} aria-label="Search" className="w-44 justify-start text-on-surface-variant">
      <span className="flex-1 text-left">Search</span>
      <Kbd>{MODIFIER} K</Kbd>
    </Button>
  );
}

/** Engineers and above start an Epic in Spec Studio; everyone else sees the button disabled with the role it needs. */
function NewEpicButton() {
  const go = useGo();
  return (
    <Can capability="epic.dispatch">
      <Button variant="primary" icon="add" onClick={() => void go('spec')}>
        <span className="sr-only lg:not-sr-only">New epic</span>
      </Button>
    </Can>
  );
}

/** 48 px: project switcher and breadcrumb on the left; state pills, search, New epic and the user on the right. */
export function Header() {
  const hasNav = useMediaQuery('(min-width: 640px)');
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-fluent-border bg-surface-card-subtle px-3">
      {!hasNav && <IconButton icon="menu" label="Open navigation" onClick={ui.openNav} />}
      <ProjectSwitcher />
      <Breadcrumb />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <PausedPill />
        <BudgetPill />
        <ConnectionPill />
        <SearchTrigger />
        <NewEpicButton />
        <UserMenu />
      </div>
    </header>
  );
}
