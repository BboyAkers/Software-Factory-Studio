import { describe, expect, it } from 'vitest';
import {
  ReservationLedger,
  budgetFlags,
  capRaiseResumes,
  monthPeriod,
  periodRolledOver,
  projectedSpend,
  resumeOrder,
  runway,
  thresholds,
} from './budget';

const USD = 1_000_000; // micros per dollar

describe('budget period (spec §11.1: calendar month, UTC)', () => {
  it('spans the UTC calendar month containing now', () => {
    const p = monthPeriod(new Date('2026-11-15T10:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('rolls December into January of the next year', () => {
    expect(monthPeriod(new Date('2026-12-31T23:59:59Z')).end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('detects a rollover only when the UTC month changes', () => {
    expect(periodRolledOver(new Date('2026-11-30T23:59:59Z'), new Date('2026-12-01T00:00:00Z'))).toBe(true);
    expect(periodRolledOver(new Date('2026-11-10T00:00:00Z'), new Date('2026-11-20T00:00:00Z'))).toBe(false);
  });
});

describe('thresholds and flags (spec §11.2)', () => {
  it('puts the soft limit at the configured percent and the hard cap at 100% of the cap', () => {
    expect(thresholds(5000 * USD, 80)).toEqual({ softUsdMicros: 4000 * USD, hardUsdMicros: 5000 * USD });
  });

  it('flags the soft limit at exactly 80% and the hard cap at exactly 100%', () => {
    const cap = 5000 * USD;
    expect(budgetFlags(cap, 3999 * USD, 80)).toMatchObject({ softLimitHit: false, hardCapHit: false });
    expect(budgetFlags(cap, 4000 * USD, 80)).toMatchObject({ softLimitHit: true, hardCapHit: false });
    expect(budgetFlags(cap, 5000 * USD, 80)).toMatchObject({ softLimitHit: true, hardCapHit: true });
    expect(budgetFlags(cap, 2500 * USD, 80).percentUsed).toBe(50);
  });
});

describe('runway and projection', () => {
  it('divides the remaining budget by the trailing burn rate into days and hours', () => {
    // $1,160 left at $4/hour = 290 hours = 12 days 2 hours
    expect(runway(5000 * USD, 3840 * USD, 4 * USD)).toEqual({ days: 12, hours: 2 });
  });

  it('is unbounded (null) with no burn and zero once the cap is reached', () => {
    expect(runway(5000 * USD, 3840 * USD, 0)).toBeNull();
    expect(runway(5000 * USD, 5000 * USD, 4 * USD)).toEqual({ days: 0, hours: 0 });
  });

  it('projects end-of-month spend from the burn rate and the hours left', () => {
    expect(projectedSpend(3000 * USD, 2 * USD, 100)).toBe(3200 * USD);
  });
});

describe('reservation ledger: concurrent calls cannot overshoot the hard cap', () => {
  it('denies a reservation that would cross the cap and accepts one that fits exactly', () => {
    const ledger = new ReservationLedger(100, 0);
    expect(ledger.reserve(60).ok).toBe(true);
    expect(ledger.reserve(41)).toEqual({ ok: false, reason: 'hard-cap' });
    expect(ledger.reserve(40).ok).toBe(true);
    expect(ledger.headroom).toBe(0);
  });

  it('never lets reserved plus committed exceed the cap under many concurrent reservations', () => {
    const ledger = new ReservationLedger(100, 0);
    const results = Array.from({ length: 8 }, () => ledger.reserve(20));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok)).toHaveLength(3);
    expect(ledger.committed + ledger.reserved).toBeLessThanOrEqual(100);
  });

  it('settles to the actual amount and returns the unused estimate to the headroom', () => {
    const ledger = new ReservationLedger(100, 10);
    const r = ledger.reserve(50);
    if (!r.ok) throw new Error('expected reservation');
    expect(ledger.headroom).toBe(40);
    ledger.settle(r.id, 30);
    expect(ledger.committed).toBe(40);
    expect(ledger.reserved).toBe(0);
    expect(ledger.headroom).toBe(60);
  });

  it('frees a reservation that is released without spending', () => {
    const ledger = new ReservationLedger(100, 0);
    const r = ledger.reserve(70);
    if (!r.ok) throw new Error('expected reservation');
    ledger.release(r.id);
    expect(ledger.headroom).toBe(100);
  });

  it('starts denying once prior spend already fills the cap, and allows more after a raise', () => {
    const ledger = new ReservationLedger(100, 100);
    expect(ledger.reserve(1).ok).toBe(false);
    ledger.setCap(150);
    expect(ledger.reserve(50).ok).toBe(true);
  });

  it('rejects settling an unknown reservation', () => {
    expect(() => new ReservationLedger(100, 0).settle('nope', 1)).toThrow(/unknown reservation/i);
  });
});

describe('resume after a hard cap', () => {
  it('resumes in priority order P0, P1, P2 and FIFO within a priority', () => {
    const t = (s: number) => `2026-11-01T00:00:0${s}Z`;
    const order = resumeOrder([
      { id: 'p2', priority: 'P2 Normal' as const, createdAt: t(1), escalatedAt: null },
      { id: 'p1b', priority: 'P1 High' as const, createdAt: t(3), escalatedAt: null },
      { id: 'p0', priority: 'P0 Blocker' as const, createdAt: t(9), escalatedAt: null },
      { id: 'p1a', priority: 'P1 High' as const, createdAt: t(2), escalatedAt: null },
    ]).map((i) => i.id);
    expect(order).toEqual(['p0', 'p1a', 'p1b', 'p2']);
  });

  it('resumes paused work only when a raise lifts the cap above current spend', () => {
    expect(capRaiseResumes(100, 150, 100)).toBe(true);
    expect(capRaiseResumes(100, 150, 80)).toBe(false); // was not capped
    expect(capRaiseResumes(100, 100, 100)).toBe(false); // no raise
    expect(capRaiseResumes(100, 120, 130)).toBe(false); // still over the new cap
  });
});
