import { setupServer } from 'msw/node';
import { ReservationLedger } from '../domain/budget';
import type { Epic, Priority, Problem, Project, Role, Run, Workpack, WorkpackStatus } from '../contracts';
import { makeEpic } from './backend/epics';
import { advanceClock, runDueTasks } from './backend/runtime';
import { tickProject } from './backend/simulator';
import { createProjectState, createStore, SYSTEM_ACTOR, type ProjectState, type ScenarioId, type Store } from './backend/store';
import { createWorkpack, endRun, startRun, transition } from './backend/workpacks';
import { createHandlers } from './handlers';
import { DOGFOOD_PROJECT_ID, seedWorld } from './seeds';
import { seedPlatform } from './seeds/platform';

/** Fixed virtual time for tests: mid-month, so budget-period maths never straddles a rollover. */
export const TEST_NOW_MS = Date.parse('2026-11-15T12:00:00.000Z');
export const TEST_PROJECT_ID = 'proj';

export interface CallOptions {
  role?: Role;
  userId?: string;
  name?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Project sent as `X-Project`. Pass `null` to omit the header. */
  project?: string | null;
}

/**
 * A success body, or a problem body when the call fails. Both can carry `status` with different types,
 * so the problem's is dropped (read the HTTP status from the response instead).
 */
export type Result<T> = T & Partial<Omit<Problem, 'status'>>;

export interface CallResult<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export type Call = <T = unknown>(method: string, path: string, options?: CallOptions) => Promise<CallResult<T>>;

export interface World {
  store: Store;
  ps: ProjectState;
  call: Call;
  close: () => void;
}

export interface WorldOptions {
  /** Seed agents, integrations, policies, token, Slack and repository (default true). */
  platform?: boolean;
}

/**
 * A fake backend on a fixed clock with no simulator running. Tests change state by calling the
 * backend services directly, then observe behavior through real HTTP calls handled by MSW.
 */
export function createWorld(options: WorldOptions = {}): World {
  const store = createStore();
  store.clock.fixedMs = TEST_NOW_MS;
  store.tuning.previewMs = 0;

  const project: Project = {
    id: TEST_PROJECT_ID,
    name: 'Test project',
    repo: 'acme/app',
    defaultBranch: 'main',
    createdAt: new Date(TEST_NOW_MS - 30 * 86_400_000).toISOString(),
  };
  const ps = createProjectState(store, project, TEST_NOW_MS);
  store.projects.set(project.id, ps);
  if (options.platform !== false) seedPlatform(ps, { populated: false });
  return serve(store, ps);
}

/** The full seeded mock world (the dogfood project plus an empty sandbox) on a fixed clock, for a scenario. */
export async function createSeededWorld(scenario: ScenarioId = 'healthy'): Promise<World> {
  const store = createStore();
  store.clock.fixedMs = TEST_NOW_MS;
  store.tuning.previewMs = 0;
  await seedWorld(store, scenario);
  return serve(store, store.projects.get(DOGFOOD_PROJECT_ID)!);
}

