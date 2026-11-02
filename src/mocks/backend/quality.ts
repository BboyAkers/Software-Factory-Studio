import type {
  Contract,
  Deployment,
  GateResult,
  GatesResponse,
  Release,
  ReproBundle,
  SignoffItem,
  Workpack,
} from '../../contracts';
import { GATE_CATALOG, checkRunName, gateEntry } from '../../contracts';
import { usd } from '../../domain/format';
import { ApiProblem, conflict, notFound } from '../http';
import { emit, nowIso, nowMs, recordAudit, rngOf, schedule } from './runtime';
import type { Actor, ProjectState } from './store';
import { SYSTEM_ACTOR } from './store';
import { transition } from './workpacks';

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/** Results of the most recent gate run for a workpack, one per gate. */
export function latestGateResults(ps: ProjectState, wp: Workpack): GateResult[] {
  const own = ps.gateResults.filter((g) => g.workpackId === wp.id);
  if (own.length === 0) return [];
  const newest = own.reduce((a, b) => (Date.parse(b.startedAt) > Date.parse(a.startedAt) ? b : a));
  return own.filter((g) => g.runId === newest.runId).sort((a, b) => gateEntry(a.gate).index - gateEntry(b.gate).index);
}

export function gatesView(ps: ProjectState, wp: Workpack): GatesResponse {
  return { workpackId: wp.id, results: latestGateResults(ps, wp), quarantined: ps.quarantined.get(wp.id) ?? [] };
}

export function refreshGateSummary(ps: ProjectState, wp: Workpack): void {
  const results = latestGateResults(ps, wp);
  wp.gateSummary =
    results.length === 0
      ? null
      : {
          total: results.length,
          passed: results.filter((r) => r.status === 'passed' || r.status === 'quarantined').length,
          failed: results.filter((r) => r.status === 'failed' && r.severity === 'block').length,
          running: results.filter((r) => r.status === 'running' || r.status === 'queued').length,
        };
}

// ---------------------------------------------------------------------------
// Sign-off and release
// ---------------------------------------------------------------------------

export function touchesSchema(wp: Workpack): boolean {
  return wp.targetFiles.some((f) => f.includes('migrations/') || f.endsWith('.prisma') || f.includes('schema.'));
}

export function signoffRequired(ps: ProjectState, wp: Workpack): boolean {
  return ps.policies.humanSignoffP0P1Schema && (wp.priority === 'P0 Blocker' || wp.priority === 'P1 High' || touchesSchema(wp));
}

export function signoffItems(ps: ProjectState, wp: Workpack): SignoffItem[] {
  const results = latestGateResults(ps, wp);
  const blockingIds = GATE_CATALOG.filter((g) => g.severity === 'block').map((g) => g.id);
  const blocking = results.filter((r) => blockingIds.includes(r.gate));
  // A skipped gate (migration safety on a diff with no migration) has nothing to pass, and a quarantined
  // flaky test is tracked in an issue rather than blocking.
  const unfinished = blocking.filter((r) => r.status !== 'passed' && r.status !== 'skipped' && r.status !== 'quarantined');
  const allBlockingGreen = blocking.length === blockingIds.length && unfinished.length === 0;

  const conformance = results.find((r) => r.gate === 'contract.conformance');
  const unlocked = (ps.attached.get(wp.id) ?? []).map((id) => ps.contracts.find((c) => c.id === id)).filter((c): c is Contract => !!c && c.unlockedAt !== null);

  const needsSignoff = signoffRequired(ps, wp);
  return [
    {
      id: 'blocking-gates',
      label: 'All blocking gates passed',
      state: allBlockingGreen ? 'met' : 'unmet',
      detail:
        results.length === 0
          ? 'No gate results yet.'
          : allBlockingGreen
            ? `All ${blockingIds.length} blocking gates passed on the latest run.`
            : `${unfinished.map((r) => gateEntry(r.gate).title).join(', ')} not passed.`,
    },
    {
      id: 'secops-veto',
      label: 'No SecOps-Vanguard veto',
      state: ps.vetoed.has(wp.id) ? 'unmet' : 'met',
      detail: ps.vetoed.has(wp.id) ? 'SecOps-Vanguard raised a veto on this workpack.' : 'No veto raised.',
    },
    {
      id: 'human-signoff',
      label: 'Maintainer sign-off',
      state: needsSignoff ? 'unmet' : 'na',
      detail: needsSignoff
        ? `Required for ${wp.priority === 'P2 Normal' ? 'schema changes' : wp.priority}${touchesSchema(wp) && wp.priority !== 'P2 Normal' ? ' and schema changes' : ''}. Promoting records it.`
        : 'Not required: P2 with no schema changes.',
    },
    {
      id: 'contract-conformance',
      label: 'Contract conformance',
      state: conformance?.status === 'passed' ? 'met' : 'unmet',
      detail:
        conformance?.status === 'passed'
          ? unlocked.length > 0
            ? `Passed. ${unlocked.length} contract${unlocked.length > 1 ? 's were' : ' was'} Maintainer-unlocked (audited).`
            : 'No locked contract was modified.'
          : conformance
            ? 'A locked contract was modified or the API diff is breaking.'
            : 'Not evaluated yet.',
    },
  ];
}

