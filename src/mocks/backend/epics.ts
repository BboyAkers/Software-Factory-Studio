import type {
  Contract,
  DagNode,
  DispatchResponse,
  Epic,
  EpicDetail,
  EpicDsl,
  EpicStatus,
  FieldError,
  IntakeEvent,
  PipelineStage,
  PipelineStages,
  PipelineStatus,
  PreviewResponse,
  Priority,
  Workpack,
} from '../../contracts';
import { parseEpicDsl, priorityLabel, toIssueBody, type ParsedDsl } from '../../domain/dsl';
import { duration } from '../../domain/format';
import { CAPACITY } from '../../domain/queue';
import { isTerminal } from '../../domain/workpackMachine';
import { ApiProblem } from '../http';
import { hash32 } from './codegen';
import { buildPlan, type Plan, type PlanContext } from './plan';
import { chargeSpend, emit, isHardCapHit, newestFirst, nextId, nextIssueNumber, nowIso, nowMs, pace, recordAudit, schedule, setAgentStatus } from './runtime';
import type { Actor, EpicMeta, IssueRecord, ProjectState } from './store';
import { SYSTEM_ACTOR } from './store';
import { createWorkpack, epicById, integrationEnabled, stageOf } from './workpacks';

const HOUR_MS = 3_600_000;
/** Accepted Epics per project per hour (spec §13.2 step 6): bounds runaway spend from a webhook loop. */
export const INTAKE_LIMIT_PER_HOUR = 30;
const PREVIEW_LIMIT = 6;
const PREVIEW_WINDOW_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Small lookups
// ---------------------------------------------------------------------------

export const intakeLabel = (ps: ProjectState): string => ps.repository?.intakeLabel ?? 'factory';
const repoName = (ps: ProjectState): string => ps.repository?.fullName ?? ps.project.repo;
const issueUrl = (ps: ProjectState, number: number): string => `https://github.com/${repoName(ps)}/issues/${number}`;
const studioUrl = (ps: ProjectState, path: string): string => `https://studio.factory.dev/p/${ps.project.id}/${path}`;
const isClosed = (epic: Epic): boolean => epic.status === 'completed' || epic.status === 'failed' || epic.status === 'cancelled';

function planContext(ps: ProjectState): PlanContext {
  return {
    activeLocks: ps.workpacks
      .filter((w) => w.status === 'planning' || w.status === 'in-progress' || w.status === 'verification')
      .map((w) => ({ id: w.id, targetFiles: w.targetFiles })),
    remainingBudgetUsdMicros: ps.budget.capUsdMicros - ps.budget.ledger.committed,
  };
}

function failDsl(parsed: Extract<ParsedDsl, { ok: false }>): never {
  throw new ApiProblem(
    422,
    parsed.code,
    parsed.code === 'unsupported_language' ? 'Only TypeScript is supported in v1.' : 'The spec has validation errors.',
    { errors: parsed.errors },
  );
}

function budgetBlocked(what: string): ApiProblem {
  return new ApiProblem(409, 'budget_blocked', `The budget hard cap is reached, so ${what} is paused. An Admin can raise the cap.`);
}

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

export interface EpicInit {
  id?: string;
  title: string;
  specMarkdown: string;
  mode: Epic['mode'];
  priority: Priority;
  areas: string[];
  acceptance: string[];
  origin: Epic['origin'];
  sourceRef: string;
  issueNumber: number;
  budgetCapNote?: string | null;
  createdBy: string;
  createdAt?: string;
  status?: EpicStatus;
}

