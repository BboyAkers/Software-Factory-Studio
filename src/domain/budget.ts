import { compareQueue, type OrderKey } from './queue';

/** The hard cap is always 100% of the monthly cap (spec §11.2). */
export const HARD_CAP_PERCENT = 100;

/** Budget period: the UTC calendar month containing `now`. `end` is exclusive. */
export function monthPeriod(now: Date): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
}

export function periodRolledOver(previous: Date, now: Date): boolean {
  return previous.getUTCFullYear() !== now.getUTCFullYear() || previous.getUTCMonth() !== now.getUTCMonth();
}

export function thresholds(capUsdMicros: number, softPercent: number): { softUsdMicros: number; hardUsdMicros: number } {
  return {
    softUsdMicros: Math.round((capUsdMicros * softPercent) / 100),
    hardUsdMicros: Math.round((capUsdMicros * HARD_CAP_PERCENT) / 100),
  };
}

export function budgetFlags(
  capUsdMicros: number,
  spendUsdMicros: number,
  softPercent: number,
): { softLimitHit: boolean; hardCapHit: boolean; percentUsed: number } {
  const { softUsdMicros, hardUsdMicros } = thresholds(capUsdMicros, softPercent);
  return {
    softLimitHit: spendUsdMicros >= softUsdMicros,
    hardCapHit: spendUsdMicros >= hardUsdMicros,
    percentUsed: capUsdMicros > 0 ? Math.round((spendUsdMicros / capUsdMicros) * 1000) / 10 : 0,
  };
}

/** Remaining budget over the trailing 6 h burn rate. `null` means unbounded (no burn). */
export function runway(
  capUsdMicros: number,
  spendUsdMicros: number,
  burnUsdMicrosPerHour: number,
): { days: number; hours: number } | null {
  const remaining = capUsdMicros - spendUsdMicros;
  if (remaining <= 0) return { days: 0, hours: 0 };
  if (burnUsdMicrosPerHour <= 0) return null;
  const totalHours = Math.floor(remaining / burnUsdMicrosPerHour + 1e-9);
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

export function projectedSpend(spendUsdMicros: number, burnUsdMicrosPerHour: number, hoursLeft: number): number {
  return Math.round(spendUsdMicros + burnUsdMicrosPerHour * hoursLeft);
}

export type ReserveResult = { ok: true; id: string } | { ok: false; reason: 'hard-cap' };

/**
 * Reservation protocol (spec §11.1). Before each LLM call the agent reserves its worst-case cost;
 * after the call it settles to the actual amount. A reservation is only granted while
 * committed + reserved + estimate fits under the cap, so concurrent calls cannot overshoot it.
 */
export class ReservationLedger {
  private capUsdMicros: number;
  private committedUsdMicros: number;
  private reservedUsdMicros = 0;
  private readonly open = new Map<string, number>();
  private seq = 0;

  constructor(capUsdMicros: number, committedUsdMicros = 0) {
    this.capUsdMicros = capUsdMicros;
    this.committedUsdMicros = committedUsdMicros;
  }

  get committed(): number {
    return this.committedUsdMicros;
  }

  get reserved(): number {
    return this.reservedUsdMicros;
  }

  get headroom(): number {
    return Math.max(0, this.capUsdMicros - this.committedUsdMicros - this.reservedUsdMicros);
  }

  setCap(capUsdMicros: number): void {
    this.capUsdMicros = capUsdMicros;
  }

  reserve(estimateUsdMicros: number): ReserveResult {
    if (estimateUsdMicros > this.headroom) return { ok: false, reason: 'hard-cap' };
    const id = `rsv_${++this.seq}`;
    this.open.set(id, estimateUsdMicros);
    this.reservedUsdMicros += estimateUsdMicros;
    return { ok: true, id };
  }

  settle(id: string, actualUsdMicros: number): void {
    const estimate = this.open.get(id);
    if (estimate === undefined) throw new Error(`Unknown reservation: ${id}`);
    this.open.delete(id);
    this.reservedUsdMicros -= estimate;
    this.committedUsdMicros += actualUsdMicros;
  }

  release(id: string): void {
    const estimate = this.open.get(id);
    if (estimate === undefined) return;
    this.open.delete(id);
    this.reservedUsdMicros -= estimate;
  }
}

/** Order in which budget-paused work resumes: P0 → P1 → P2, FIFO within a priority. */
export function resumeOrder<T extends OrderKey>(items: readonly T[]): T[] {
  return [...items].sort(compareQueue);
}

/** A cap raise resumes paused work only if the project was capped and the new cap clears current spend. */
export function capRaiseResumes(previousCap: number, newCap: number, spend: number): boolean {
  return newCap > previousCap && spend >= previousCap && spend < newCap;
}
