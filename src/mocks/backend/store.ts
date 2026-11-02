import type {
  Agent,
  AgentConfigVersion,
  AgentStatus,
  AuditEntry,
  Contract,
  DagNode,
  Deployment,
  Envelope,
  Epic,
  GateResult,
  Integration,
  IntakeEvent,
  LogEntry,
  Policies,
  Project,
  ProjectToken,
  QuarantinedTest,
  ReasoningStep,
  Repository,
  Role,
  Run,
  Screenshot,
  SkillDefinition,
  SlackSettings,
  SpendSource,
  SteeringHint,
  SteeringSuggestion,
  TerminalLine,
  VaultKey,
  Workpack,
} from '../../contracts';
import { ReservationLedger } from '../../domain/budget';
import type { WarnEvent } from '../../domain/kpis';

export interface Actor {
  id: string;
  name: string;
  role: Role;
  type: 'user' | 'agent' | 'system';
}

export const SYSTEM_ACTOR: Actor = { id: 'system', name: 'Factory', role: 'admin', type: 'system' };

export interface SpendEntry {
  at: string;
  usdMicros: number;
  source: SpendSource;
  epicId: string | null;
  workpackId: string | null;
  agentId: string | null;
}

/** A simulated GitHub issue. Webhooks are simulated by the simulator processing these. */
export interface IssueRecord {
  number: number;
  url: string;
  title: string;
  body: string;
  labels: string[];
  origin: 'spec-studio' | 'github-ui' | 'sentry';
  /** GitHub login or Studio user who opened the issue. */
  author: string;
  createdAt: string;
  fingerprint: string | null;
  comments: { at: string; body: string }[];
  processed: boolean;
}

/** One file a workpack touches: the base content and what the agent (or a human) has written. */
export interface FileState {
  path: string;
  original: string;
  /** Written so far. Grows toward `final` while the agent works; a human save replaces it. */
  modified: string;
  /** What the agent will have written when it finishes this file. Simulation scratch. */
  final: string;
  lockedBy: string | null;
  writing: boolean;
}

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  stage: number | null;
  stageLabel: string;
  responsibilities: string[];
  canRunNow: boolean;
  availableSkills: SkillDefinition[];
  status: AgentStatus;
  tokens24h: number;
  cost24hUsdMicros: number;
  cacheHitRatio: number;
  failovers24h: number;
  versions: AgentConfigVersion[];
}

export interface BudgetState {
  capUsdMicros: number;
  softLimitPercent: number;
  slackChannel: string;
  ledger: ReservationLedger;
  /** Used to emit toast-worthy transitions once. */
  softAnnounced: boolean;
  hardAnnounced: boolean;
  lastEmitMs: number;
  periodStartMs: number;
}

/** Per-run simulation scratch. Not part of any API shape. */
export interface RunScratch {
  /** When the current turn ends. A paused run keeps this in the past and takes its turn on resume. */
  nextTurnAtMs: number;
  turnStartedMs: number;
  turnDurationMs: number;
  /** Tokens the current turn will consume, spread over its ticks. */
  turnTokens: number;
  emittedThisTurn: number;
  lastTickMs: number;
  /** Turns this run needs to reach 100%. */
  turnsTotal: number;
  /** Completeness when the run began (a retry resumes partway through). */
  startProgress: number;
  /** Reasoning plan and the step currently active. */
  steps: string[];
  stepIndex: number;
  /** Files already reported as hitting a human lock, so each is reported once. */
  violations: string[];
  lastCommitProgress: number;
}

export interface ScheduledTask {
  dueMs: number;
  label: string;
  run: () => void;
}

export interface StreamClient {
  projectId: string;
  /** `null` for the project stream, a run id for a run stream. */
  runId: string | null;
  send: (envelope: Envelope) => void;
  close: () => void;
}

export interface RingBuffer {
  seq: number;
  ring: Envelope[];
}

export interface BenchmarkRecord {
  id: string;
  startedMs: number;
  durationMs: number;
  total: number;
  done: boolean;
}

/** When an Epic passed each early stage; the stepper derives its durations from these. */
export interface EpicMeta {
  stage1StartedAt: string | null;
  contractsAt: string | null;
  decomposedAt: string | null;
}

export interface ProjectState {
  store: Store;
  project: Project;
  repository: Repository | null;
  counters: Record<string, number>;

  epics: Epic[];
  epicMeta: Map<string, EpicMeta>;
  dags: Map<string, DagNode[]>;
  contracts: Contract[];
  /** Workpack id → ids of contracts attached to it. */
  attached: Map<string, string[]>;
  workpacks: Workpack[];
  runs: Run[];
  logs: Map<string, LogEntry[]>;
  reasoning: Map<string, ReasoningStep[]>;
  suggestions: SteeringSuggestion[];
  hints: SteeringHint[];
  /** Per-run steering inbox: hint ids committed but not yet delivered at a turn boundary. */
  inbox: Map<string, string[]>;
  files: Map<string, FileState[]>;
  /** Per-run terminal scrollback (last 200 lines), shared by everyone attached to the run. */
  terminals: Map<string, TerminalLine[]>;
  gateResults: GateResult[];
  quarantined: Map<string, QuarantinedTest[]>;
  screenshots: Map<string, Screenshot[]>;
  deployments: Map<string, Deployment>;
  /** Workpack ids whose SecOps veto was raised. */
  vetoed: Set<string>;

