import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, buildEntry, canonicalize, sha256Hex, verifyChain, type AuditInput } from './auditChain';
import type { AuditEntry } from '../contracts';

const input = (n: number, over: Partial<AuditInput> = {}): AuditInput => ({
  id: `a${n}`,
  projectId: 'p1',
  actor: 'u1',
  actorType: 'user',
  actorName: 'Ada',
  action: 'workpack.cancelled',
  target: { workpackId: `WP-${n}` },
  createdAt: `2026-11-01T00:00:0${n}.000Z`,
  ...over,
});

async function chainOf(length: number): Promise<AuditEntry[]> {
  const entries: AuditEntry[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= length; i++) {
    const e = await buildEntry(prev, input(i));
    entries.push(e);
    prev = e.hash;
  }
  return entries;
}

describe('hashing primitives', () => {
  it('computes SHA-256 correctly (FIPS 180 test vector for "abc")', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('canonicalizes objects with sorted keys at every depth and keeps array order', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 }, list: [3, 1, 2] })).toBe('{"a":{"c":3,"d":2},"b":1,"list":[3,1,2]}');
  });

  it('chains sha256(prev_hash || canonical(row)) over a hand-written canonical string', async () => {
    const entry = await buildEntry(GENESIS_HASH, input(1, { target: {} }));
    // Written out by hand (sorted keys, no whitespace), not produced by canonicalize().
    const canonical =
      '{"action":"workpack.cancelled","actor":"u1","actorName":"Ada","actorType":"user","createdAt":"2026-11-01T00:00:01.000Z","id":"a1","projectId":"p1","target":{}}';
    expect(entry.prevHash).toBe(GENESIS_HASH);
    expect(entry.hash).toBe(await sha256Hex(GENESIS_HASH + canonical));
  });

  it('gives different hashes when any field or the previous hash changes', async () => {
    const base = await buildEntry(GENESIS_HASH, input(1));
    expect((await buildEntry(GENESIS_HASH, input(1))).hash).toBe(base.hash);
    expect((await buildEntry(GENESIS_HASH, input(1, { action: 'other' }))).hash).not.toBe(base.hash);
    expect((await buildEntry('f'.repeat(64), input(1))).hash).not.toBe(base.hash);
  });
});

describe('verifying the chain', () => {
  it('accepts an untouched chain and an empty one', async () => {
    expect(await verifyChain(await chainOf(5))).toEqual({ ok: true, checked: 5, brokenAtId: null, reason: null });
    expect(await verifyChain([])).toMatchObject({ ok: true, checked: 0 });
  });

  it('names the entry whose content was altered after it was written', async () => {
    const chain = await chainOf(5);
    chain[2] = { ...chain[2]!, action: 'budget.updated' };
    const r = await verifyChain(chain);
    expect(r).toMatchObject({ ok: false, brokenAtId: 'a3' });
    expect(r.reason).toMatch(/hash/i);
  });

  it('detects a deleted entry because the next one no longer links to its predecessor', async () => {
    const chain = await chainOf(5);
    chain.splice(1, 1);
    const r = await verifyChain(chain);
    expect(r).toMatchObject({ ok: false, brokenAtId: 'a3' });
    expect(r.reason).toMatch(/prev/i);
  });

  it('detects an altered entry even if its own hash was recomputed, at the next link', async () => {
    const chain = await chainOf(5);
    chain[2] = await buildEntry(chain[1]!.hash, input(3, { action: 'forged' }));
    const r = await verifyChain(chain);
    expect(r).toMatchObject({ ok: false, brokenAtId: 'a4' });
  });

  it('verifies a range that starts mid-chain from the hash that precedes it', async () => {
    const chain = await chainOf(5);
    const range = chain.slice(2);
    expect(await verifyChain(range, { startPrevHash: chain[1]!.hash })).toMatchObject({ ok: true, checked: 3 });
    expect(await verifyChain(range, { startPrevHash: GENESIS_HASH })).toMatchObject({ ok: false, brokenAtId: 'a3' });
  });
});
