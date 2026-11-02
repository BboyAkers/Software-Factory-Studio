import type { AuditEntry, FieldError, Paged, VerifyResult } from '../../contracts';
import { GENESIS_HASH, verifyChain } from '../../domain/auditChain';
import { invalid } from '../http';
import { flushAudit, nowIso, pageOf } from './runtime';
import type { ProjectState } from './store';

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

interface Range {
  since: number | null;
  until: number | null;
}

/** `since` and `until` are RFC 3339 instants; every bad one is reported, not just the first. */
function parseRange(query: URLSearchParams): Range {
  const errors: FieldError[] = [];
  const read = (name: 'since' | 'until'): number | null => {
    const raw = query.get(name);
    if (raw === null || raw === '') return null;
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) errors.push({ path: name, message: `${name} must be an ISO 8601 timestamp.`, code: 'invalid_value' });
    return Number.isNaN(ms) ? null : ms;
  };
  const range = { since: read('since'), until: read('until') };
  if (errors.length > 0) throw invalid(errors, 'The audit range is invalid.');
  return range;
}

const inRange = (entry: AuditEntry, range: Range): boolean => {
  const at = Date.parse(entry.createdAt);
  return (range.since === null || at >= range.since) && (range.until === null || at <= range.until);
};

const intParam = (query: URLSearchParams, name: string, fallback: number, max: number): number => {
  const n = Number(query.get(name));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const targetIds = (entry: AuditEntry): unknown[] => [entry.target.workpackId, entry.target.forkId, entry.target.revertId];

const matchesAction = (entry: AuditEntry, action: string): boolean => entry.action === action || entry.action.startsWith(`${action}.`);

const matchesActor = (entry: AuditEntry, actor: string): boolean => {
  const wanted = actor.toLowerCase();
  return entry.actor.toLowerCase() === wanted || entry.actorName.toLowerCase() === wanted;
};

/** Entries newest first. Appends are asynchronous, so wait for the queue before reading. */
export async function auditPage(ps: ProjectState, query: URLSearchParams): Promise<Paged<AuditEntry>> {
  await flushAudit(ps);
  const range = parseRange(query);
  const workpack = query.get('workpack');
  const actor = query.get('actor');
  const action = query.get('action');

  const matching = ps.audit
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => inRange(entry, range))
    .filter(({ entry }) => !workpack || targetIds(entry).includes(workpack))
    .filter(({ entry }) => !actor || matchesActor(entry, actor))
    .filter(({ entry }) => !action || matchesAction(entry, action))
    .sort((a, b) => Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt) || b.index - a.index)
    .map(({ entry }) => entry);

  return pageOf(matching, intParam(query, 'limit', 50, 200), query.get('cursor'));
}

// ---------------------------------------------------------------------------
// Verify and export work on a contiguous stretch of the chain
// ---------------------------------------------------------------------------

/** The entries of the range in chain order, and the hash that precedes them. */
function slice(ps: ProjectState, range: Range): { entries: AuditEntry[]; startPrevHash: string } {
  const first = ps.audit.findIndex((e) => inRange(e, range));
  if (first === -1) return { entries: [], startPrevHash: GENESIS_HASH };
  let last = first;
  ps.audit.forEach((e, i) => {
    if (inRange(e, range)) last = i;
  });
  return { entries: ps.audit.slice(first, last + 1), startPrevHash: first > 0 ? ps.audit[first - 1]!.hash : GENESIS_HASH };
}

export async function verifyAudit(ps: ProjectState, query: URLSearchParams): Promise<VerifyResult> {
  await flushAudit(ps);
  const { entries, startPrevHash } = slice(ps, parseRange(query));
  return verifyChain(entries, { startPrevHash });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const EXPORT_FORMATS = {
  ndjson: { contentType: 'application/x-ndjson', extension: 'ndjson' },
  csv: { contentType: 'text/csv', extension: 'csv' },
} as const;

const CSV_COLUMNS = ['id', 'createdAt', 'actorType', 'actor', 'action', 'target', 'prevHash', 'hash'] as const;

const csvField = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

function toCsv(entries: readonly AuditEntry[]): string {
  const rows = entries.map((e) => [e.id, e.createdAt, e.actorType, e.actor, e.action, JSON.stringify(e.target), e.prevHash, e.hash].map(csvField).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

const toNdjson = (entries: readonly AuditEntry[]): string => entries.map((e) => `${JSON.stringify(e)}\n`).join('');

/** SIEM export of a range, oldest first. Raw `Response`: the router does not add headers to those. */
export async function exportAudit(ps: ProjectState, query: URLSearchParams): Promise<Response> {
  await flushAudit(ps);
  const requested = query.get('format') ?? 'ndjson';
  if (!(requested in EXPORT_FORMATS)) {
    throw invalid([{ path: 'format', message: 'Use ndjson or csv.', code: 'invalid_value' }]);
  }
  const format = EXPORT_FORMATS[requested as keyof typeof EXPORT_FORMATS];
  const { entries } = slice(ps, parseRange(query));
  const day = nowIso(ps.store).slice(0, 10);
  return new Response(requested === 'csv' ? toCsv(entries) : toNdjson(entries), {
    status: 200,
    headers: {
      'content-type': format.contentType,
      'content-disposition': `attachment; filename="audit-${ps.project.id}-${day}.${format.extension}"`,
      'x-server-time': nowIso(ps.store),
      'x-request-id': globalThis.crypto.randomUUID(),
    },
  });
}

// ---------------------------------------------------------------------------
// Dev panel
// ---------------------------------------------------------------------------

/**
 * Alter one entry from the middle of the chain without recomputing its hash, so `verify` has a
 * break to report. Returns its id, or `null` when there is nothing to alter.
 */
export function corruptAuditEntry(ps: ProjectState): string | null {
  const entry = ps.audit[Math.floor(ps.audit.length / 2)];
  if (!entry) return null;
  entry.action = `${entry.action}.tampered`;
  return entry.id;
}