/** Construct an Epic and register it. Announces nothing: seeds use this directly. */
export function makeEpic(ps: ProjectState, init: EpicInit): Epic {
  const epic: Epic = {
    id: init.id ?? nextId(ps, 'epic'),
    projectId: ps.project.id,
    source: init.origin === 'sentry' ? 'sentry-via-github' : 'github',
    origin: init.origin,
    sourceRef: init.sourceRef,
    issueNumber: init.issueNumber,
    title: init.title,
    specMarkdown: init.specMarkdown,
    mode: init.mode,
    priority: init.priority,
    areas: init.areas,
    acceptance: init.acceptance,
    status: init.status ?? 'intake',
    paused: false,
    workpackIds: [],
    spendUsdMicros: 0,
    budgetCapNote: init.budgetCapNote ?? null,
    createdBy: init.createdBy,
    createdAt: init.createdAt ?? nowIso(ps.store),
    completedAt: null,
  };
  ps.epics.push(epic);
  ps.epicMeta.set(epic.id, { stage1StartedAt: null, contractsAt: null, decomposedAt: null });
  return epic;
}

export function epicMetaOf(ps: ProjectState, epicId: string): EpicMeta {
  let meta = ps.epicMeta.get(epicId);
  if (!meta) {
    meta = { stage1StartedAt: null, contractsAt: null, decomposedAt: null };
    ps.epicMeta.set(epicId, meta);
  }
  return meta;
}

export function epicList(ps: ProjectState, filters: { status?: string | null; q?: string | null }): Epic[] {
  const q = filters.q?.trim().toLowerCase();
  return [...ps.epics]
    .filter((e) => !filters.status || filters.status === 'all' || e.status === filters.status)
    .filter((e) => !q || `${e.id} ${e.title} ${e.areas.join(' ')}`.toLowerCase().includes(q))
    .sort(newestFirst);
}

export function epicDetail(ps: ProjectState, id: string): EpicDetail {
  const epic = epicById(ps, id);
  return { ...epic, dag: ps.dags.get(id) ?? [], contracts: ps.contracts.filter((c) => c.epicId === id) };
}

function setEpicStatus(ps: ProjectState, epic: Epic, status: EpicStatus): void {
  if (epic.status === status) return;
  epic.status = status;
  emit(ps, { type: 'epic.updated', epicId: epic.id, status, stage: stageOf(ps, epic), paused: epic.paused });
}

// ---------------------------------------------------------------------------
// Preview (dry run: contracts, DAG, estimate; spends a little, executes nothing)
// ---------------------------------------------------------------------------

const previewHits = new WeakMap<ProjectState, Map<string, number[]>>();

function takePreviewSlot(ps: ProjectState, userId: string): void {
  const all = previewHits.get(ps) ?? new Map<string, number[]>();
  previewHits.set(ps, all);
  const now = nowMs(ps.store);
  const recent = (all.get(userId) ?? []).filter((t) => now - t < PREVIEW_WINDOW_MS);
  if (recent.length >= PREVIEW_LIMIT) {
    all.set(userId, recent);
    const retryIn = Math.ceil((PREVIEW_WINDOW_MS - (now - recent[0]!)) / 1000);
    throw new ApiProblem(429, 'rate_limited', `Previews are limited to ${PREVIEW_LIMIT} per minute.`, { detail: `Try again in ${retryIn}s.` });
  }
  recent.push(now);
  all.set(userId, recent);
}

export async function previewEpic(ps: ProjectState, specMarkdown: string, actor: Actor): Promise<PreviewResponse> {
  const parsed = parseEpicDsl(specMarkdown);
  if (!parsed.ok) failDsl(parsed);
  if (isHardCapHit(ps)) throw budgetBlocked('previews');
  takePreviewSlot(ps, actor.id);

  const plan = buildPlan(parsed.dsl, planContext(ps));
  if (ps.store.tuning.previewMs > 0) await sleep(ps.store.tuning.previewMs);

  const cost = 150_000 + (hash32(parsed.dsl.title) % 200_000);
  if (!chargeSpend(ps, { usdMicros: cost, source: 'preview', epicId: null, workpackId: null, agentId: 'architect-prime' })) {
    throw budgetBlocked('previews');
  }
  recordAudit(ps, actor, 'epic.previewed', { title: plan.title });

  return {
    title: plan.title,
    contracts: plan.contracts.map((c, i) => ({ id: `preview-${i + 1}`, kind: c.kind, path: c.path, content: c.content, hash: c.hash })),
    dag: plan.dag,
    estimate: plan.estimate,
  };
}