/** Put MSW in front of a store and give tests a `call` that speaks the real HTTP contract to one project. */
function serve(store: Store, ps: ProjectState): World {
  const server = setupServer(...createHandlers(() => store, { latencyMs: 0 }));
  server.listen({ onUnhandledFrame: 'error' });

  const call: Call = async (method, path, opts = {}) => {
    const role = opts.role ?? 'admin';
    const userId = opts.userId ?? `u-${role}`;
    const name = opts.name ?? `Test ${role}`;
    const project = opts.project === undefined ? ps.project.id : opts.project;
    const headers: Record<string, string> = {
      authorization: `Bearer mock:${role}:${userId}:${encodeURIComponent(name)}`,
      ...(project ? { 'x-project': project } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    };
    const response = await fetch(`http://localhost/api/v1${path}`, {
      method,
      headers,
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text === '' ? null : JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body: body as never, headers: response.headers };
  };

  return { store, ps, call, close: () => server.close() };
}

// ---------------------------------------------------------------------------
// Fixtures: put the backend in a known state without running the simulator
// ---------------------------------------------------------------------------

let fixtureCounter = 0;

export function addEpic(ps: ProjectState, over: Partial<Epic> = {}): Epic {
  const n = ++fixtureCounter;
  const epic = makeEpic(ps, {
    title: over.title ?? `Fixture epic ${n}`,
    specMarkdown: over.specMarkdown ?? '---\ntitle: "Fixture epic"\nmode: feature\npriority: P2\nareas: [billing]\nacceptance:\n  - "Works"\n---\n',
    mode: over.mode ?? 'feature',
    priority: over.priority ?? 'P2 Normal',
    areas: over.areas ?? ['billing'],
    acceptance: over.acceptance ?? ['Works'],
    origin: over.origin ?? 'github-ui',
    sourceRef: over.sourceRef ?? `https://github.com/acme/app/issues/${900 + n}`,
    issueNumber: over.issueNumber ?? 900 + n,
    createdBy: over.createdBy ?? 'octocat',
    status: over.status ?? 'executing',
  });
  return epic;
}

export interface WorkpackFixture {
  epicId?: string;
  status?: WorkpackStatus;
  priority?: Priority;
  title?: string;
  targetFiles?: string[];
  dependsOn?: string[];
}

/** Create a workpack and walk it to `status`. In-progress and verification also get a live run. */
export function addWorkpack(ps: ProjectState, over: WorkpackFixture = {}): Workpack & { run: Run | null } {
  const epicId = over.epicId ?? ps.epics[0]?.id ?? addEpic(ps).id;
  const n = ++fixtureCounter;
  const wp = createWorkpack(
    ps,
    {
      epicId,
      title: over.title ?? `Fixture workpack ${n}`,
      priority: over.priority ?? 'P2 Normal',
      category: 'Backend',
      targetFiles: over.targetFiles ?? [`src/fixture-${n}.ts`],
      dependsOn: over.dependsOn ?? [],
    },
    SYSTEM_ACTOR,
  );
  const path: WorkpackStatus[] = ['planning', 'in-progress', 'verification', 'awaiting-review', 'done'];
  const target = over.status ?? 'queued';
  let run: Run | null = null;
  if (target === 'failed' || target === 'cancelled') {
    transition(ps, wp, 'planning', { actor: 'orchestrator', force: true });
    transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true });
    run = startRun(ps, wp, 3);
    transition(ps, wp, target, { actor: 'orchestrator', force: true });
    endRun(ps, run, target);
  } else if (target !== 'queued') {
    for (const step of path) {
      transition(ps, wp, step, { actor: 'orchestrator', force: true });
      if (step === 'in-progress') run = startRun(ps, wp, 3);
      if ((step === 'awaiting-review' || step === 'done') && run) endRun(ps, run, 'succeeded');
      if (step === target) break;
    }
  }
  wp.commitSha = target === 'queued' || target === 'planning' ? null : `c0ffee${String(n).padStart(2, '0')}abc`;
  if (target === 'done') {
    wp.mergedAt = wp.completedAt;
    wp.prNumber = 400 + n;
  }
  if (target === 'verification' || target === 'awaiting-review' || target === 'done') wp.prNumber ??= 400 + n;
  return Object.assign(wp, { run });
}

/** Move the virtual clock forward in steps, running every scheduled task that comes due. */
export function advance(world: Pick<World, 'store' | 'ps'>, ms: number, stepMs = 1000): void {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    advanceClock(world.store, stepMs);
    runDueTasks(world.ps);
  }
}

/** Put the month's committed spend at an exact amount (micros), keeping the current cap. */
export function setSpend(ps: ProjectState, micros: number): void {
  ps.budget.ledger = new ReservationLedger(ps.budget.capUsdMicros, micros);
}

export const eventTypes = (ps: ProjectState): string[] => ps.events.ring.map((e) => e.event.type);

/** Make every simulated delay short so a whole workpack lifecycle fits in a few seconds of virtual time. */
export function fastForwardTuning(store: Store): void {
  store.tuning.turnMs = 400;
  store.tuning.planningMs = 200;
  store.tuning.gateMs = 200;
  store.tuning.previewMs = 0;
}

/** Run the simulator against the virtual clock: each step advances time and ticks every project. */
export function simulate(world: Pick<World, 'store' | 'ps'>, ms: number, stepMs = 100): void {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    advanceClock(world.store, stepMs);
    tickProject(world.ps);
  }
}
