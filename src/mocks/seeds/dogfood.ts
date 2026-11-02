import type { Contract, DagNode, Epic, Run, Workpack } from '../../contracts';
import { longHash } from '../backend/codegen';
import { resumePipeline, makeEpic } from '../backend/epics';
import { humanSave } from '../backend/files';
import { recordGateResults, type GatePlan } from '../backend/gates';
import { specDocument } from '../backend/intakeSim';
import { TOKENS, contractsFor, withOverlaps } from '../backend/plan';
import { assignPr, mergeWorkpack } from '../backend/quality';
import { bumpCounter, nextId, recordAudit, recordSpendEntry } from '../backend/runtime';
import { beginRunScratch, runTurn, scheduleSynthesisStart } from '../backend/simulator';
import { approveSuggestion, inject, rejectSuggestion, suggest } from '../backend/steering';
import { SYSTEM_ACTOR, type IssueRecord, type ProjectState } from '../backend/store';
import { acquireLock, cancelWorkpack, archiveWorkpack, createWorkpack, endRun, pauseWorkpack, refreshQueue, startRun, transition } from '../backend/workpacks';
import { PERSONAS, actorOf } from '../personas';
import { EPICS, WORKPACKS, type EpicSeed, type WpSeed } from './specs';
import { Timeline } from './timeline';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MICROS = 1_000_000;
/** Blended price used when the simulator pays for a turn: $4 per million tokens. */
const MICROS_PER_TOKEN = 4;
const TURN_MS = 9_000;

const priorityCode = (p: Epic['priority']): 'P0' | 'P1' | 'P2' => (p === 'P0 Blocker' ? 'P0' : p === 'P1 High' ? 'P1' : 'P2');
const hashOf = (text: string): number => Number.parseInt(longHash(text).slice(0, 8), 16);
const usd = (dollars: number): number => Math.round(dollars * MICROS);

interface Ctx {
  ps: ProjectState;
  tl: Timeline;
  now: number;
  at: (minutesAgo: number) => number;
  epics: Map<string, Epic>;
  wps: Map<string, Workpack>;
  contracts: Map<string, Contract[]>;
  /** Seeded run state to stagger once the clock is live again. */
  running: { runId: string }[];
}

const jonas = actorOf(PERSONAS.engineer);
const mira = actorOf(PERSONAS.maintainer);
const priya = actorOf(PERSONAS.viewer);
const austin = actorOf(PERSONAS.admin);

// ---------------------------------------------------------------------------
// Epics, their GitHub issues, and intake events
// ---------------------------------------------------------------------------

function topicOf(seed: EpicSeed) {
  return { title: seed.title, mode: seed.mode, areas: seed.areas, acceptance: seed.acceptance, body: seed.prose };
}

