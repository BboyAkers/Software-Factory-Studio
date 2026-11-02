import type { Project } from '../../contracts';
import { ReservationLedger, monthPeriod } from '../../domain/budget';
import { enterHardCap } from '../backend/budget';
import { flushAudit, nowMs, recordSpendEntry, reseed } from '../backend/runtime';
import { createProjectState, type ProjectState, type ScenarioId, type Store } from '../backend/store';
import { seedDogfood } from './dogfood';
import { seedPlatform } from './platform';

export const DOGFOOD_PROJECT_ID = 'software-factory-studio';
export const SANDBOX_PROJECT_ID = 'sandbox-demo';

const DAY = 86_400_000;
const MICROS = 1_000_000;

export const SCENARIOS: { id: ScenarioId; label: string; description: string }[] = [
  { id: 'healthy', label: 'Healthy', description: 'Normal activity with a 10% blocking-gate failure rate.' },
  { id: 'soft-limit', label: 'Soft limit', description: 'Spend starts at 82% of the monthly cap.' },
  { id: 'hard-cap', label: 'Hard cap', description: 'Spend at 100%: every open workpack is paused and the banner shows.' },
  { id: 'gate-failures', label: 'Gate failures', description: 'Blocking gates fail 60% of the time, so workpacks exhaust their attempts.' },
  { id: 'sla-pressure', label: 'SLA pressure', description: 'Several P0 and P1 workpacks are minutes from breaching their SLA.' },
  { id: 'quiet', label: 'Quiet project', description: 'A project with no data, to see every empty state.' },
];

const project = (id: string, name: string, repo: string, createdAt: number): Project => ({
  id,
  name,
  repo,
  defaultBranch: 'main',
  createdAt: new Date(createdAt).toISOString(),
});

/** Set the month's spend to an exact amount, backfilling one entry earlier in the month so attribution still adds up. */
function setMonthSpend(ps: ProjectState, targetMicros: number, now: number): void {
  const monthStart = monthPeriod(new Date(now)).start.getTime();
  const current = ps.spend.filter((s) => Date.parse(s.at) >= monthStart).reduce((sum, s) => sum + s.usdMicros, 0);
  if (targetMicros > current) {
    const at = Math.max(monthStart, now - 3 * DAY);
    recordSpendEntry(ps, { usdMicros: targetMicros - current, source: 'workpack', epicId: null, workpackId: null, agentId: null, at: new Date(at).toISOString() });
  }
  ps.budget.ledger = new ReservationLedger(ps.budget.capUsdMicros, Math.max(targetMicros, current));
}

/** After the history is replayed, the month's spend is whatever the ledger entries inside this UTC month add up to. */
function settleBudget(ps: ProjectState, scenario: ScenarioId, now: number): void {
  const monthStart = monthPeriod(new Date(now)).start.getTime();
  const spent = ps.spend.filter((s) => Date.parse(s.at) >= monthStart).reduce((sum, s) => sum + s.usdMicros, 0);
  ps.budget.periodStartMs = monthStart;
  ps.budget.slackChannel = ps.slack.channel;
  ps.budget.ledger = new ReservationLedger(ps.budget.capUsdMicros, spent);
  if (scenario === 'soft-limit') {
    setMonthSpend(ps, Math.round(ps.budget.capUsdMicros * 0.82), now);
    ps.budget.softAnnounced = true;
  }
  if (scenario === 'hard-cap') {
    setMonthSpend(ps, ps.budget.capUsdMicros, now);
    ps.budget.softAnnounced = true;
    enterHardCap(ps);
  }
}

/** Put a few open P0 and P1 workpacks a few minutes from breaching, so the SLA badges and escalation can be watched. */
function applySlaPressure(ps: ProjectState, now: number): void {
  const open = ps.workpacks.filter((w) => w.slaDueAt !== null && !w.slaBreached && w.status !== 'done' && w.status !== 'failed' && w.status !== 'cancelled');
  const minutes = [6, 14, 27, 41];
  open.slice(0, minutes.length).forEach((wp, i) => {
    const windowMs = (wp.priority === 'P0 Blocker' ? 4 : 24) * 3_600_000;
    wp.slaDueAt = new Date(now + minutes[i]! * 60_000).toISOString();
    wp.createdAt = new Date(now + minutes[i]! * 60_000 - windowMs).toISOString();
    wp.version += 1;
  });
}

/**
 * Build the whole mock world: the dogfood project (the Studio building itself) and an empty second
 * project, then apply a scenario. Replaces anything already in the store.
 */
export async function seedWorld(store: Store, scenario: ScenarioId = 'healthy'): Promise<void> {
  // Whoever is connected should hear that the world was rebuilt, not every event of the history being replayed.
  const connected = [...store.streams];
  store.streams.clear();
  store.projects.clear();
  store.idempotency.clear();
  store.sim.scenario = scenario;
  store.sim.gateFailureRate = scenario === 'gate-failures' ? 0.6 : 0.1;
  reseed(store, store.sim.seed);
  const now = nowMs(store);

  const dogfood = createProjectState(store, project(DOGFOOD_PROJECT_ID, 'Software Factory Studio', 'BboyAkers/Software-Factory-Studio', now - 21 * DAY), now);
  store.projects.set(dogfood.project.id, dogfood);
  dogfood.budget.capUsdMicros = 1_500 * MICROS;
  seedPlatform(dogfood, { populated: scenario !== 'quiet' });
  if (scenario !== 'quiet') seedDogfood(dogfood);
  settleBudget(dogfood, scenario, now);
  if (scenario === 'sla-pressure') applySlaPressure(dogfood, now);

  const sandbox = createProjectState(store, project(SANDBOX_PROJECT_ID, 'Sandbox demo', 'BboyAkers/sandbox-demo', now - 2 * DAY), now);
  store.projects.set(sandbox.project.id, sandbox);
  sandbox.budget.capUsdMicros = 250 * MICROS;
  sandbox.budget.ledger = new ReservationLedger(sandbox.budget.capUsdMicros, 0);
  seedPlatform(sandbox, { populated: false });

  // Seeding announced a lot of history on the streams. Clients connect to a world that is already built.
  for (const ps of store.projects.values()) {
    await flushAudit(ps);
    ps.events = { seq: 0, ring: [] };
    ps.runStreams.clear();
  }
  for (const client of connected) store.streams.add(client);
}