// ---------------------------------------------------------------------------
// GitHub issues and intake (spec §13.2)
// ---------------------------------------------------------------------------

export interface IssueInput {
  title: string;
  body: string;
  origin: IssueRecord['origin'];
  author: string;
  labels?: string[];
  fingerprint?: string | null;
}

/** Create a (simulated) GitHub issue. Intake only happens once a webhook for it is scheduled. */
export function fileIssue(ps: ProjectState, input: IssueInput): IssueRecord {
  const number = nextIssueNumber(ps);
  const issue: IssueRecord = {
    number,
    url: issueUrl(ps, number),
    title: input.title,
    body: input.body,
    labels: input.labels ?? [intakeLabel(ps)],
    origin: input.origin,
    author: input.author,
    createdAt: nowIso(ps.store),
    fingerprint: input.fingerprint ?? null,
    comments: [],
    processed: false,
  };
  ps.issues.push(issue);
  return issue;
}

/** The `issues` webhook arrives shortly after the issue is filed. */
export function scheduleIntake(ps: ProjectState, issueNumber: number, delayMs = 1200): void {
  schedule(ps, pace(ps.store, delayMs), `intake issue #${issueNumber}`, () => {
    evaluateIssue(ps, issueNumber);
  });
}

type Outcome = Exclude<IntakeEvent['outcome'], 'forming'>;

function recordOutcome(
  ps: ProjectState,
  issue: IssueRecord,
  result: { outcome: Outcome; code: string | null; errors: FieldError[]; epicId: string | null; canonicalEpicId: string | null },
): IntakeEvent {
  let event = ps.intake.find((e) => e.issueNumber === issue.number && e.outcome === 'forming');
  if (event) {
    Object.assign(event, result);
  } else {
    event = {
      id: nextId(ps, 'intake'),
      issueRef: issue.url,
      issueNumber: issue.number,
      issueTitle: issue.title,
      origin: issue.origin,
      ...result,
      createdAt: nowIso(ps.store),
    };
    ps.intake.push(event);
  }
  issue.processed = true;
  recordAudit(ps, SYSTEM_ACTOR, `intake.${result.outcome}`, {
    issueNumber: issue.number,
    ...(result.epicId ? { epicId: result.epicId } : {}),
    ...(result.canonicalEpicId ? { canonicalEpicId: result.canonicalEpicId } : {}),
    ...(result.code ? { code: result.code } : {}),
  });
  emit(ps, {
    type: 'intake.processed',
    intakeId: event.id,
    outcome: result.outcome,
    issueRef: issue.url,
    ...(result.epicId ? { epicId: result.epicId } : {}),
    ...(result.canonicalEpicId ? { canonicalEpicId: result.canonicalEpicId } : {}),
  });
  return event;
}

function reply(ps: ProjectState, issue: IssueRecord, body: string, label: string): void {
  issue.comments.push({ at: nowIso(ps.store), body });
  issue.labels = [...issue.labels.filter((l) => !l.startsWith('factory:')), label];
}

function finishDuplicate(ps: ProjectState, issue: IssueRecord, canonical: Epic): IntakeEvent {
  const changed = issue.body.trim() !== canonical.specMarkdown.trim();
  reply(
    ps,
    issue,
    changed && canonical.status !== 'intake'
      ? `This Epic already started as ${canonical.id}, so the edit was ignored. Open a new issue for the change.`
      : `Already tracked as ${canonical.id}. No second Epic was created. Open in Studio: ${studioUrl(ps, `mission?epic=${canonical.id}`)}`,
    'factory:duplicate',
  );
  return recordOutcome(ps, issue, { outcome: 'duplicate', code: null, errors: [], epicId: null, canonicalEpicId: canonical.id });
}