function seedEpic(ctx: Ctx, seed: EpicSeed): void {
  const { ps, tl } = ctx;
  const created = ctx.at(seed.ageMin);
  const repo = ps.repository?.fullName ?? ps.project.repo;

  tl.at(created, () => {
    const body = specDocument(topicOf(seed), priorityCode(seed.priority));
    const url = `https://github.com/${repo}/issues/${seed.issue}`;
    const issue: IssueRecord = {
      number: seed.issue,
      url,
      title: seed.title,
      body,
      labels: ['factory', 'factory:accepted'],
      origin: seed.origin,
      author: seed.author,
      createdAt: new Date(created).toISOString(),
      fingerprint: null,
      comments: [],
      processed: true,
    };
    ps.issues.push(issue);
    const epic = makeEpic(ps, {
      title: seed.title,
      specMarkdown: body,
      mode: seed.mode,
      priority: seed.priority,
      areas: seed.areas,
      acceptance: seed.acceptance,
      origin: seed.origin,
      sourceRef: url,
      issueNumber: seed.issue,
      createdBy: seed.author,
    });
    ctx.epics.set(seed.key, epic);
    issue.comments.push({ at: issue.createdAt, body: `Accepted as ${epic.id} · open in Studio: https://studio.factory.dev/p/${ps.project.id}/mission?epic=${epic.id}` });
    ps.intake.push({
      id: nextId(ps, 'intake'),
      issueRef: url,
      issueNumber: seed.issue,
      issueTitle: seed.title,
      origin: seed.origin,
      outcome: 'accepted',
      code: null,
      errors: [],
      epicId: epic.id,
      canonicalEpicId: null,
      createdAt: issue.createdAt,
    });
    recordAudit(ps, SYSTEM_ACTOR, 'intake.accepted', { issueNumber: seed.issue, epicId: epic.id });
    recordAudit(ps, SYSTEM_ACTOR, 'epic.created', { epicId: epic.id, issueNumber: seed.issue, origin: seed.origin });
  });

  if (seed.state === 'intake') return;

  // Contracts are written first (stage 1), then the Epic is decomposed (stage 2).
  const contractsAt = seed.state === 'stage-2' ? created + 2.2 * MIN : created + 4 * MIN;
  tl.at(contractsAt, () => {
    const epic = ctx.epics.get(seed.key)!;
    const parsed = specDsl(epic);
    const drafts = contractsFor(parsed);
    const made: Contract[] = drafts.map((d) => ({
      id: nextId(ps, 'contract'),
      epicId: epic.id,
      kind: d.kind,
      path: d.path,
      content: d.content,
      hash: d.hash,
      locked: true,
      unlockedBy: null,
      unlockedAt: null,
      unlockReason: null,
    }));
    ps.contracts.push(...made);
    ctx.contracts.set(seed.key, made);
    const meta = ps.epicMeta.get(epic.id)!;
    meta.stage1StartedAt = new Date(created + 0.7 * MIN).toISOString();
    meta.contractsAt = new Date(contractsAt).toISOString();
    if (seed.state !== 'stage-2') meta.decomposedAt = new Date(contractsAt + 2 * MIN).toISOString();
    if (seed.state === 'stage-2') epic.status = 'stage-2';
    recordAudit(ps, SYSTEM_ACTOR, 'epic.contracts_authored', { epicId: epic.id, contracts: made.length });
    recordSpendEntry(ps, { usdMicros: usd(1.1 + (hashOf(seed.title) % 8) / 10), source: 'intake', epicId: epic.id, workpackId: null, agentId: 'architect-prime', at: new Date(contractsAt).toISOString() });
  });
}

function specDsl(epic: Epic) {
  return {
    title: epic.title,
    mode: epic.mode,
    priority: priorityCode(epic.priority),
    areas: epic.areas,
    acceptance: epic.acceptance,
  };
}

/** Intake outcomes that did not become Epics: a duplicate delivery, an invalid spec, and a language the factory does not support. */
function seedOtherIntake(ctx: Ctx): void {
  const { ps, tl } = ctx;
  const repo = ps.repository?.fullName ?? ps.project.repo;
  const make = (number: number, title: string, origin: IssueRecord['origin'], author: string, minutesAgo: number, labels: string[], comment: string, outcome: 'duplicate' | 'rejected', code: string | null, errors: { path: string; message: string; code: string }[], canonicalKey?: string) => {
    tl.at(ctx.at(minutesAgo), () => {
      const createdAt = new Date(ctx.at(minutesAgo)).toISOString();
      const url = `https://github.com/${repo}/issues/${number}`;
      const canonical = canonicalKey ? ctx.epics.get(canonicalKey) : undefined;
      const existing = ps.issues.find((i) => i.number === number);
      if (existing) existing.comments.push({ at: createdAt, body: comment });
      else ps.issues.push({ number, url, title, body: '', labels, origin, author, createdAt, fingerprint: null, comments: [{ at: createdAt, body: comment }], processed: true });
      ps.intake.push({ id: nextId(ps, 'intake'), issueRef: url, issueNumber: number, issueTitle: title, origin, outcome, code, errors, epicId: null, canonicalEpicId: canonical?.id ?? null, createdAt });
      recordAudit(ps, SYSTEM_ACTOR, `intake.${outcome}`, { issueNumber: number, ...(canonical ? { canonicalEpicId: canonical.id } : {}), ...(code ? { code } : {}) });
    });
  };
  make(37, 'Port the CLI to Python', 'github-ui', 'octocat', 40 * 60, ['factory', 'factory:rejected'], 'Rejected: language — Only TypeScript is supported in v1. Set language: typescript or remove the field.', 'rejected', 'unsupported_language', [{ path: 'language', message: 'Only TypeScript is supported in v1. Set language: typescript or remove the field.', code: 'unsupported_language' }]);
  make(42, 'Add a dark mode toggle', 'github-ui', 'mona-lisa', 26 * 60, ['factory', 'factory:rejected'], 'Rejected: acceptance — Add at least one acceptance criterion.', 'rejected', 'validation_failed', [{ path: 'acceptance', message: 'Add at least one acceptance criterion', code: 'too_small' }]);
  make(38, 'Task Matrix: keyboard Move menu and drawer accessibility', 'github-ui', 'Jonas Weber', 2.3 * 60, ['factory', 'factory:accepted'], 'Already tracked as the Epic above. No second Epic was created.', 'duplicate', null, [], 'matrix-a11y');
}