  intake: IntakeEvent[];
  issues: IssueRecord[];

  audit: AuditEntry[];
  auditQueue: Promise<void>;
  warnEvents: WarnEvent[];
  spend: SpendEntry[];
  budget: BudgetState;

  agents: AgentRecord[];
  integrations: Integration[];
  policies: Policies;
  token: { info: ProjectToken; hash: string };
  vault: VaultKey[];
  slack: SlackSettings & { rawWebhook: string | null };

  pipeline: { manualGlobal: boolean; pausedBy: string | null; pausedAt: string | null };
  benchmarks: Map<string, BenchmarkRecord>;

  events: RingBuffer;
  runStreams: Map<string, RingBuffer>;
  scratch: Map<string, RunScratch>;
  timers: ScheduledTask[];
  /** Millisecond timestamp of the last simulated issue arrival. */
  lastIssueMs: number;
}

export interface StoredResponse {
  fingerprint: string;
  status: number;
  body: string;
  contentType: string;
}

export type ScenarioId = 'healthy' | 'soft-limit' | 'hard-cap' | 'gate-failures' | 'sla-pressure' | 'quiet';

export interface Store {
  projects: Map<string, ProjectState>;
  clock: { offsetMs: number; fixedMs: number | null };
  net: { offline: boolean };
  sim: { speed: number; running: boolean; scenario: ScenarioId; seed: number; gateFailureRate: number };
  streams: Set<StreamClient>;
  idempotency: Map<string, StoredResponse>;
  /** Next-turn pacing and similar knobs the tests may override. */
  tuning: { turnMs: number; planningMs: number; gateMs: number; intakeEveryMs: number; previewMs: number };
}

export function createStore(overrides: Partial<Store['sim']> = {}): Store {
  return {
    projects: new Map(),
    clock: { offsetMs: 0, fixedMs: null },
    net: { offline: false },
    sim: { speed: 1, running: false, scenario: 'healthy', seed: 20261101, gateFailureRate: 0.1, ...overrides },
    streams: new Set(),
    idempotency: new Map(),
    tuning: { turnMs: 9000, planningMs: 5000, gateMs: 9000, intakeEveryMs: 360_000, previewMs: 1400 },
  };
}

export function createProjectState(store: Store, project: Project, nowMs: number): ProjectState {
  const periodStart = new Date(nowMs);
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const cap = 5_000 * 1_000_000;
  const now = new Date(nowMs).toISOString();
  return {
    store,
    project,
    repository: null,
    counters: {},
    epics: [],
    epicMeta: new Map(),
    dags: new Map(),
    contracts: [],
    attached: new Map(),
    workpacks: [],
    runs: [],
    logs: new Map(),
    reasoning: new Map(),
    suggestions: [],
    hints: [],
    inbox: new Map(),
    files: new Map(),
    terminals: new Map(),
    gateResults: [],
    quarantined: new Map(),
    screenshots: new Map(),
    deployments: new Map(),
    vetoed: new Set(),
    intake: [],
    issues: [],
    audit: [],
    auditQueue: Promise.resolve(),
    warnEvents: [],
    spend: [],
    budget: {
      capUsdMicros: cap,
      softLimitPercent: 80,
      slackChannel: '#factory-alerts',
      ledger: new ReservationLedger(cap, 0),
      softAnnounced: false,
      hardAnnounced: false,
      lastEmitMs: 0,
      periodStartMs: periodStart.getTime(),
    },
    agents: [],
    integrations: [],
    policies: {
      autoMergeVerifiedPRs: false,
      humanSignoffP0P1Schema: true,
      sastStrictness: 'strict',
      slaEscalation: true,
      hardBudgetTripwire: true,
    },
    token: {
      info: {
        prefix: 'fct',
        last4: '0000',
        createdAt: now,
        createdBy: 'system',
        lastUsedAt: null,
        lastUsedBy: null,
        lastUsedClient: null,
        revoked: false,
      },
      hash: '',
    },
    vault: [],
    slack: {
      webhookConfigured: false,
      webhookMasked: null,
      channel: '#factory-alerts',
      oncallHandle: '',
      routing: { budget: true, review: true, failure: true, sla: true },
      rawWebhook: null,
    },
    pipeline: { manualGlobal: false, pausedBy: null, pausedAt: null },
    benchmarks: new Map(),
    events: { seq: 0, ring: [] },
    runStreams: new Map(),
    scratch: new Map(),
    timers: [],
    lastIssueMs: nowMs,
  };
}

/** Narrow lookup used across handlers: throws via the caller when absent. */
export function agentView(record: AgentRecord): Agent {
  const active = record.versions.find((v) => v.status === 'active') ?? record.versions[record.versions.length - 1]!;
  const evaluating = record.versions.find((v) => v.status === 'evaluating');
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    initials: record.initials,
    color: record.color,
    stage: record.stage,
    stageLabel: record.stageLabel,
    status: record.status,
    activeVersion: active.version,
    evaluatingVersion: evaluating?.version ?? null,
    tokens24h: record.tokens24h,
    cost24hUsdMicros: record.cost24hUsdMicros,
    cacheHitRatio: record.cacheHitRatio,
    failovers24h: record.failovers24h,
    responsibilities: record.responsibilities,
    canRunNow: record.canRunNow,
    config: active.config,
    availableSkills: record.availableSkills,
  };
}