function finishRejected(ps: ProjectState, issue: IssueRecord, code: string, errors: FieldError[]): IntakeEvent {
  const lines = errors.map((e) => `- \`${e.path}\`: ${e.message}`);
  reply(
    ps,
    issue,
    [`Rejected: this issue could not be accepted as an Epic.`, '', ...lines, '', `Fix the frontmatter and relabel, or open it in Spec Studio: ${studioUrl(ps, 'spec')}`].join('\n'),
    'factory:rejected',
  );
  return recordOutcome(ps, issue, { outcome: 'rejected', code, errors, epicId: null, canonicalEpicId: null });
}

function finishAccepted(ps: ProjectState, issue: IssueRecord, dsl: EpicDsl): IntakeEvent {
  const epic = makeEpic(ps, {
    title: dsl.title,
    specMarkdown: issue.body,
    mode: dsl.mode,
    priority: priorityLabel(dsl.priority),
    areas: dsl.areas,
    acceptance: dsl.acceptance,
    origin: issue.origin,
    sourceRef: issue.url,
    issueNumber: issue.number,
    budgetCapNote: dsl.budget_cap_note ?? null,
    createdBy: issue.author,
  });
  const plan = buildPlan(dsl, planContext(ps));
  reply(ps, issue, `Accepted as ${epic.id} · open in Studio: ${studioUrl(ps, `mission?epic=${epic.id}`)}`, 'factory:accepted');
  const event = recordOutcome(ps, issue, { outcome: 'accepted', code: null, errors: [], epicId: epic.id, canonicalEpicId: null });
  recordAudit(ps, SYSTEM_ACTOR, 'epic.created', { epicId: epic.id, issueNumber: issue.number, origin: issue.origin });
  emit(ps, { type: 'epic.updated', epicId: epic.id, status: epic.status, stage: stageOf(ps, epic), paused: false });
  startEpicPipeline(ps, epic.id, plan);
  return event;
}

/**
 * Evaluate one issue the way the intake webhook would. Returns `null` when the issue is not
 * eligible (unlabeled issues are ignored and recorded nowhere) or GitHub is disabled.
 * Calling it again for an issue that already became an Epic is a duplicate delivery.
 */
export function evaluateIssue(ps: ProjectState, issueNumber: number): IntakeEvent | null {
  const issue = ps.issues.find((i) => i.number === issueNumber);
  if (!issue) return null;
  if (!issue.labels.includes(intakeLabel(ps))) {
    issue.processed = true;
    return null;
  }
  if (!integrationEnabled(ps, 'github')) return null;

  const known = ps.epics.find((e) => e.sourceRef === issue.url);
  if (known) return finishDuplicate(ps, issue, known);

  const parsed = parseEpicDsl(issue.body);
  if (!parsed.ok) return finishRejected(ps, issue, parsed.code, parsed.errors);

  if (issue.fingerprint) {
    const twin = ps.epics.find((e) => !isClosed(e) && ps.issues.some((i) => i.fingerprint === issue.fingerprint && i.url === e.sourceRef));
    if (twin) return finishDuplicate(ps, issue, twin);
  }

  const now = nowMs(ps.store);
  if (ps.epics.filter((e) => now - Date.parse(e.createdAt) < HOUR_MS).length >= INTAKE_LIMIT_PER_HOUR) {
    return finishRejected(ps, issue, 'rate_limited', [
      { path: 'issue', message: `More than ${INTAKE_LIMIT_PER_HOUR} Epics were accepted in the last hour. Try again later.`, code: 'rate_limited' },
    ]);
  }
  return finishAccepted(ps, issue, parsed.dsl);
}

export function intakeList(ps: ProjectState, limit: number): IntakeEvent[] {
  return [...ps.intake].sort(newestFirst).slice(0, limit);
}