// ---------------------------------------------------------------------------
// Workpacks
// ---------------------------------------------------------------------------

function create(ctx: Ctx, spec: WpSeed): Workpack {
  const epic = ctx.epics.get(spec.epic)!;
  const wp = createWorkpack(
    ctx.ps,
    {
      epicId: epic.id,
      title: spec.title,
      description: `${spec.title}. Acceptance: ${epic.acceptance[0]}.`,
      priority: spec.priority,
      category: spec.category,
      targetFiles: spec.files,
      dependsOn: (spec.dependsOn ?? []).map((k) => ctx.wps.get(k)!.id),
    },
    SYSTEM_ACTOR,
  );
  ctx.wps.set(spec.key, wp);
  const shared = ctx.contracts.get(spec.epic) ?? [];
  const isTest = spec.files.every((f) => /(^|\/)tests?\//.test(f) || /\.(test|spec)\./.test(f));
  ctx.ps.attached.set(wp.id, shared.filter((c) => c.kind === 'ts-types' || c.kind === 'invariant' || (isTest && c.kind === 'playwright')).map((c) => c.id));
  if (spec.forkOf) {
    const original = ctx.wps.get(spec.forkOf)!;
    wp.forkOf = original.id;
    wp.branch = `${original.branch}-fork-1`;
    wp.invariants = [...original.invariants];
  }
  return wp;
}

const OUTCOMES: Record<NonNullable<WpSeed['gates']>, Partial<GatePlan>> = {
  clean: {},
  warn: { 'perf.budgets': 'failed', 'a11y.scan': 'failed' },
  quarantine: { 'tests.e2e_viewports': 'quarantined', 'perf.budgets': 'failed', 'a11y.scan': 'failed' },
  'failed-unit': { 'tests.unit_integration': 'failed' },
};

/** Fill in totals that a finished workpack should show: tokens, runs, lines and the commit. */
function settle(spec: WpSeed, wp: Workpack, runs: Run[], cost: number): void {
  const micros = usd(cost);
  const tokens = Math.round(micros / MICROS_PER_TOKEN);
  const h = hashOf(spec.key);
  wp.tokensConsumed = tokens;
  wp.linesAdded = 28 + (h % 240);
  wp.linesRemoved = h % 47;
  wp.filesCount = spec.files.length;
  wp.commitSha = longHash(`${wp.id}|${wp.attempt}`).slice(0, 40);
  runs.forEach((run, i) => {
    run.tokens = Math.round((tokens * (run.stage === 3 ? 0.9 : 0.1)) / Math.max(1, runs.filter((r) => r.stage === run.stage).length));
    run.costUsdMicros = run.tokens * MICROS_PER_TOKEN;
    run.turn = run.stage === 3 ? 9 + ((h + i) % 5) : 1;
  });
}

/** Three spend entries across a workpack's synthesis, so the burn chart and attribution have texture. */
function spendFor(ctx: Ctx, wp: () => Workpack, from: number, to: number, cost: number): void {
  const parts = [0.45, 0.35, 0.2];
  parts.forEach((share, i) => {
    const at = from + ((to - from) * (i + 1)) / (parts.length + 1);
    ctx.tl.at(at, () => {
      const w = wp();
      recordSpendEntry(ctx.ps, { usdMicros: usd(cost * share), source: 'workpack', epicId: w.epicId, workpackId: w.id, agentId: 'codecraft', at: new Date(at).toISOString() });
    });
  });
}

/** One failed attempt: synthesis, then a gate run with failures. Returns the runs it made. */
function attemptThatFails(ctx: Ctx, wp: () => Workpack, at: number, outcomes: Partial<GatePlan>, push: (runs: Run[]) => void): void {
  const { ps, tl } = ctx;
  let build: Run;
  tl.at(at, () => {
    build = startRun(ps, wp(), 3);
  });
  tl.at(at + 12 * MIN, () => {
    endRun(ps, build, 'succeeded');
    transition(ps, wp(), 'verification', { actor: 'orchestrator', force: true });
    const verify = startRun(ps, wp(), 4);
    recordGateResults(ps, wp(), verify, outcomes);
    endRun(ps, verify, 'failed');
    push([build, verify]);
  });
}

function seedMerged(ctx: Ctx, spec: WpSeed): void {
  const { ps, tl } = ctx;
  const created = ctx.at(spec.ageMin);
  const end = created + (spec.cycleMin ?? 120) * MIN;
  const cost = spec.costUsd ?? 3;
  const attempt = spec.attempt ?? 1;
  const runs: Run[] = [];
  let wp!: Workpack;

  tl.at(created, () => {
    wp = create(ctx, spec);
  });
  tl.at(created + 2 * MIN, () => transition(ps, wp, 'planning', { actor: 'orchestrator', force: true }));
  tl.at(created + 4 * MIN, () => transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true }));

  let from = created + 4 * MIN;
  if (attempt > 1) {
    attemptThatFails(ctx, () => wp, from, { 'tests.unit_integration': 'failed' }, (r) => runs.push(...r));
    tl.at(from + 13 * MIN, () => {
      wp.attempt = 2;
      transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true });
    });
    from += 14 * MIN;
  }
  let build: Run;
  tl.at(from, () => {
    build = startRun(ps, wp, 3);
  });
  tl.at(end - 5 * MIN, () => {
    endRun(ps, build, 'succeeded');
    transition(ps, wp, 'verification', { actor: 'orchestrator', force: true });
  });
  tl.at(end - 1 * MIN, () => {
    const verify = startRun(ps, wp, 4);
    if (spec.withGates) recordGateResults(ps, wp, verify, {});
    else wp.gateSummary = { total: 10, passed: 10, failed: 0, running: 0 };
    endRun(ps, verify, 'succeeded');
    runs.push(build, verify);
  });
  tl.at(end, () => {
    assignPr(ps, wp);
    mergeWorkpack(ps, wp, 'orchestrator');
    wp.attempt = attempt;
    wp.humanIntervened = spec.human ?? false;
    wp.phaseName = null;
    settle(spec, wp, runs, cost);
  });
  spendFor(ctx, () => wp, created + 4 * MIN, end - 5 * MIN, cost);
}

