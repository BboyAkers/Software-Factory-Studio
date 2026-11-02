import type { AuditEntry, VerifyResult } from '../contracts';

/** `prev_hash` of the first entry in a project's chain. */
export const GENESIS_HASH = '0'.repeat(64);

export type AuditInput = Omit<AuditEntry, 'prevHash' | 'hash'>;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Deterministic JSON: object keys sorted at every depth, array order preserved, `undefined` dropped. */
export function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`)
    .join(',');
  return `{${body}}`;
}

function rowOf(e: AuditInput): AuditInput {
  return {
    id: e.id,
    projectId: e.projectId,
    actor: e.actor,
    actorType: e.actorType,
    actorName: e.actorName,
    action: e.action,
    target: e.target,
    createdAt: e.createdAt,
  };
}

/** hash = sha256(prev_hash || canonical(row)) (spec §4.2). */
export async function buildEntry(prevHash: string, input: AuditInput): Promise<AuditEntry> {
  const row = rowOf(input);
  const hash = await sha256Hex(prevHash + canonicalize(row));
  return { ...row, prevHash, hash };
}

/**
 * Verify entries in chronological order. `startPrevHash` is the hash that precedes the first
 * entry when checking a range that does not start at the beginning of the chain.
 */
export async function verifyChain(
  entries: readonly AuditEntry[],
  options: { startPrevHash?: string } = {},
): Promise<VerifyResult> {
  let previous = options.startPrevHash ?? GENESIS_HASH;
  let checked = 0;
  for (const entry of entries) {
    if (entry.prevHash !== previous) {
      return { ok: false, checked, brokenAtId: entry.id, reason: 'prev_hash does not match the preceding entry (an entry is missing or reordered)' };
    }
    const expected = await sha256Hex(entry.prevHash + canonicalize(rowOf(entry)));
    if (expected !== entry.hash) {
      return { ok: false, checked, brokenAtId: entry.id, reason: 'hash mismatch: the entry content was altered after it was written' };
    }
    previous = entry.hash;
    checked++;
  }
  return { ok: true, checked, brokenAtId: null, reason: null };
}