/** Spec Studio dispatch: validate, file the issue with the `factory` label, and let intake form the Epic. */
export function dispatchEpic(ps: ProjectState, specMarkdown: string, actor: Actor): DispatchResponse {
  const parsed = parseEpicDsl(specMarkdown);
  if (!parsed.ok) failDsl(parsed);
  if (!integrationEnabled(ps, 'github')) {
    throw new ApiProblem(503, 'github_unavailable', 'GitHub is disabled or unreachable, so the issue could not be filed.');
  }
  const issue = fileIssue(ps, { title: parsed.dsl.title, body: toIssueBody(parsed.dsl, parsed.body), origin: 'spec-studio', author: actor.name });
  const event: IntakeEvent = {
    id: nextId(ps, 'intake'),
    issueRef: issue.url,
    issueNumber: issue.number,
    issueTitle: issue.title,
    origin: 'spec-studio',
    outcome: 'forming',
    code: null,
    errors: [],
    epicId: null,
    canonicalEpicId: null,
    createdAt: nowIso(ps.store),
  };
  ps.intake.push(event);
  recordAudit(ps, actor, 'epic.dispatched', { issueNumber: issue.number, title: issue.title });
  scheduleIntake(ps, issue.number);
  return { issue: { number: issue.number, url: issue.url }, intakeId: event.id };
}

// ---------------------------------------------------------------------------
// Epic pipeline: stage 1 (contracts) → stage 2 (decomposition) → executing
// ---------------------------------------------------------------------------

/** Architect-Prime's cost for stages 1–2 (it runs the most expensive model), split 40/60 across them. */
function architectCost(epic: Epic): number {
  return 1_100_000 + (hash32(epic.title) % 700_000);
}

/** An Epic only advances while nothing holds the pipeline back. */
function canAdvance(ps: ProjectState, epic: Epic): boolean {
  return !isHardCapHit(ps) && !ps.pipeline.manualGlobal && !epic.paused && integrationEnabled(ps, 'github');
}

function architectBusy(ps: ProjectState): boolean {
  return ps.epics.some((e) => e.status === 'stage-1' || e.status === 'stage-2');
}

function startEpicPipeline(ps: ProjectState, epicId: string, plan: Plan): void {
  schedule(ps, pace(ps.store, 800), `${epicId} stage 1`, () => beginContracts(ps, epicId, plan));
}

/** Pick an Epic's pipeline up from its current status: seeds and scenario resets use this for Epics that are mid-flight. */
export function resumePipeline(ps: ProjectState, epicId: string, delayMs?: number): void {
  const epic = ps.epics.find((e) => e.id === epicId);
  if (!epic) return;
  const parsed = parseEpicDsl(epic.specMarkdown);
  if (!parsed.ok) return;
  const plan = buildPlan(parsed.dsl, planContext(ps));
  const delay = delayMs ?? pace(ps.store, ps.store.tuning.planningMs);
  if (epic.status === 'intake') startEpicPipeline(ps, epicId, plan);
  else if (epic.status === 'stage-1') schedule(ps, delay, `${epicId} contracts`, () => finishContracts(ps, epicId, plan));
  else if (epic.status === 'stage-2') schedule(ps, delay, `${epicId} decomposition`, () => finishDecomposition(ps, epicId, plan));
}

function retry(ps: ProjectState, label: string, step: () => void): void {
  schedule(ps, pace(ps.store, 4000), label, step);
}

function beginContracts(ps: ProjectState, epicId: string, plan: Plan): void {
  const epic = ps.epics.find((e) => e.id === epicId);
  if (!epic || epic.status !== 'intake') return;
  if (!canAdvance(ps, epic)) return retry(ps, `${epicId} stage 1 (waiting)`, () => beginContracts(ps, epicId, plan));
  epicMetaOf(ps, epicId).stage1StartedAt = nowIso(ps.store);
  setEpicStatus(ps, epic, 'stage-1');
  setAgentStatus(ps, 'architect-prime', 'working');
  schedule(ps, pace(ps.store, ps.store.tuning.planningMs), `${epicId} contracts`, () => finishContracts(ps, epicId, plan));
}