/** A workpack that passed every gate and now waits for a person. The run happened just before `endedMin`; the wait before it was queue time. */
function seedAwaitingReview(ctx: Ctx, spec: WpSeed): void {
  const { ps, tl } = ctx;
  const created = ctx.at(spec.ageMin);
  const end = ctx.at(spec.endedMin ?? 30);
  const cost = spec.costUsd ?? 3;
  const runs: Run[] = [];
  let wp!: Workpack;
  let build: Run;

  tl.at(created, () => {
    wp = create(ctx, spec);
  });
  tl.at(end - 25 * MIN, () => transition(ps, wp, 'planning', { actor: 'orchestrator', force: true }));
  tl.at(end - 23 * MIN, () => {
    transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true });
    build = startRun(ps, wp, 3);
  });
  tl.at(end - 4 * MIN, () => {
    endRun(ps, build, 'succeeded');
    transition(ps, wp, 'verification', { actor: 'orchestrator', force: true });
  });
  tl.at(end - 1 * MIN, () => {
    const verify = startRun(ps, wp, 4);
    recordGateResults(ps, wp, verify, OUTCOMES[spec.gates ?? 'clean']);
    endRun(ps, verify, 'succeeded');
    runs.push(build, verify);
  });
  tl.at(end, () => {
    assignPr(ps, wp);
    transition(ps, wp, 'awaiting-review', { actor: 'orchestrator', force: true });
    wp.phaseName = 'Awaiting human review';
    settle(spec, wp, runs, cost);
  });
  spendFor(ctx, () => wp, end - 23 * MIN, end - 4 * MIN, cost);
}

