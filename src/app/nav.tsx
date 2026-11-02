import { Link, useLocation, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, type ComponentProps } from 'react';
import type { z } from 'zod';
import { useProjectId } from '../api/queries';
import { stringifySearch, type SearchInput, type SearchValue } from './search';

/** The nine pages of the Studio, in navigation order. `segment` is the URL part below `/p/:project/`. */
export const PAGES = [
  { id: 'overview', segment: 'overview', label: 'Overview', icon: 'grid_view' },
  { id: 'mission-control', segment: 'mission', label: 'Mission Control', icon: 'account_tree' },
  { id: 'task-matrix', segment: 'matrix', label: 'Task Matrix', icon: 'view_kanban' },
  { id: 'live-workspace', segment: 'workspace', label: 'Live Workspace', icon: 'terminal' },
  { id: 'quality-sandboxes', segment: 'quality', label: 'Quality & Sandboxes', icon: 'verified_user' },
  { id: 'spec-studio', segment: 'spec', label: 'Spec Studio', icon: 'edit_note' },
  { id: 'fleet-tuning', segment: 'fleet', label: 'Fleet & Tuning', icon: 'tune' },
  { id: 'settings', segment: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'audit', segment: 'audit', label: 'Audit Log', icon: 'receipt_long' },
] as const;

export type PageDef = (typeof PAGES)[number];
export type PageSegment = PageDef['segment'];

export const pageBySegment = (segment: string | undefined): PageDef | undefined => PAGES.find((p) => p.segment === segment);

/** Drop what the URL would not carry anyway, so `{ archived: false }` and `{ q: '' }` mean "not set". */
function compact(search: SearchInput): Record<string, string | number | true> {
  const out: Record<string, string | number | true> = {};
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    out[key] = value;
  }
  return out;
}

interface Target {
  path: string;
  search: Record<string, string | number | true>;
}

/**
 * Turn a project-relative target into a router destination. `to` is what the search API returns:
 * `matrix/WP-2851`, `mission?epic=EPIC-1006`, `workspace/WP-2851/run-132?file=src/a.ts`.
 */
export function parseTarget(project: string, to: string, search: SearchInput = {}): Target {
  const split = to.indexOf('?');
  const rawPath = split === -1 ? to : to.slice(0, split);
  const inline = split === -1 ? {} : Object.fromEntries(new URLSearchParams(to.slice(split + 1)));
  const segments = rawPath.split('/').filter(Boolean).map(encodeURIComponent);
  return { path: ['/p', encodeURIComponent(project), ...segments].join('/'), search: { ...inline, ...compact(search) } };
}

/** A path for places that need a string: copy-link buttons, `<a href>`, tests. Prefer `AppLink` for navigation. */
export function href(project: string, to: string, search?: SearchInput): string {
  const target = parseTarget(project, to, search);
  return `${target.path}${stringifySearch(target.search)}`;
}

export interface AppLinkProps extends Omit<ComponentProps<'a'>, 'href' | 'ref'> {
  /** Relative to the project: `matrix/WP-2851`, `mission?epic=EPIC-1006`. */
  to: string;
  search?: SearchInput;
  /** Link into another project. Defaults to the current one. */
  project?: string;
  replace?: boolean;
  preload?: false | 'intent' | 'viewport' | 'render';
  /** Count as active only on exactly this path (the default also matches everything below it). */
  exact?: boolean;
}

/** A link inside the current project. Keyboard, middle-click and "open in new tab" work as for any anchor. */
export function AppLink({ to, search, project, replace, preload = 'intent', exact = false, ...rest }: AppLinkProps) {
  const current = useProjectId();
  const target = parseTarget(project ?? current, to, search);
  return <Link {...rest} to={target.path} search={target.search} {...(replace === undefined ? {} : { replace })} preload={preload} activeOptions={{ exact }} />;
}

export interface GoOptions {
  search?: SearchInput;
  project?: string;
  replace?: boolean;
}

/** Navigate from code (after a save, from a menu item). Returns once the navigation has been committed. */
export function useGo(): (to: string, options?: GoOptions) => Promise<void> {
  const navigate = useNavigate();
  const current = useProjectId();
  return (to, options = {}) => {
    const target = parseTarget(options.project ?? current, to, options.search);
    return navigate({ to: target.path, search: target.search, ...(options.replace === undefined ? {} : { replace: options.replace }) });
  };
}

export interface RouteIds {
  project: string;
  wpId: string | undefined;
  runId: string | undefined;
  agentId: string | undefined;
}

/** The optional path ids of the current route (`/matrix/:wpId`, `/mission/:wpId/:runId`, `/fleet/:agentId`). */
export function useRouteIds(): RouteIds {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;
  return { project: params.project ?? '', wpId: params.wpId, runId: params.runId, agentId: params.agentId };
}

/** The page the URL is on, from the segment after the project. */
export function useCurrentPage(): PageDef | undefined {
  const pathname = useLocation({ select: (location) => location.pathname });
  return pageBySegment(pathname.split('/')[3]);
}

export type SearchPatch<T> = { [K in keyof T]?: SearchValue };

/**
 * A page's search params, parsed with the same schema its route validates with, plus a setter that
 * merges a patch into the URL. Filters replace the history entry by default; pass `replace: false` for a
 * change someone would expect Back to undo.
 *
 *     const [search, setSearch] = useSearchState(SearchSchema);
 *     setSearch({ view: 'table', archived: true });
 */
export function useSearchState<S extends z.ZodType<Record<string, unknown>>>(schema: S) {
  const raw = useSearch({ strict: false });
  const navigate = useNavigate();
  const value = useMemo(() => schema.parse(raw) as z.output<S>, [raw, schema]);
  const set = (patch: SearchPatch<z.output<S>>, options: { replace?: boolean } = {}) => {
    // `to: '.'` keeps the current route and its path params; only the search changes.
    void navigate({ to: '.', search: { ...raw, ...patch }, replace: options.replace ?? true });
  };
  return [value, set] as const;
}