function finishContracts(ps: ProjectState, epicId: string, plan: Plan): void {
  const epic = ps.epics.find((e) => e.id === epicId);
  if (!epic || epic.status !== 'stage-1') return;
  // Check before charging so a held-back Epic is never billed twice for the same stage.
  if (!canAdvance(ps, epic)) return retry(ps, `${epicId} contracts (waiting)`, () => finishContracts(ps, epicId, plan));
  const spent = chargeSpend(ps, { usdMicros: Math.round(architectCost(epic) * 0.4), source: 'intake', epicId, workpackId: null, agentId: 'architect-prime' });
  if (!spent) return retry(ps, `${epicId} contracts (waiting)`, () => finishContracts(ps, epicId, plan));

  for (const draft of plan.contracts) {
    ps.contracts.push({
      id: nextId(ps, 'contract'),
      epicId,
      kind: draft.kind,
      path: draft.path,
      content: draft.content,
      hash: draft.hash,
      locked: true,
      unlockedBy: null,
      unlockedAt: null,
      unlockReason: null,
    });
  }
  epicMetaOf(ps, epicId).contractsAt = nowIso(ps.store);
  recordAudit(ps, SYSTEM_ACTOR, 'epic.contracts_authored', { epicId, contracts: plan.contracts.length });
  setEpicStatus(ps, epic, 'stage-2');
  schedule(ps, pace(ps.store, ps.store.tuning.planningMs), `${epicId} decomposition`, () => finishDecomposition(ps, epicId, plan));
}

function finishDecomposition(ps: ProjectState, epicId: string, plan: Plan): void {
  const epic = ps.epics.find((e) => e.id === epicId);
  if (!epic || epic.status !== 'stage-2') return;
  if (!canAdvance(ps, epic)) return retry(ps, `${epicId} decomposition (waiting)`, () => finishDecomposition(ps, epicId, plan));
  const spent = chargeSpend(ps, { usdMicros: Math.round(architectCost(epic) * 0.6), source: 'intake', epicId, workpackId: null, agentId: 'architect-prime' });
  if (!spent) return retry(ps, `${epicId} decomposition (waiting)`, () => finishDecomposition(ps, epicId, plan));

  epicMetaOf(ps, epicId).decomposedAt = nowIso(ps.store);
  decomposeEpic(ps, epic, plan.dag);
  if (!architectBusy(ps)) setAgentStatus(ps, 'architect-prime', 'idle');
}

// ---------------------------------------------------------------------------
// Decomposition: DAG nodes become workpacks with contracts attached
// ---------------------------------------------------------------------------