/** A workpack that ran out of attempts, or was cancelled, at some point in the past. Attempts are timed back from the end. */
function seedEnded(ctx: Ctx, spec: WpSeed): void {
  const { ps, tl } = ctx;
  const created = ctx.at(spec.ageMin);
  const end = ctx.at(spec.endedMin ?? 10);
  const runs: Run[] = [];
  let wp!: Workpack;

  tl.at(created, () => {
    wp = create(ctx, spec);
  });

  if (spec.state === 'failed') {
    const attempts = spec.attempt ?? 3;
    const cost = spec.costUsd ?? 4;
    const outcomes = [OUTCOMES['failed-unit'], { 'static.types_lint': 'failed' as const }, OUTCOMES['failed-unit']];
    const first = end - attempts * 27 * MIN;
    tl.at(first - 3 * MIN, () => transition(ps, wp, 'planning', { actor: 'orchestrator', force: true }));
    tl.at(first - 0.5 * MIN, () => transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true }));
    for (let k = 0; k < attempts; k++) {
      const start = first + k * 27 * MIN;
      attemptThatFails(ctx, () => wp, start, outcomes[k % outcomes.length]!, (r) => runs.push(...r));
      if (k < attempts - 1) {
        tl.at(start + 13 * MIN, () => {
          wp.attempt += 1;
          transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true });
        });
      }
    }
    tl.at(end, () => {
      wp.attempt = attempts;
      assignPr(ps, wp);
      transition(ps, wp, 'failed', { actor: 'orchestrator', failureReason: `Blocking gates failed after ${attempts} attempts: Unit & integration tests.` });
      wp.phaseName = null;
      settle(spec, wp, runs, cost);
    });
    spendFor(ctx, () => wp, first, end, cost);
  } else {
    let run: Run;
    tl.at(end - 6 * MIN, () => transition(ps, wp, 'planning', { actor: 'orchestrator', force: true }));
    tl.at(end - 4 * MIN, () => {
      transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true });
      run = startRun(ps, wp, 3);
    });
    tl.at(end, () => {
      cancelWorkpack(ps, wp, jonas);
      wp.phaseName = null;
      runs.push(run);
      settle(spec, wp, runs, 1.2);
    });
    spendFor(ctx, () => wp, end - 4 * MIN, end, 1.2);
  }
  // Ended long enough ago to have left the Recently ended tray already.
  if (ctx.now - end >= 5 * MIN) tl.at(end + 5 * MIN, () => archiveWorkpack(ps, wp, SYSTEM_ACTOR));
}

/** The running workpacks, in a fixed order so each one's turns are staggered from the others'. */
const RUNNING_ORDER = ['drawer-live', 'composer', 'pills', 'replay', 'lightbox', 'verify', 'move-menu'];

/**
 * When an in-flight run's turns happened. The last turn lands just before now (or a few seconds before for
 * verification, so its gates are mid-run when the page loads). Shared with the steering examples.
 */
function runTiming(ctx: Ctx, spec: WpSeed) {
  const index = Math.max(0, RUNNING_ORDER.indexOf(spec.key));
  const retry = (spec.attempt ?? 1) > 1;
  const baseProgress = retry ? 55 : 0;
  const total = retry ? 6 : 10 + (hashOf(spec.key) % 4);
  const done = spec.state === 'verification' ? total : Math.max(1, Math.round((((spec.progress ?? 30) - baseProgress) / (100 - baseProgress)) * total));
  const lastTurnAt = spec.state === 'verification' ? ctx.now - 7_000 : ctx.now - 2_500 - index * 400;
  const firstTurnAt = lastTurnAt - (done - 1) * TURN_MS;
  return { retry, baseProgress, total, done, lastTurnAt, firstTurnAt, startAt: firstTurnAt - 3_000, turn: (k: number) => firstTurnAt + (k - 1) * TURN_MS };
}