const repoOf = (ps: ProjectState) => ps.repository?.fullName ?? ps.project.repo;

export function prUrl(ps: ProjectState, wp: Workpack): string | null {
  return wp.prNumber ? `https://github.com/${repoOf(ps)}/pull/${wp.prNumber}` : null;
}

function checkRunStatus(result: GateResult): 'queued' | 'in_progress' | 'success' | 'failure' | 'neutral' {
  if (result.status === 'queued') return 'queued';
  if (result.status === 'running') return 'in_progress';
  if (result.status === 'passed') return 'success';
  if (result.status === 'failed' && result.severity === 'block') return 'failure';
  return 'neutral';
}

export function prBodyMarkdown(ps: ProjectState, wp: Workpack): string {
  const results = latestGateResults(ps, wp);
  const files = ps.files.get(wp.id) ?? [];
  const shots = ps.screenshots.get(wp.id) ?? [];
  const quarantined = ps.quarantined.get(wp.id) ?? [];
  const runs = ps.runs.filter((r) => r.workpackId === wp.id);
  const tokens = runs.reduce((sum, r) => sum + r.tokens, 0);
  const line = (r: GateResult) => `- \`${checkRunName(r.gate)}\`: ${r.status}${r.metrics[0] ? ` (${r.metrics[0].label}: ${r.metrics[0].value})` : ''}`;
  return [
    `## Summary`,
    wp.title,
    wp.description ? `\n${wp.description}` : '',
    `\n## Changes`,
    files.length > 0 ? files.map((f) => `- \`${f.path}\``).join('\n') : wp.targetFiles.map((f) => `- \`${f}\``).join('\n') || '- No files yet',
    `\n## New dependencies`,
    'None.',
    `\n## Gate results`,
    `**Blocking**`,
    results.filter((r) => r.severity === 'block').map(line).join('\n') || '- Pending',
    `\n**Warn-only**`,
    results.filter((r) => r.severity !== 'block').map(line).join('\n') || '- Pending',
    `\n## Quarantined flaky tests`,
    quarantined.length > 0 ? quarantined.map((q) => `- ${q.name} ([issue](${q.issueUrl}))`).join('\n') : 'None.',
    `\n## Screenshots`,
    shots.length > 0 ? `${shots.length} captures across the viewport matrix, kept 30 days.` : 'Captured when the e2e gate runs.',
    `\n## Cost`,
    `${usd(wp.costUsdMicros)} across ${runs.length} run${runs.length === 1 ? '' : 's'} · ${tokens.toLocaleString('en-US')} tokens`,
    `\n## Transcript`,
    runs.at(-1)?.transcriptUri ?? 'Not available yet.',
    `\n---\nGenerated by Synthetix Factory OS · branch \`${wp.branch}\``,
  ].join('\n');
}

export function releaseView(ps: ProjectState, wp: Workpack): Release {
  const results = latestGateResults(ps, wp);
  const signoff = signoffItems(ps, wp);
  // Promoting is itself the Maintainer sign-off, so that item never blocks the button.
  const blockers = signoff.filter((s) => s.id !== 'human-signoff' && s.state === 'unmet').map((s) => `${s.label}: ${s.detail}`);
  if (wp.status !== 'awaiting-review') blockers.unshift(`${wp.id} is ${wp.status}, not awaiting review.`);
  const deployment = ps.deployments.get(wp.id) ?? null;
  const merged = wp.mergedAt !== null;
  return {
    workpackId: wp.id,
    prNumber: wp.prNumber,
    prUrl: prUrl(ps, wp),
    branch: wp.branch,
    commitSha: wp.commitSha,
    prBodyMarkdown: prBodyMarkdown(ps, wp),
    checkRuns: results.map((r) => ({
      name: checkRunName(r.gate),
      status: checkRunStatus(r),
      url: `https://github.com/${repoOf(ps)}/runs/${gateEntry(r.gate).index}`,
    })),
    signoff,
    canPromote: blockers.length === 0,
    unmet: blockers,
    merged,
    mergedAt: wp.mergedAt,
    deployment,
    noDeploymentReported: merged && deployment === null && nowMs(ps.store) - Date.parse(wp.mergedAt!) > 30 * 60_000,
  };
}