export function categoryFor(files: readonly string[]): string {
  if (files.some((f) => /migrations\/|\.prisma$/.test(f))) return 'Database';
  if (files.every((f) => f.endsWith('.md'))) return 'Docs';
  if (files.every((f) => /(^|\/)tests?\//.test(f) || /\.(test|spec)\./.test(f))) return 'Tests';
  if (files.some((f) => f.endsWith('.tsx') || /(^|\/)(components|pages)\//.test(f))) return 'Frontend';
  return 'Backend';
}

function contractsForNode(node: DagNode, contracts: Contract[]): Contract[] {
  const touchesApi = node.targetFiles.some((f) => /api|route|webhook|server|stream/.test(f));
  return contracts.filter(
    (c) => c.kind === 'ts-types' || c.kind === 'invariant' || (c.kind === 'openapi' && touchesApi) || (c.kind === 'playwright' && node.stage === 'verification'),
  );
}

export function decomposeEpic(ps: ProjectState, epic: Epic, dag: DagNode[]): Workpack[] {
  const contracts = ps.contracts.filter((c) => c.epicId === epic.id);
  const workpackFor = new Map<string, string>();
  const created: Workpack[] = [];

  // Nodes are listed in dependency order, so every dependency already has a workpack.
  for (const node of dag) {
    const wp = createWorkpack(
      ps,
      {
        epicId: epic.id,
        title: node.title,
        description: `${node.title} for ${epic.id}: ${epic.title}. Acceptance: ${epic.acceptance.join('; ')}.`,
        priority: epic.priority,
        category: categoryFor(node.targetFiles),
        targetFiles: node.targetFiles,
        dependsOn: node.dependsOn.map((d) => workpackFor.get(d)).filter((id): id is string => !!id),
      },
      SYSTEM_ACTOR,
    );
    workpackFor.set(node.id, wp.id);
    ps.attached.set(wp.id, contractsForNode(node, contracts).map((c) => c.id));
    created.push(wp);
  }

  ps.dags.set(
    epic.id,
    dag.map((n) => ({ ...n, workpackId: workpackFor.get(n.id) ?? null })),
  );
  recordAudit(ps, SYSTEM_ACTOR, 'epic.decomposed', { epicId: epic.id, workpacks: created.map((w) => w.id) });
  return created;
}

// ---------------------------------------------------------------------------
// Pipeline status (shell: pause pill, capacity meter, nav badges)
// ---------------------------------------------------------------------------

export function pipelineStatus(ps: ProjectState): PipelineStatus {
  const running = ps.workpacks.filter((w) => w.status === 'planning' || w.status === 'in-progress' || w.status === 'verification').length;
  const queued = ps.workpacks.filter((w) => w.status === 'queued').length;
  const awaitingReview = ps.workpacks.filter((w) => w.status === 'awaiting-review').length;
  const hardCapHit = isHardCapHit(ps);
  const pausedReasons = [
    ...(ps.pipeline.manualGlobal ? ['manual-global'] : []),
    ...(hardCapHit ? ['budget-hard-cap'] : []),
    ...(integrationEnabled(ps, 'github') ? [] : ['integration-disabled']),
  ];
  return {
    paused: pausedReasons.length > 0,
    pausedReasons,
    pausedBy: ps.pipeline.pausedBy,
    pausedAt: ps.pipeline.pausedAt,
    capacity: { used: running, max: CAPACITY },
    running,
    queued,
    awaitingReview,
    active: running + queued + awaitingReview,
    hardCapHit,
  };
}

// ---------------------------------------------------------------------------
// Stepper (Epic-scoped, spec §5.2)
// ---------------------------------------------------------------------------

/** The Epic with the most workpacks in flight; otherwise the newest Epic; `null` when there are none. */
export function defaultEpicId(ps: ProjectState): string | null {
  const open = (epic: Epic) => ps.workpacks.filter((w) => w.epicId === epic.id && !isTerminal(w.status)).length;
  const ranked = [...ps.epics].sort((a, b) => open(b) - open(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return ranked[0]?.id ?? null;
}

const STAGES = [
  { id: 1, title: 'Product Spec & Contracts', subtitle: 'Contracts are written before any code', agent: 'architect-prime', fallbackName: 'Architect-Prime', role: 'Lead architect' },
  { id: 2, title: 'Architecture Decomposition', subtitle: 'Workpack DAG, target files, owners', agent: 'architect-prime', fallbackName: 'Architect-Prime', role: 'Lead architect' },
  { id: 3, title: 'Code Synthesis', subtitle: 'Branch, commits, streaming diff', agent: 'codecraft', fallbackName: 'CodeCraft', role: 'Code synthesis' },
  { id: 4, title: 'Verification & Security', subtitle: 'Ten gates and the screenshot set', agent: 'gatekeeper', fallbackName: 'GateKeeper', role: 'Gates and security' },
] as const;

const span = (fromIso: string | null, toMs: number): string | null =>
  fromIso === null ? null : duration(Math.max(0, (toMs - Date.parse(fromIso)) / 1000));

export function stagesView(ps: ProjectState, requestedEpicId: string | null): PipelineStages {
  const epicId = requestedEpicId ?? defaultEpicId(ps);
  const epic = epicId ? epicById(ps, epicId) : null;
  const names = new Map(ps.agents.map((a) => [a.id, a.name]));
  const shell = (index: number): Omit<PipelineStage, 'state' | 'duration' | 'metric' | 'workpackIds'> => {
    const s = STAGES[index]!;
    return { id: s.id, title: s.title, subtitle: s.subtitle, agentName: names.get(s.agent) ?? s.fallbackName, agentRole: s.role };
  };
  if (!epic) {
    return {
      epicId: null,
      stages: STAGES.map((_, i): PipelineStage => ({ ...shell(i), state: 'pending', duration: null, metric: null, workpackIds: [] })),
    };
  }

  const now = nowMs(ps.store);
  const meta = epicMetaOf(ps, epic.id);
  const own = ps.workpacks.filter((w) => w.epicId === epic.id);
  const by = (...statuses: Workpack['status'][]) => own.filter((w) => statuses.includes(w.status));
  const heldBack = isHardCapHit(ps) || ps.pipeline.manualGlobal || epic.paused || !integrationEnabled(ps, 'github');
  const allPaused = (list: Workpack[]) => list.length > 0 && list.every((w) => w.paused);
  const dag = ps.dags.get(epic.id) ?? [];
  const contractCount = ps.contracts.filter((c) => c.epicId === epic.id).length;

  const early = epic.status === 'intake' || epic.status === 'stage-1';
  const stage1State: PipelineStage['state'] = early ? (heldBack ? 'blocked' : 'active') : 'completed';
  const stage2State: PipelineStage['state'] = early ? 'pending' : epic.status === 'stage-2' ? (heldBack ? 'blocked' : 'active') : 'completed';

  const inProgress = by('in-progress');
  const waiting = by('queued', 'planning');
  const verifying = by('verification');
  let stage3State: PipelineStage['state'];
  if (inProgress.length > 0) stage3State = allPaused(inProgress) ? 'blocked' : 'active';
  else if (own.length === 0) stage3State = 'pending';
  else if (waiting.length > 0) stage3State = heldBack || allPaused(waiting) ? 'blocked' : 'pending';
  else stage3State = 'completed';

  let stage4State: PipelineStage['state'];
  if (verifying.length > 0) stage4State = allPaused(verifying) ? 'blocked' : 'active';
  else if (by('awaiting-review', 'done').length > 0 && inProgress.length === 0 && waiting.length === 0) stage4State = 'completed';
  else stage4State = 'pending';

  const startedAts = own.map((w) => w.startedAt).filter((s): s is string => s !== null).sort();
  const lastEnd = Math.max(0, ...own.map((w) => Date.parse(w.completedAt ?? w.endedAt ?? w.startedAt ?? '') || 0));
  const gates = ps.gateResults.filter((g) => own.some((w) => w.id === g.workpackId));
  const gateStarts = gates.map((g) => g.startedAt).sort();
  const gateEnd = Math.max(0, ...gates.map((g) => Date.parse(g.finishedAt ?? '') || 0));
  const linesAdded = own.reduce((sum, w) => sum + w.linesAdded, 0);
  const verifiedGates = verifying.reduce((sum, w) => sum + (w.gateSummary?.passed ?? 0), 0);
  const verifyingTotal = verifying.reduce((sum, w) => sum + (w.gateSummary?.total ?? 10), 0);

  const stages: PipelineStage[] = [
    {
      ...shell(0),
      state: stage1State,
      duration: span(meta.stage1StartedAt, stage1State === 'completed' && meta.contractsAt ? Date.parse(meta.contractsAt) : now),
      metric: contractCount > 0 ? `${contractCount} contracts, locked` : null,
      workpackIds: [],
    },
    {
      ...shell(1),
      state: stage2State,
      duration: span(meta.contractsAt, stage2State === 'completed' && meta.decomposedAt ? Date.parse(meta.decomposedAt) : now),
      metric: dag.length > 0 ? `${dag.length} workpacks in the DAG` : null,
      workpackIds: [],
    },
    {
      ...shell(2),
      state: stage3State,
      duration: span(startedAts[0] ?? null, stage3State === 'completed' && lastEnd > 0 ? lastEnd : now),
      metric: own.length > 0 ? `${inProgress.length} in progress · +${linesAdded.toLocaleString('en-US')} lines` : null,
      workpackIds: inProgress.map((w) => w.id),
    },
    {
      ...shell(3),
      state: stage4State,
      duration: span(gateStarts[0] ?? null, stage4State === 'completed' && gateEnd > 0 ? gateEnd : now),
      metric: verifying.length > 0 ? `${verifiedGates}/${verifyingTotal} gates passed` : null,
      workpackIds: verifying.map((w) => w.id),
    },
  ];
  return { epicId: epic.id, stages };
}