/** Replay the turns an in-flight run has already taken, through the real run loop. */
function seedRunning(ctx: Ctx, spec: WpSeed): void {
  const { ps, tl } = ctx;
  const created = ctx.at(spec.ageMin);
  const t = runTiming(ctx, spec);
  let wp!: Workpack;
  let run!: Run;

  tl.at(created, () => {
    wp = create(ctx, spec);
  });

  if (t.retry) {
    // The first attempt built fine and then failed its unit tests, a while ago.
    const first = t.startAt - 45 * MIN;
    tl.at(first - 3 * MIN, () => transition(ps, wp, 'planning', { actor: 'orchestrator', force: true }));
    tl.at(first - 0.5 * MIN, () => transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true }));
    attemptThatFails(ctx, () => wp, first, { 'tests.unit_integration': 'failed' }, () => {});
    tl.at(first + 13 * MIN, () => {
      wp.attempt = 2;
    });
    tl.at(t.startAt - 500, () => {
      transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true });
      wp.completeness = t.baseProgress;
    });
  } else {
    tl.at(t.startAt - 3 * MIN, () => transition(ps, wp, 'planning', { actor: 'orchestrator', force: true }));
    tl.at(t.startAt - 500, () => transition(ps, wp, 'in-progress', { actor: 'orchestrator', force: true }));
  }

  tl.at(t.startAt, () => {
    run = startRun(ps, wp, 3);
    wp.phaseName = 'Synthesizing';
    beginRunScratch(ps, wp, run, { progress: t.baseProgress, turnsTotal: t.total });
  });
  for (let k = 1; k <= t.done; k++) {
    tl.at(t.turn(k), () => {
      const scratch = ps.scratch.get(run.id);
      if (scratch) runTurn(ps, wp, run, scratch);
    });
  }

  if (spec.state === 'verification') return;
  ctx.running.push({ runId: '' });
  const slot = ctx.running.length - 1;
  tl.at(ctx.now - 1, () => {
    ctx.running[slot]!.runId = run.id;
    if (spec.paused) pauseWorkpack(ps, wp, mira);
  });
}

function seedPlanning(ctx: Ctx, spec: WpSeed): void {
  const { ps, tl } = ctx;
  let wp!: Workpack;
  tl.at(ctx.at(spec.ageMin), () => {
    wp = create(ctx, spec);
  });
  tl.at(ctx.now - 3_000, () => {
    transition(ps, wp, 'planning', { actor: 'orchestrator', force: true });
    scheduleSynthesisStart(ps, wp, 22_000);
  });
}

function seedQueued(ctx: Ctx, spec: WpSeed): void {
  let wp!: Workpack;
  ctx.tl.at(ctx.at(spec.ageMin), () => {
    wp = create(ctx, spec);
  });
  if (spec.paused) ctx.tl.at(ctx.at(spec.ageMin) + 10 * MIN, () => pauseWorkpack(ctx.ps, wp, mira));
}

// ---------------------------------------------------------------------------
// Steering, human locks, and other texture on the live run
// ---------------------------------------------------------------------------

function seedSteering(ctx: Ctx): void {
  const { ps, tl, now } = ctx;
  const t = runTiming(ctx, WORKPACKS.find((w) => w.key === 'composer')!);
  const live = () => ps.runs.filter((r) => r.workpackId === ctx.wps.get('composer')!.id && r.stage === 3).at(-1)!.id;
  let rejected = '';

  // Between the first and second turn: a viewer suggests, an engineer approves. It is delivered at turn 2 and usually acknowledged at turn 3.
  tl.at(t.turn(1) + 1_000, () => suggest(ps, live(), 'Keep the composer under 1,000 characters', priya));
  tl.at(t.turn(1) + 4_000, () => {
    const s = ps.suggestions.find((x) => x.status === 'pending' && x.runId === live());
    if (s) approveSuggestion(ps, s.id, undefined, jonas);
  });
  // Between the second and third: one suggestion is turned down, a person starts editing a file the agent has not reached yet,
  // and a maintainer posts a constraint that every later run will inherit.
  tl.at(t.turn(2) + 1_000, () => {
    rejected = suggest(ps, live(), 'Rename the helper to useSteerHint', priya).id;
  });
  tl.at(t.turn(2) + 3_000, () => {
    const wp = ctx.wps.get('composer')!;
    const path = 'src/pages/mission-control/hooks/useSteer.ts';
    acquireLock(ps, wp, path, jonas);
    humanSave(ps, wp, path, '// useSteer: draft by Jonas\nexport function useSteer() {\n  return { steer: async (text: string) => text };\n}\n', jonas);
  });
  tl.at(t.turn(2) + 4_000, () => {
    if (rejected) rejectSuggestion(ps, rejected, 'The hook name is fixed by the spec', jonas);
  });
  tl.at(t.turn(2) + 6_000, () => inject(ps, live(), 'Never log the text of a steering hint', 'constraint', mira));
  // Still open when the page loads: a suggestion waiting for a decision, and a hint that will be delivered at the next turn.
  tl.at(now - 12_000, () => suggest(ps, live(), 'Show the next-turn countdown in the composer', priya));
  tl.at(now - 1_000, () => inject(ps, live(), 'Keep Inject disabled while offline', 'hint', mira));
}

