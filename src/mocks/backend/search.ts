import { SearchScopeSchema, type SearchResponse, type SearchResult, type SearchScope } from '../../contracts';
import { invalid } from '../http';
import type { ProjectState } from './store';

const SCOPES: readonly SearchScope[] = ['epics', 'workpacks', 'files', 'logs'];
const PREFIXES: Record<string, SearchScope> = { 'epic:': 'epics', 'wp:': 'workpacks', 'file:': 'files', 'log:': 'logs' };
const PER_SCOPE = 6;
const TOTAL = 20;
const TITLE_LIMIT = 80;

/** `scope=epics,files`. Blank means every scope; a name that is not a scope is a field error. */
function parseScopes(raw: string | null): SearchScope[] {
  const names = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !SearchScopeSchema.safeParse(name).success);
  if (unknown.length > 0) {
    throw invalid([{ path: 'scope', message: `Unknown scope: ${unknown.join(', ')}. Use ${SCOPES.join(', ')}.`, code: 'invalid_value' }]);
  }
  return names.length === 0 ? [...SCOPES] : SCOPES.filter((scope) => names.includes(scope));
}

/** 0 exact id, 1 id starts with it, 2 id contains it, 3 matched elsewhere. */
function rank(id: string, needle: string): number {
  const lower = id.toLowerCase();
  if (lower === needle) return 0;
  if (lower.startsWith(needle)) return 1;
  return lower.includes(needle) ? 2 : 3;
}

interface Candidate<T> {
  item: T;
  index: number;
  id: string;
  createdAt: string;
}

/** Better id match first, then newest, then the one created last (same-instant creations). */
function ordered<T>(candidates: Candidate<T>[], needle: string): T[] {
  return [...candidates]
    .sort((a, b) => rank(a.id, needle) - rank(b.id, needle) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.index - a.index)
    .map((c) => c.item);
}

const asCandidates = <T extends { id: string; createdAt: string }>(list: readonly T[]): Candidate<T>[] =>
  list.map((item, index) => ({ item, index, id: item.id, createdAt: item.createdAt }));

type Searcher = (ps: ProjectState, needle: string) => SearchResult[];

const epics: Searcher = (ps, needle) =>
  ordered(
    asCandidates(ps.epics).filter((c) => `${c.item.id} ${c.item.title} ${c.item.areas.join(' ')}`.toLowerCase().includes(needle)),
    needle,
  ).map((e) => ({ scope: 'epics', id: e.id, title: e.title, subtitle: `${e.status} · ${e.priority}`, to: `mission?epic=${e.id}` }));

const workpacks: Searcher = (ps, needle) =>
  ordered(
    asCandidates(ps.workpacks).filter((c) => `${c.item.id} ${c.item.title} ${c.item.branch} ${c.item.category}`.toLowerCase().includes(needle)),
    needle,
  ).map((wp) => ({ scope: 'workpacks', id: wp.id, title: wp.title, subtitle: `${wp.status} · ${wp.epicId}`, to: `matrix/${wp.id}` }));

/** A path keeps its slashes in the link; anything else is escaped. */
const inQuery = (path: string): string => encodeURIComponent(path).replaceAll('%2F', '/');

const files: Searcher = (ps, needle) => {
  const results: SearchResult[] = [];
  // Newest workpack first. A glob a workpack reserves is not a file, so it is left out.
  for (const wp of [...ps.workpacks].reverse()) {
    const paths = new Set([...(ps.files.get(wp.id) ?? []).map((f) => f.path), ...wp.targetFiles.filter((p) => !p.includes('*'))]);
    const runId = wp.activeRunId ?? ps.runs.filter((r) => r.workpackId === wp.id).at(-1)?.id;
    for (const path of paths) {
      if (!path.toLowerCase().includes(needle)) continue;
      results.push({
        scope: 'files',
        id: `${wp.id}:${path}`,
        title: path,
        subtitle: wp.id,
        to: runId ? `workspace/${wp.id}/${runId}?file=${inQuery(path)}` : `matrix/${wp.id}`,
      });
    }
  }
  return results;
};

const seqOf = (id: string): number => Number(id.replace(/^log-/, '')) || 0;
const shorten = (message: string): string => (message.length > TITLE_LIMIT ? `${message.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : message);

const logs: Searcher = (ps, needle) => {
  const hits = [...ps.logs.values()].flat().filter((entry) => entry.message.toLowerCase().includes(needle));
  return hits
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts) || seqOf(b.id) - seqOf(a.id))
    .flatMap((entry): SearchResult[] => {
      const workpackId = ps.runs.find((r) => r.id === entry.runId)?.workpackId;
      if (!workpackId) return [];
      return [
        {
          scope: 'logs',
          id: `${entry.runId}:${entry.id}`,
          title: shorten(entry.message),
          subtitle: `${entry.tag} · ${entry.runId}`,
          to: `mission/${workpackId}/${entry.runId}`,
        },
      ];
    });
};

const SEARCHERS: Record<SearchScope, Searcher> = { epics, workpacks, files, logs };

/**
 * Command-palette search (spec §16.14). A leading `epic:`, `wp:`, `file:` or `log:` narrows the scope and is
 * not part of the text. At most six hits per scope and twenty in all, taken in scope order.
 */
export function searchProject(ps: ProjectState, q: string | null, scopeParam: string | null): SearchResponse {
  let scopes = parseScopes(scopeParam);
  let text = (q ?? '').trim();

  const prefix = Object.keys(PREFIXES).find((p) => text.toLowerCase().startsWith(p));
  if (prefix) {
    text = text.slice(prefix.length).trim();
    scopes = scopes.filter((scope) => scope === PREFIXES[prefix]);
  }

  const needle = text.toLowerCase();
  if (needle === '') return { query: text, items: [] };
  const items = scopes.flatMap((scope) => SEARCHERS[scope](ps, needle).slice(0, PER_SCOPE));
  return { query: text, items: items.slice(0, TOTAL) };
}
