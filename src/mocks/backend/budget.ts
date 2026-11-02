import type { Attribution, AttributionBy, SpendSource, UpdateBudgetRequest, UpdateBudgetResponse } from '../../contracts';
import { ReservationLedger, capRaiseResumes, monthPeriod, periodRolledOver } from '../../domain/budget';
import { budgetView, chargeSpend, emit, isHardCapHit, nowIso, nowMs, recordAudit, type ChargeInput } from './runtime';
import type { Actor, ProjectState } from './store';
import { SYSTEM_ACTOR } from './store';
import { holdAll, refreshQueue, releaseAll } from './workpacks';

const MICROS_PER_USD = 1_000_000;
/** The Budget service coalesces settlements: at most one `budget.updated` every 2 s (spec §11.1). */
const COALESCE_MS = 2_000;

const SOURCE_LABEL: Record<SpendSource, string> = {
  workpack: 'Workpack runs',
  eval: 'Agent evals',
  benchmark: 'Benchmarks',
  preview: 'Spec previews',
  intake: 'Epic planning',
};

export function publishBudget(ps: ProjectState, options: { force?: boolean } = {}): void {
  const now = nowMs(ps.store);
  if (!options.force && now - ps.budget.lastEmitMs < COALESCE_MS) return;
  ps.budget.lastEmitMs = now;
  const view = budgetView(ps);
  emit(ps, {
    type: 'budget.updated',
    spendUsdMicros: view.spendUsdMicros,
    softLimitHit: view.softLimitHit,
    hardCapHit: view.hardCapHit,
    runwayHours: view.runway ? view.runway.days * 24 + view.runway.hours : null,
  });
}

/** The cap is reached: every open workpack pauses (never fails) and new work queues behind the budget. */
export function enterHardCap(ps: ProjectState): number {
  const paused = holdAll(ps, 'budget-hard-cap');
  if (!ps.budget.hardAnnounced) {
    ps.budget.hardAnnounced = true;
    recordAudit(ps, SYSTEM_ACTOR, 'budget.hard_cap_reached', { spendUsdMicros: ps.budget.ledger.committed, pausedWorkpacks: paused });
  }
  refreshQueue(ps);
  publishBudget(ps, { force: true });
  return paused;
}

/**
 * Spend through the ledger; if the reservation is denied the hard cap is reached. The last sliver of
 * headroom is booked as spent so the displayed spend and the cap agree, then the project pauses.
 */
export function spendOrPause(ps: ProjectState, entry: ChargeInput): boolean {
  if (chargeSpend(ps, entry)) {
    noteSoftLimit(ps);
    return true;
  }
  const left = ps.budget.ledger.headroom;
  if (left > 0) chargeSpend(ps, { ...entry, usdMicros: left });
  enterHardCap(ps);
  return false;
}

function noteSoftLimit(ps: ProjectState): void {
  const view = budgetView(ps);
  if (view.softLimitHit && !ps.budget.softAnnounced) {
    ps.budget.softAnnounced = true;
    recordAudit(ps, SYSTEM_ACTOR, 'budget.soft_limit_reached', { percentUsed: view.percentUsed });
    publishBudget(ps, { force: true });
  }
}

export function updateBudget(ps: ProjectState, request: UpdateBudgetRequest, actor: Actor): UpdateBudgetResponse {
  const previousCap = ps.budget.capUsdMicros;
  const spend = ps.budget.ledger.committed;
  const newCap = Math.round(request.monthlyCapUsd * MICROS_PER_USD);

  ps.budget.capUsdMicros = newCap;
  ps.budget.softLimitPercent = request.softLimitPercent;
  ps.budget.ledger.setCap(newCap);

  let resumedRuns = 0;
  if (capRaiseResumes(previousCap, newCap, spend)) {
    ps.budget.hardAnnounced = false;
    resumedRuns = releaseAll(ps, 'budget-hard-cap', actor);
    emit(ps, { type: 'budget.resumed', actor: actor.name, resumedRuns, reason: 'cap-raised' });
    refreshQueue(ps);
  } else if (isHardCapHit(ps)) {
    enterHardCap(ps);
  }

  const view = budgetView(ps);
  ps.budget.softAnnounced = view.softLimitHit;
  recordAudit(ps, actor, 'budget.updated', {
    previousCapUsd: previousCap / MICROS_PER_USD,
    monthlyCapUsd: request.monthlyCapUsd,
    softLimitPercent: request.softLimitPercent,
    resumedRuns,
  });
  publishBudget(ps, { force: true });
  return { budget: view, resumedRuns };
}

/** A new UTC month resets spend and resumes everything the cap had paused (spec §11.1). */
export function rolloverIfNeeded(ps: ProjectState): boolean {
  const now = new Date(nowMs(ps.store));
  if (!periodRolledOver(new Date(ps.budget.periodStartMs), now)) return false;
  const wasCapped = isHardCapHit(ps);
  ps.budget.periodStartMs = monthPeriod(now).start.getTime();
  ps.budget.ledger = new ReservationLedger(ps.budget.capUsdMicros, 0);
  ps.budget.softAnnounced = false;
  ps.budget.hardAnnounced = false;
  recordAudit(ps, SYSTEM_ACTOR, 'budget.period_rollover', { periodStart: nowIso(ps.store) });
  if (wasCapped) {
    const resumedRuns = releaseAll(ps, 'budget-hard-cap');
    emit(ps, { type: 'budget.resumed', actor: SYSTEM_ACTOR.name, resumedRuns, reason: 'period-rollover' });
    refreshQueue(ps);
  }
  publishBudget(ps, { force: true });
  return true;
}

/** Spend by epic, agent, or source for the current budget period. Attribution only: nothing here is enforced. */
export function attribution(ps: ProjectState, by: AttributionBy): Attribution {
  const start = monthPeriod(new Date(nowMs(ps.store))).start.getTime();
  const totals = new Map<string, { label: string; usdMicros: number }>();

  const add = (key: string, label: string, usdMicros: number) => {
    const row = totals.get(key) ?? { label, usdMicros: 0 };
    row.usdMicros += usdMicros;
    totals.set(key, row);
  };

  for (const entry of ps.spend) {
    if (Date.parse(entry.at) < start) continue;
    if (by === 'epic') {
      const epic = entry.epicId ? ps.epics.find((e) => e.id === entry.epicId) : undefined;
      add(entry.epicId ?? 'none', epic ? `${epic.id} · ${epic.title}` : 'No epic (previews, evals, benchmarks)', entry.usdMicros);
    } else if (by === 'agent') {
      const agent = entry.agentId ? ps.agents.find((a) => a.id === entry.agentId) : undefined;
      add(entry.agentId ?? 'none', agent?.name ?? 'Unattributed', entry.usdMicros);
    } else {
      add(entry.source, SOURCE_LABEL[entry.source], entry.usdMicros);
    }
  }

  const items = [...totals.entries()]
    .map(([key, row]) => ({ key, label: row.label, usdMicros: Math.round(row.usdMicros) }))
    .sort((a, b) => b.usdMicros - a.usdMicros);
  return { by, totalUsdMicros: items.reduce((sum, i) => sum + i.usdMicros, 0), items };
}