// ---------------------------------------------------------------------------
// Finishing: DAGs, queue reasons, history that is not workpack-shaped
// ---------------------------------------------------------------------------

function finalizeDag(ctx: Ctx, epicKey: string): void {
  const { ps } = ctx;
  const epic = ctx.epics.get(epicKey);
  const specs = WORKPACKS.filter((w) => w.epic === epicKey && ctx.wps.has(w.key));
  if (!epic || specs.length === 0) return;
  const nodeId = new Map(specs.map((s, i) => [s.key, `n${i + 1}`]));
  const nodes: DagNode[] = specs.map((s) => {
    const complexity = (['Low', 'Medium', 'High'] as const)[hashOf(s.key) % 3]!;
    const [base, spread] = TOKENS[complexity];
    return {
      id: nodeId.get(s.key)!,
      title: s.title,
      targetFiles: s.files,
      dependsOn: (s.dependsOn ?? []).map((k) => nodeId.get(k)).filter((id): id is string => !!id),
      complexity,
      estimatedTokens: base + (hashOf(`${s.key}t`) % spread),
      stage: s.files.every((f) => /(^|\/)tests?\//.test(f) || /\.(test|spec)\./.test(f)) ? 'verification' : 'synthesis',
      overlapsWith: [],
      queuesBehind: [],
      workpackId: ctx.wps.get(s.key)!.id,
    };
  });
  ps.dags.set(epic.id, withOverlaps(nodes, { activeLocks: [], remainingBudgetUsdMicros: 0 }));
  epic.workpackIds = specs.map((s) => ctx.wps.get(s.key)!.id);
}

function seedStandaloneHistory(ctx: Ctx): void {
  const { ps, tl } = ctx;
  const spend = (daysAgo: number, dollars: number, source: 'eval' | 'benchmark' | 'preview', agentId: string | null) => {
    const at = ctx.now - daysAgo * DAY;
    tl.at(at, () => recordSpendEntry(ps, { usdMicros: usd(dollars), source, epicId: null, workpackId: null, agentId, at: new Date(at).toISOString() }));
  };
  const evals = [
    { daysAgo: 9, dollars: 7.4, agent: 'codecraft' },
    { daysAgo: 6, dollars: 8.1, agent: 'gatekeeper' },
    { daysAgo: 3, dollars: 6.6, agent: 'codecraft' },
    { daysAgo: 2, dollars: 8.8, agent: 'architect-prime' },
    { daysAgo: 0.8, dollars: 7.2, agent: 'codecraft' },
  ];
  for (const e of evals) spend(e.daysAgo, e.dollars, 'eval', e.agent);
  spend(12, 22.4, 'benchmark', null);
  spend(5, 21.7, 'benchmark', null);
  const previews = [
    { daysAgo: 11, dollars: 0.21 },
    { daysAgo: 8, dollars: 0.18 },
    { daysAgo: 6, dollars: 0.32 },
    { daysAgo: 4, dollars: 0.27 },
    { daysAgo: 3, dollars: 0.19 },
    { daysAgo: 1.5, dollars: 0.24 },
    { daysAgo: 0.4, dollars: 0.29 },
  ];
  for (const p of previews) spend(p.daysAgo, p.dollars, 'preview', 'architect-prime');

  // Configuration changes people made along the way.
  const changes: { daysAgo: number; who: typeof austin; action: string; target: Record<string, unknown> }[] = [
    { daysAgo: 21.1, who: austin, action: 'project.connected', target: { repo: ps.project.repo } },
    { daysAgo: 19.9, who: austin, action: 'integration.updated', target: { integrationId: 'github', enabled: true } },
    { daysAgo: 12, who: austin, action: 'policy.updated', target: { changed: ['humanSignoffP0P1Schema'], humanSignoffP0P1Schema: { from: false, to: true } } },
    { daysAgo: 9, who: mira, action: 'vault.key_written', target: { name: 'PLAYWRIGHT_TEST_TOKEN', allowedGates: ['tests.e2e_viewports'] } },
    { daysAgo: 6, who: austin, action: 'token.rotated', target: {} },
    { daysAgo: 2, who: mira, action: 'agent.version_activated', target: { agentId: 'codecraft', version: 4 } },
    { daysAgo: 1.25, who: austin, action: 'budget.updated', target: { previousCapUsd: 1000, monthlyCapUsd: 1500, softLimitPercent: 80, resumedRuns: 0 } },
  ];
  for (const c of changes) tl.at(ctx.now - c.daysAgo * DAY, () => recordAudit(ps, c.who, c.action, c.target));

  // Warn-gate findings across the two weeks, so the Overview trend arrows have something to compare.
  const gates = ['perf.budgets', 'a11y.scan', 'i18n.check'] as const;
  for (let i = 0; i < 34; i++) {
    const at = ctx.now - (i * 0.41 + (hashOf(`warn${i}`) % 30) / 100) * DAY;
    ps.warnEvents.push({ gate: gates[i % 3]!, at: new Date(at).toISOString() });
  }
}

/** Seed the dogfood project: the Studio building itself, mid-flight. Run once, on a project with a platform seed. */
export function seedDogfood(ps: ProjectState): void {
  const now = ps.store.clock.fixedMs ?? Date.now() + ps.store.clock.offsetMs;
  const ctx: Ctx = {
    ps,
    tl: new Timeline(ps, now),
    now,
    at: (minutesAgo) => now - minutesAgo * MIN,
    epics: new Map(),
    wps: new Map(),
    contracts: new Map(),
    running: [],
  };
  // The cap must not interfere while history is replayed; the real cap is restored once spend is known.
  const realCap = ps.budget.capUsdMicros;
  ps.budget.capUsdMicros = Number.MAX_SAFE_INTEGER / 4;
  ps.budget.ledger.setCap(Number.MAX_SAFE_INTEGER / 4);

  EPICS.forEach((e) => seedEpic(ctx, e));
  seedOtherIntake(ctx);
  WORKPACKS.forEach((spec) => {
    switch (spec.state) {
      case 'merged':
        return seedMerged(ctx, spec);
      case 'awaiting-review':
        return seedAwaitingReview(ctx, spec);
      case 'failed':
      case 'cancelled':
        return seedEnded(ctx, spec);
      case 'verification':
      case 'in-progress':
        return seedRunning(ctx, spec);
      case 'planning':
        return seedPlanning(ctx, spec);
      case 'queued':
        return seedQueued(ctx, spec);
    }
  });
  seedSteering(ctx);
  seedStandaloneHistory(ctx);
  ctx.tl.run();

  // Stagger the next turns of the runs that are mid-flight so they do not all land on the same tick.
  ctx.running.forEach((r, i) => {
    const scratch = ps.scratch.get(r.runId);
    if (scratch) scratch.nextTurnAtMs = now + 1_200 + i * 1_300;
  });
  for (const e of EPICS) finalizeDag(ctx, e.key);
  bumpCounter(ps, 'issue', 60);

  // Epics that are mid-pipeline pick up where they left off.
  for (const e of EPICS) {
    const epic = ctx.epics.get(e.key);
    if (epic && (epic.status === 'stage-2' || epic.status === 'intake')) resumePipeline(ps, epic.id, e.state === 'stage-2' ? 20_000 : undefined);
  }
  ps.budget.capUsdMicros = realCap;
  ps.budget.ledger.setCap(realCap);
  refreshQueue(ps);
}
