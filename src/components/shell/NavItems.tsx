import { useAgents, usePipelineStatus } from '../../api/queries';
import { useConnection } from '../../api/stream';
import { AppLink, PAGES, type PageDef } from '../../app/nav';
import { ui } from '../../app/ui';
import { Icon, StatusDot, Tooltip, cx, type Tone } from '../ui';

/** What a navigation item shows beside its label. Every value is derived from data: nothing is hard-coded. */
type Badge = { kind: 'count'; value: number; label: string } | { kind: 'stream'; tone: Tone; pulse: boolean; label: string };

function useBadges(): Partial<Record<PageDef['id'], Badge>> {
  const status = usePipelineStatus();
  const agents = useAgents();
  const { state } = useConnection();

  const out: Partial<Record<PageDef['id'], Badge>> = {};
  out['mission-control'] =
    state === 'live'
      ? { kind: 'stream', tone: 'success', pulse: true, label: 'Live' }
      : state === 'reconnecting'
        ? { kind: 'stream', tone: 'warning', pulse: true, label: 'Reconnecting' }
        : { kind: 'stream', tone: 'danger', pulse: false, label: 'Offline' };

  const active = status.data?.active ?? 0;
  if (active > 0) out['task-matrix'] = { kind: 'count', value: active, label: `${active} active workpack${active === 1 ? '' : 's'}` };
  const review = status.data?.awaitingReview ?? 0;
  if (review > 0) out['quality-sandboxes'] = { kind: 'count', value: review, label: `${review} awaiting review` };
  const evaluating = agents.data?.filter((a) => a.evaluatingVersion !== null).length ?? 0;
  if (evaluating > 0) out['fleet-tuning'] = { kind: 'count', value: evaluating, label: `${evaluating} version${evaluating === 1 ? '' : 's'} evaluating` };
  return out;
}

function BadgeView({ badge, rail }: { badge: Badge; rail: boolean }) {
  if (badge.kind === 'stream') {
    return (
      <span className={cx('flex shrink-0 items-center', rail && 'absolute top-1.5 right-1.5')} title={badge.label}>
        <StatusDot tone={badge.tone} pulse={badge.pulse} />
        <span className="sr-only">{badge.label}</span>
      </span>
    );
  }
  return rail ? (
    <span className="absolute top-0 right-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-fluent-blue px-1 text-[12px] leading-none font-semibold text-white tabular-nums">{badge.value}</span>
  ) : (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-white/10 px-1.5 text-[12px] leading-none font-medium text-on-surface-variant tabular-nums">{badge.value}</span>
  );
}

function NavItem({ page, badge, expanded }: { page: PageDef; badge: Badge | undefined; expanded: boolean }) {
  const description = badge ? `${page.label}, ${badge.label}` : page.label;
  const link = (
    <AppLink
      to={page.segment}
      aria-label={expanded && !badge ? undefined : description}
      onClick={ui.closeNav}
      className={cx(
        'focus-ring group relative flex h-9 w-full items-center rounded-md text-[13px] font-medium text-on-surface-variant transition-colors duration-150',
        'hover:bg-white/6 hover:text-on-surface data-[status=active]:bg-white/10 data-[status=active]:text-on-surface',
        expanded ? 'gap-2.5 px-2.5' : 'justify-center',
      )}
    >
      <Icon name={page.icon} size={20} className="shrink-0 group-data-[status=active]:text-fluent-blue-light" />
      {expanded && <span className="min-w-0 flex-1 truncate">{page.label}</span>}
      {badge && <BadgeView badge={badge} rail={!expanded} />}
    </AppLink>
  );
  return expanded ? link : (
    <Tooltip content={description} side="right" className="flex w-full">
      {link}
    </Tooltip>
  );
}

/** The nine pages. `expanded` shows labels; otherwise it is the 56 px icon rail with a tooltip per item. */
export function NavItems({ expanded }: { expanded: boolean }) {
  const badges = useBadges();
  return (
    <nav aria-label="Pages" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {PAGES.map((page) => (
        <NavItem key={page.id} page={page} badge={badges[page.id]} expanded={expanded} />
      ))}
    </nav>
  );
}
