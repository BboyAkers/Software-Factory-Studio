import type { PausedReason, Priority, QueuedReason, WorkpackStatus } from '../contracts';
import { isTerminal } from './workpackMachine';

/** Concurrent workpacks per project (spec §5.1 rule 10). */
export const CAPACITY = 8;

const HOUR_MS = 3_600_000;
const SLA_HOURS: Partial<Record<Priority, number>> = { 'P0 Blocker': 4, 'P1 High': 24 };

// ---------------------------------------------------------------------------
// SLA
// ---------------------------------------------------------------------------

export function slaDueAt(priority: Priority, createdAt: string): string | null {
  const hours = SLA_HOURS[priority];
  if (!hours) return null;
  return new Date(Date.parse(createdAt) + hours * HOUR_MS).toISOString();
}

export type SlaState = 'none' | 'ok' | 'due-soon' | 'breached';

export interface SlaSubject {
  priority: Priority;
  slaDueAt: string | null;
  slaBreached: boolean;
  status: WorkpackStatus;
}

export function slaState(wp: SlaSubject, now: Date): { state: SlaState; remainingMs: number | null } {
  const remainingMs = wp.slaDueAt ? Date.parse(wp.slaDueAt) - now.getTime() : null;
  if (wp.slaBreached) return { state: 'breached', remainingMs };
  if (remainingMs === null) return { state: 'none', remainingMs: null };
  if (isTerminal(wp.status)) return { state: 'none', remainingMs: null };
  if (remainingMs < 0) return { state: 'breached', remainingMs };
  const windowMs = (SLA_HOURS[wp.priority] ?? 0) * HOUR_MS;
  if (windowMs > 0 && remainingMs <= windowMs * 0.25) return { state: 'due-soon', remainingMs };
  return { state: 'ok', remainingMs };
}

/** True once, when an open workpack is past due and has not been flagged yet. */
export function needsEscalation(wp: SlaSubject, now: Date): boolean {
  if (wp.slaBreached || !wp.slaDueAt || isTerminal(wp.status)) return false;
  return now.getTime() > Date.parse(wp.slaDueAt);
}

/** Fields set on breach. `priority` is never touched: escalation only changes queue order. */
export function escalate(now: Date): { slaBreached: true; escalatedAt: string } {
  return { slaBreached: true, escalatedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Queue order
// ---------------------------------------------------------------------------

export interface QueueItem {
  id: string;
  priority: Priority;
  createdAt: string;
  escalatedAt: string | null;
  targetFiles: string[];
  dependsOn: string[];
  pausedReasons: readonly PausedReason[];
}

/** The fields queue order depends on. */
export type OrderKey = Pick<QueueItem, 'id' | 'priority' | 'createdAt' | 'escalatedAt'>;

/** Band 0: P0 and escalated. Band 1: P1. Band 2: P2. */
export function queueBand(item: Pick<QueueItem, 'priority' | 'escalatedAt'>): 0 | 1 | 2 {
  if (item.priority === 'P0 Blocker' || item.escalatedAt) return 0;
  return item.priority === 'P1 High' ? 1 : 2;
}

export function compareQueue(a: OrderKey, b: OrderKey): number {
  const band = queueBand(a) - queueBand(b);
  if (band !== 0) return band;
  const key = (i: OrderKey) => (queueBand(i) === 0 ? (i.escalatedAt ?? i.createdAt) : i.createdAt);
  const time = Date.parse(key(a)) - Date.parse(key(b));
  if (time !== 0) return time;
  return a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// File locks (glob-aware)
// ---------------------------------------------------------------------------

const hasWildcard = (p: string) => /[*?]/.test(p);
const normalize = (p: string) => p.trim().replace(/^\.\//, '');

function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesGlob(pattern: string, path: string): boolean {
  return globToRegExp(normalize(pattern)).test(normalize(path));
}

/** Literal directory prefix before the first wildcard, e.g. `src/billing/**` → `src/billing/`. */
function dirPrefix(pattern: string): string {
  const idx = pattern.search(/[*?]/);
  const literal = idx === -1 ? pattern : pattern.slice(0, idx);
  return literal.slice(0, literal.lastIndexOf('/') + 1);
}

function patternsOverlap(a: string, b: string): boolean {
  const p = normalize(a);
  const q = normalize(b);
  const pw = hasWildcard(p);
  const qw = hasWildcard(q);
  if (!pw && !qw) return p === q;
  if (pw && !qw) return matchesGlob(p, q);
  if (!pw && qw) return matchesGlob(q, p);
  const x = dirPrefix(p);
  const y = dirPrefix(q);
  return x.startsWith(y) || y.startsWith(x);
}

export function globsOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.some((p) => b.some((q) => patternsOverlap(p, q)));
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

export interface LockHolder {
  id: string;
  targetFiles: readonly string[];
}

export interface AdmissionContext {
  queued: QueueItem[];
  /** Workpacks in planning, in-progress or verification (paused ones included): they hold slots and locks. */
  active: LockHolder[];
  doneIds: ReadonlySet<string>;
  hardCapHit: boolean;
  integrationEnabled: boolean;
  projectPaused: boolean;
  capacity?: number;
}

export interface AdmissionResult {
  admitted: string[];
  /** Every queued reason that applies, highest precedence first. */
  reasons: Record<string, QueuedReason[]>;
  blockedBy: Record<string, string>;
}

/**
 * One scheduling pass: which queued workpacks may start now, and why the rest cannot.
 * Candidates are taken in queue order; each admitted workpack immediately holds a slot
 * and its files for the rest of the pass.
 */
export function admit(ctx: AdmissionContext): AdmissionResult {
  const capacity = ctx.capacity ?? CAPACITY;
  const holders: LockHolder[] = [...ctx.active];
  const admitted: string[] = [];
  const reasons: Record<string, QueuedReason[]> = {};
  const blockedBy: Record<string, string> = {};

  for (const wp of [...ctx.queued].sort(compareQueue)) {
    const why: QueuedReason[] = [];
    if (!ctx.integrationEnabled) why.push('integration-off');
    if (ctx.hardCapHit) why.push('budget');
    if (ctx.projectPaused || wp.pausedReasons.length > 0) why.push('paused');
    if (wp.dependsOn.some((d) => !ctx.doneIds.has(d))) why.push('deps');
    const blocker = holders.find((h) => globsOverlap(wp.targetFiles, h.targetFiles));
    if (blocker) {
      why.push('file-lock');
      blockedBy[wp.id] = blocker.id;
    }
    if (holders.length >= capacity) why.push('capacity');

    if (why.length === 0) {
      admitted.push(wp.id);
      holders.push({ id: wp.id, targetFiles: wp.targetFiles });
    } else {
      reasons[wp.id] = why;
    }
  }
  return { admitted, reasons, blockedBy };
}