export function reproBundle(ps: ProjectState, wp: Workpack): ReproBundle {
  const runs = ps.runs.filter((r) => r.workpackId === wp.id);
  return {
    workpackId: wp.id,
    branch: wp.branch,
    commitSha: wp.commitSha,
    prNumber: wp.prNumber,
    gateResults: latestGateResults(ps, wp),
    transcriptUri: runs.at(-1)?.transcriptUri ?? null,
    envRedacted: ps.vault.filter((k) => k.allowedGates.length > 0).map((k) => `${k.name}=<redacted>`),
    generatedAt: nowIso(ps.store),
  };
}

// ---------------------------------------------------------------------------
// Merge, promote, deployment
// ---------------------------------------------------------------------------

/** Open the PR for a workpack the first time it needs one. */
export function assignPr(ps: ProjectState, wp: Workpack): void {
  if (wp.prNumber === null) {
    const used = ps.workpacks.map((w) => w.prNumber ?? 0);
    wp.prNumber = Math.max(400, ...used) + 1;
  }
}

/** Merge the PR (Promote, or the orchestrator's auto-merge) and start the staging deployment. */
export function mergeWorkpack(ps: ProjectState, wp: Workpack, actor: Actor | 'orchestrator'): Workpack {
  assignPr(ps, wp);
  wp.mergedAt = nowIso(ps.store);
  transition(ps, wp, 'done', { actor });
  recordAudit(ps, actor === 'orchestrator' ? SYSTEM_ACTOR : actor, 'workpack.merged', { workpackId: wp.id, prNumber: wp.prNumber });
  scheduleDeployment(ps, wp);
  return wp;
}

export function promoteWorkpack(ps: ProjectState, wp: Workpack, actor: Actor): Workpack {
  if (wp.status !== 'awaiting-review') {
    throw conflict('illegal_transition', `${wp.id} is ${wp.status}, not awaiting review.`, { allowed: [] });
  }
  const release = releaseView(ps, wp);
  if (!release.canPromote) {
    throw new ApiProblem(409, 'illegal_transition', 'This workpack cannot be promoted yet.', { detail: release.unmet.join(' ') });
  }
  return mergeWorkpack(ps, wp, actor);
}

const DEPLOY_STEPS: { after: number; status: Deployment['status'] }[] = [
  { after: 0, status: 'queued' },
  { after: 3_000, status: 'in-progress' },
];

export function scheduleDeployment(ps: ProjectState, wp: Workpack): void {
  const set = (status: Deployment['status']) => {
    const sha = wp.commitSha ?? '0000000';
    const deployment: Deployment = {
      status,
      environment: 'staging',
      sha,
      url: status === 'succeeded' ? `https://staging.example.dev/${wp.id.toLowerCase()}` : null,
      updatedAt: nowIso(ps.store),
    };
    ps.deployments.set(wp.id, deployment);
    emit(ps, { type: 'deploy.status', workpackId: wp.id, environment: 'staging', status, ...(deployment.url ? { url: deployment.url } : {}) });
  };
  const fails = rngOf(ps.store).chance(0.12);
  for (const step of DEPLOY_STEPS) {
    if (step.after === 0) set(step.status);
    else schedule(ps, step.after, `deploy ${wp.id} ${step.status}`, () => set(step.status));
  }
  schedule(ps, 9_000, `deploy ${wp.id} final`, () => set(fails ? 'failed' : 'succeeded'));
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export function contractsFor(ps: ProjectState, wp: Workpack): Contract[] {
  return (ps.attached.get(wp.id) ?? []).map((id) => ps.contracts.find((c) => c.id === id)).filter((c): c is Contract => !!c);
}

export function unlockContract(ps: ProjectState, contractId: string, reason: string, actor: Actor): Contract {
  const contract = ps.contracts.find((c) => c.id === contractId);
  if (!contract) throw notFound('Contract', contractId);
  if (!contract.locked) throw conflict('illegal_transition', `${contract.path} is already unlocked.`);
  contract.locked = false;
  contract.unlockedBy = actor.name;
  contract.unlockedAt = nowIso(ps.store);
  contract.unlockReason = reason;
  recordAudit(ps, actor, 'contract.unlocked', { contractId, path: contract.path, reason });
  for (const [workpackId, ids] of ps.attached) {
    if (ids.includes(contractId)) emit(ps, { type: 'contract.unlocked', workpackId, contractId, by: actor.name, reason });
  }
  return contract;
}
