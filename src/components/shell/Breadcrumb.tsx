import { AppLink, useCurrentPage, useRouteIds } from '../../app/nav';
import { Icon, cx } from '../ui';

/** Where you are inside the project: page, then the workpack, run or agent in focus. Each part is a link. */
export function Breadcrumb() {
  const page = useCurrentPage();
  const { wpId, runId, agentId } = useRouteIds();
  if (!page) return null;

  const crumbs: { label: string; to: string }[] = [{ label: page.label, to: page.segment }];
  const focus = wpId ?? agentId;
  if (focus) crumbs.push({ label: focus, to: `${page.segment}/${focus}` });
  if (wpId && runId) crumbs.push({ label: runId, to: `${page.segment}/${wpId}/${runId}` });

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
      <ol className="flex items-center gap-0.5 text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.to} className="flex min-w-0 items-center gap-0.5">
              {index > 0 && <Icon name="chevron_right" size={16} className="shrink-0 text-on-surface-muted" />}
              <AppLink
                to={crumb.to}
                exact
                {...(last ? { 'aria-current': 'page' as const } : {})}
                className={cx('focus-ring truncate rounded px-1 py-0.5 transition-colors duration-150', last ? 'font-medium text-on-surface' : 'text-on-surface-variant hover:text-on-surface', index > 0 && 'font-mono text-[12px]')}
              >
                {crumb.label}
              </AppLink>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
