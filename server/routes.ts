import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  ActivateVersionRequestSchema,
  ApproveRequestSchema,
  AttributionBySchema,
  ConnectRequestSchema,
  CreateVersionRequestSchema,
  CreateWorkpackRequestSchema,
  GateIdSchema,
  LogLevelSchema,
  type Me,
  type PipelineToggle,
  PreviewRequestSchema,
  PutVaultKeyRequestSchema,
  RejectRequestSchema,
  SteerRequestSchema,
  SuggestRequestSchema,
  UpdateBudgetRequestSchema,
  UpdatePoliciesRequestSchema,
  UpdateSlackRequestSchema,
  WorkpackStatusSchema,
  type Priority,
  type Workpack,
} from '../src/contracts';
import { can, requiredRole, type Capability } from '../src/domain/rbac';
import {
  activateVersion,
  agentById,
  agentViewOf,
  agentViews,
  createVersion,
  fleetStats,
  modelCatalog,
  runAgentCycle,
  versionOf,
  versionPage,
} from '../src/mocks/backend/agents';
import { auditPage, exportAudit, verifyAudit } from '../src/mocks/backend/audit';
import { attribution, updateBudget } from '../src/mocks/backend/budget';
import { longHash } from '../src/mocks/backend/codegen';
import { connectProject, disconnectProject, runPreflight } from '../src/mocks/backend/connect';
import { dispatchEpic, epicDetail, epicList, intakeList, pipelineStatus, previewEpic, stagesView } from '../src/mocks/backend/epics';
import { diffView, fileContent, humanSave } from '../src/mocks/backend/files';
import { healthView, latestBenchmark, overviewMetrics, startBenchmark } from '../src/mocks/backend/overview';
import { contractsFor, gatesView, promoteWorkpack, releaseView, reproBundle, unlockContract } from '../src/mocks/backend/quality';
import { budgetView, nowIso, nowMs, pageOf } from '../src/mocks/backend/runtime';
import { searchProject } from '../src/mocks/backend/search';
import {
  deleteVaultKey,
  integrationById,
  putVaultKey,
  revokeToken,
  rotateProviderKey,
  rotateToken,
  sendSlackTest,
  setIntegrationEnabled,
  slackView,
  testIntegration,
  tokenView,
  updatePolicies,
  updateSlack,
  vaultKeys,
} from '../src/mocks/backend/settings';
import { approveSuggestion, inject, rejectSuggestion, steeringState, suggest } from '../src/mocks/backend/steering';
import { SYSTEM_ACTOR, type Actor, type ProjectState, type Store } from '../src/mocks/backend/store';
import { handleGitHubWebhook } from '../src/mocks/backend/webhooks';
import {
  acquireLock,
  archiveWorkpack,
  cancelWorkpack,
  createWorkpack,
  epicById,
  forkWorkpack,
  pauseEpic,
  pauseProject,
  pauseWorkpack,
  releaseLock,
  requestChanges,
  resumeEpic,
  resumeProject,
  resumeWorkpack,
  rollbackWorkpack,
  runById,
  setHoldForReview,
  transition,
  workpackById,
  workpackDetail,
} from '../src/mocks/backend/workpacks';
import { ApiProblem, checkIfMatch, conflict, forbiddenFor, invalid, parseAuth, parseMockToken, requireCapability } from '../src/mocks/http';
import { getIdempotency, saveIdempotency, saveProject } from './db/sync';
import { compileRoute, handleCors, readRequestBody, sendJson, sendProblem, type CompiledRoute, type ServerRouteOptions } from './http';

const emailFor = (name: string): string => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'user'}@example.dev`;
const PRIORITY_CODES: Record<string, Priority> = { P0: 'P0 Blocker', P1: 'P1 High', P2: 'P2 Normal' };
const HOUR_MS = 3_600_000;

const windowMs = (value: string | null): number | null => {
  const match = /^(\d+)(h|d)$/.exec(value ?? '');
  return match ? Number(match[1]) * (match[2] === 'h' ? HOUR_MS : 24 * HOUR_MS) : null;
};

const intParam = (query: URLSearchParams, name: string, fallback: number, max: number): number => {
  const n = Number(query.get(name));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
};

function listWorkpacks(ps: ProjectState, query: URLSearchParams): Workpack[] {
  const statuses = query.get('status')?.split(',').filter(Boolean) ?? [];
  const priority = query.get('priority');
  const agent = query.get('agent');
  const epic = query.get('epic');
  const q = query.get('q')?.trim().toLowerCase();
  const archived = ['1', 'true'].includes(query.get('archived') ?? '');
  const doneWindow = windowMs(query.get('doneSince'));
  const now = nowMs(ps.store);

  return ps.workpacks
    .filter((w) => {
      if (w.archived !== archived) return false;
      if (statuses.length > 0 && !statuses.includes('all') && !statuses.includes(w.status)) return false;
      if (priority && w.priority !== (PRIORITY_CODES[priority] ?? priority)) return false;
      if (agent && w.assignedAgentId !== agent) return false;
      if (epic && w.epicId !== epic) return false;
      if (q && !`${w.id} ${w.title} ${w.branch} ${w.epicId} ${w.category}`.toLowerCase().includes(q)) return false;
      if (doneWindow !== null && w.status === 'done' && now - Date.parse(w.completedAt ?? w.createdAt) > doneWindow) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}

function pathProblem(path: string): string | null {
  if (path.trim() === '') return 'Enter a path.';
  if (path.length > 200) return 'Paths are limited to 200 characters.';
  if (path.startsWith('/')) return 'Use a path relative to the repository root.';
  if (path.includes('\\')) return 'Use forward slashes.';
  const segments = path.split('/');
  if (segments.includes('..')) return 'Paths may not leave the repository (no "..").';
  if (segments.includes('.git')) return 'Paths inside .git are not allowed.';
  return null;
}

function validateCreate(ps: ProjectState, body: z.infer<typeof CreateWorkpackRequestSchema>) {
  const errors: { path: string; message: string; code: string }[] = [];
  const epic = ps.epics.find((e) => e.id === body.epicId);
  if (!epic) errors.push({ path: 'epicId', message: `Epic ${body.epicId} does not exist.`, code: 'not_found' });
  else if (epic.status === 'completed' || epic.status === 'failed' || epic.status === 'cancelled') {
    errors.push({ path: 'epicId', message: `${epic.id} has ended and accepts no new workpacks.`, code: 'epic_closed' });
  }
  body.targetFiles.forEach((file, i) => {
    const problem = pathProblem(file);
    if (problem) errors.push({ path: `targetFiles.${i}`, message: problem, code: 'invalid_path' });
  });
  body.dependsOn.forEach((id, i) => {
    const dep = ps.workpacks.find((w) => w.id === id);
    if (!dep) errors.push({ path: `dependsOn.${i}`, message: `${id} does not exist.`, code: 'not_found' });
    else if (epic && dep.epicId !== epic.id) errors.push({ path: `dependsOn.${i}`, message: `${id} belongs to a different Epic.`, code: 'different_epic' });
  });
  return errors;
}

const UnlockRequestSchema = z.object({
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.').max(500),
});
const LockRequestSchema = z.object({ path: z.string().min(1) });
const ToggleSchema = z.object({ enabled: z.boolean() });
const KeySchema = z.object({ value: z.string().trim().min(1, 'Enter the key.') });
const PatchPoliciesSchema = UpdatePoliciesRequestSchema.extend({
  hardBudgetTripwire: z.literal(true, { error: 'The hard budget tripwire is always on.' }).optional(),
});
const PutVaultSchema = PutVaultKeyRequestSchema.extend({ allowedGates: z.array(GateIdSchema).optional() });
const PreflightRequestSchema = z.object({ repo: z.string(), token: z.string(), defaultBranch: z.string().optional() });
const StatusRequestSchema = z.object({
  status: WorkpackStatusSchema,
  text: z.string().trim().min(3).max(1000).optional(),
});
const TextRequestSchema = z.object({ text: z.string().trim().min(3, 'Say what should change.').max(1000) });
const HoldRequestSchema = z.object({ holdForReview: z.boolean() });
const SaveFileRequestSchema = z.object({ path: z.string().min(1), content: z.string().max(200_000) });

const seqOf = (entry: any): number => Number(entry.id.replace(/^log-/, '')) || 0;
function logPage(entries: readonly any[], limit: number, cursor: string | null) {
  const before = cursor === null ? Number.POSITIVE_INFINITY : Number(cursor);
  const older = entries.filter((e) => seqOf(e) < before);
  const items = older.slice(-limit);
  const first = items[0];
  return { items, nextCursor: first && older.length > items.length ? String(seqOf(first)) : null };
}

function activeRunOf(ps: ProjectState, runId: string) {
  const run = runById(ps, runId);
  if (run.endedAt) throw conflict('run_not_active', `Run ${runId} has ended, so its files can no longer be locked.`);
  return run;
}

export function buildRouteRegistry(): ServerRouteOptions[] {
  const routes: ServerRouteOptions[] = [
    // Session & Projects
    {
      method: 'GET',
      pattern: '/me',
      scope: 'global',
      handler: ({ store, actor }): Me => ({
        id: actor.id,
        name: actor.name,
        email: emailFor(actor.name),
        role: actor.role,
        projects: [...store.projects.values()].map((ps) => ps.project),
      }),
    },
    {
      method: 'GET',
      pattern: '/projects',
      scope: 'global',
      handler: ({ store }) => [...store.projects.values()].map((ps) => ps.project),
    },
    {
      method: 'POST',
      pattern: '/projects/connect/preflight',
      scope: 'global',
      capability: 'project.connect',
      body: PreflightRequestSchema,
      handler: ({ body }) => runPreflight(body),
    },
    {
      method: 'POST',
      pattern: '/projects/connect',
      scope: 'global',
      capability: 'project.connect',
      body: ConnectRequestSchema,
      status: 201,
      handler: ({ store, actor, body, db }) => {
        const project = connectProject(store, body, actor);
        const ps = store.projects.get(project.id);
        if (ps) saveProject(db, ps);
        return project;
      },
    },
    {
      method: 'DELETE',
      pattern: '/projects/:projectId',
      scope: 'global',
      capability: 'project.connect',
      handler: ({ store, actor, params, db }) => {
        const projectId = params.projectId ?? '';
        const res = disconnectProject(store, projectId, actor);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        return res;
      },
    },
    {
      method: 'POST',
      pattern: '/projects/:projectId/disconnect',
      scope: 'global',
      capability: 'project.connect',
      handler: ({ store, actor, params, db }) => {
        const projectId = params.projectId ?? '';
        const res = disconnectProject(store, projectId, actor);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        return res;
      },
    },

    // Pipeline
    {
      method: 'GET',
      pattern: '/pipeline/status',
      handler: ({ ps }) => pipelineStatus(ps),
    },
    {
      method: 'GET',
      pattern: '/pipeline/stages',
      handler: ({ ps, query }) => stagesView(ps, query.get('epic')),
    },
    {
      method: 'POST',
      pattern: '/pipeline/pause',
      capability: 'pipeline.pause',
      handler: ({ ps, actor }): PipelineToggle => {
        const affected = pauseProject(ps, actor);
        return { status: pipelineStatus(ps), affected };
      },
    },
    {
      method: 'POST',
      pattern: '/pipeline/resume',
      capability: 'pipeline.pause',
      handler: ({ ps, actor }): PipelineToggle => {
        const affected = resumeProject(ps, actor);
        return { status: pipelineStatus(ps), affected };
      },
    },

    // Epics
    {
      method: 'GET',
      pattern: '/epics',
      handler: ({ ps, query }) =>
        pageOf(epicList(ps, { status: query.get('status'), q: query.get('q') }), intParam(query, 'limit', 100, 200), query.get('cursor')),
    },
    {
      method: 'POST',
      pattern: '/epics/preview',
      capability: 'epic.preview',
      body: PreviewRequestSchema,
      handler: ({ ps, actor, body }) => previewEpic(ps, body.specMarkdown, actor),
    },
    {
      method: 'POST',
      pattern: '/epics',
      capability: 'epic.dispatch',
      body: PreviewRequestSchema,
      status: 202,
      handler: ({ ps, actor, body }) => dispatchEpic(ps, body.specMarkdown, actor),
    },
    {
      method: 'GET',
      pattern: '/epics/:id',
      handler: ({ ps, params }) => epicDetail(ps, params.id ?? ''),
    },
    {
      method: 'POST',
      pattern: '/epics/:id/pause',
      capability: 'epic.pause',
      handler: ({ ps, actor, params }) => {
        const epic = epicById(ps, params.id ?? '');
        pauseEpic(ps, epic, actor);
        return epic;
      },
    },
    {
      method: 'POST',
      pattern: '/epics/:id/resume',
      capability: 'epic.pause',
      handler: ({ ps, actor, params }) => {
        const epic = epicById(ps, params.id ?? '');
        resumeEpic(ps, epic, actor);
        return epic;
      },
    },
    {
      method: 'GET',
      pattern: '/intake',
      handler: ({ ps, query }) => {
        const items = intakeList(ps, intParam(query, 'limit', 20, 100));
        return { items, nextCursor: null };
      },
    },

    // Workpacks
    {
      method: 'GET',
      pattern: '/workpacks',
      handler: ({ ps, query }) => pageOf(listWorkpacks(ps, query), intParam(query, 'limit', 100, 500), query.get('cursor')),
    },
    {
      method: 'POST',
      pattern: '/workpacks',
      capability: 'workpack.create',
      body: CreateWorkpackRequestSchema,
      status: 201,
      handler: ({ ps, actor, body }) => {
        const errors = validateCreate(ps, body);
        if (errors.length > 0) throw invalid(errors as any);
        if (body.holdForReview) requireCapability(actor, 'workpack.holdForReview');
        return createWorkpack(
          ps,
          {
            epicId: body.epicId,
            title: body.title,
            description: body.description,
            priority: body.priority,
            category: body.category,
            targetFiles: body.targetFiles,
            dependsOn: body.dependsOn,
            holdForReview: body.holdForReview,
          },
          actor,
        );
      },
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id',
      handler: ({ ps, params }) => workpackDetail(ps, workpackById(ps, params.id ?? '')),
    },
    {
      method: 'PATCH',
      pattern: '/workpacks/:id',
      capability: 'workpack.holdForReview',
      body: HoldRequestSchema,
      handler: ({ ps, actor, params, req, body }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        return setHoldForReview(ps, wp, body.holdForReview, actor);
      },
    },
    {
      method: 'PATCH',
      pattern: '/workpacks/:id/status',
      body: StatusRequestSchema,
      handler: ({ ps, actor, params, req, body }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        switch (body.status) {
          case 'cancelled':
            return cancelWorkpack(ps, wp, actor);
          case 'in-progress':
            if (wp.status === 'awaiting-review' && !body.text) {
              throw invalid([{ path: 'text', message: 'Say what should change.', code: 'required' }]);
            }
            return requestChanges(ps, wp, body.text ?? '', actor);
          case 'done':
            requireCapability(actor, 'workpack.promote');
            return promoteWorkpack(ps, wp, actor);
          default:
            return transition(ps, wp, body.status, { actor });
        }
      },
    },
    {
      method: 'POST',
      pattern: '/workpacks/:id/request-changes',
      capability: 'workpack.requestChanges',
      body: TextRequestSchema,
      handler: ({ ps, actor, params, req, body }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        return requestChanges(ps, wp, body.text, actor);
      },
    },
    {
      method: 'POST',
      pattern: '/workpacks/:id/pause',
      capability: 'workpack.pause',
      handler: ({ ps, actor, params, req }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        pauseWorkpack(ps, wp, actor);
        return wp;
      },
    },
    {
      method: 'POST',
      pattern: '/workpacks/:id/resume',
      capability: 'workpack.pause',
      handler: ({ ps, actor, params, req }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        resumeWorkpack(ps, wp, actor);
        return wp;
      },
    },
    {
      method: 'POST',
      pattern: '/workpacks/:id/archive',
      capability: 'workpack.archive',
      handler: ({ ps, actor, params, req }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        return archiveWorkpack(ps, wp, actor);
      },
    },
    {
      method: 'POST',
      pattern: '/workpacks/:id/fork',
      capability: 'workpack.fork',
      status: 201,
      handler: ({ ps, actor, params, req }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        return forkWorkpack(ps, wp, actor);
      },
    },
    {
      method: 'POST',
      pattern: '/workpacks/:id/promote',
      capability: 'workpack.promote',
      handler: ({ ps, actor, params, req }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        return promoteWorkpack(ps, wp, actor);
      },
    },
    {
      method: 'POST',
      pattern: '/workpacks/:id/rollback',
      capability: 'workpack.rollback',
      status: 201,
      handler: ({ ps, actor, params, req }) => {
        const wp = workpackById(ps, params.id ?? '');
        const mockReq = new Request('http://localhost', { headers: req.headers as any });
        checkIfMatch(mockReq, wp.version, wp.id);
        return rollbackWorkpack(ps, wp, actor);
      },
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/diff',
      handler: ({ ps, params, query }) => diffView(ps, workpackById(ps, params.id ?? ''), query.get('file')),
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/files',
      handler: ({ ps, params, query }) => {
        const path = query.get('path');
        if (!path) throw invalid([{ path: 'path', message: 'Pass ?path= with a file path.', code: 'required' }]);
        return fileContent(ps, workpackById(ps, params.id ?? ''), path);
      },
    },
    {
      method: 'PUT',
      pattern: '/workpacks/:id/files',
      capability: 'editor.write',
      body: SaveFileRequestSchema,
      handler: ({ ps, actor, params, body }) => {
        const wp = workpackById(ps, params.id ?? '');
        if (!wp.activeRunId) throw conflict('run_not_active', `${wp.id} has no active run, so its files can no longer be edited.`);
        humanSave(ps, wp, body.path, body.content, actor);
        return fileContent(ps, wp, body.path);
      },
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/runs',
      handler: ({ ps, params }) => ps.runs.filter((run) => run.workpackId === workpackById(ps, params.id ?? '').id),
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/gates',
      handler: ({ ps, params }) => gatesView(ps, workpackById(ps, params.id ?? '')),
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/screenshots',
      handler: ({ ps, params }) => ps.screenshots.get(workpackById(ps, params.id ?? '').id) ?? [],
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/release',
      handler: ({ ps, params }) => releaseView(ps, workpackById(ps, params.id ?? '')),
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/repro',
      handler: ({ ps, params }) => reproBundle(ps, workpackById(ps, params.id ?? '')),
    },
    {
      method: 'GET',
      pattern: '/workpacks/:id/contracts',
      handler: ({ ps, params }) => contractsFor(ps, workpackById(ps, params.id ?? '')),
    },
    {
      method: 'POST',
      pattern: '/contracts/:id/unlock',
      capability: 'contract.unlock',
      body: UnlockRequestSchema,
      handler: ({ ps, actor, params, body }) => unlockContract(ps, params.id ?? '', body.reason, actor),
    },

    // Runs & Steering
    {
      method: 'GET',
      pattern: '/runs/:id',
      handler: ({ ps, params }) => runById(ps, params.id ?? ''),
    },
    {
      method: 'GET',
      pattern: '/runs/:id/logs',
      handler: ({ ps, params, query }) => {
        const run = runById(ps, params.id ?? '');
        const level = query.get('level');
        if (level && level !== 'all' && !LogLevelSchema.safeParse(level).success) {
          throw invalid([{ path: 'level', message: 'Use all, info, warn, success, agent or error.', code: 'invalid_value' }]);
        }
        const limit = Math.min(Math.max(Number(query.get('limit')) || 200, 1), 500);
        const entries = (ps.logs.get(run.id) ?? []).filter((e) => !level || level === 'all' || e.level === level);
        return logPage(entries, limit, query.get('cursor'));
      },
    },
    {
      method: 'GET',
      pattern: '/runs/:id/reasoning',
      handler: ({ ps, params }) => ps.reasoning.get(runById(ps, params.id ?? '').id) ?? [],
    },
    {
      method: 'GET',
      pattern: '/runs/:id/steering',
      handler: ({ ps, params }) => steeringState(ps, params.id ?? ''),
    },
    {
      method: 'POST',
      pattern: '/steering/suggest',
      capability: 'steering.suggest',
      body: SuggestRequestSchema,
      status: 201,
      handler: ({ ps, actor, body }) => suggest(ps, body.runId, body.text, actor),
    },
    {
      method: 'POST',
      pattern: '/runs/:id/steer',
      capability: 'steering.inject',
      body: SteerRequestSchema,
      status: 201,
      handler: ({ ps, actor, params, body }) => inject(ps, params.id ?? '', body.text, body.kind, actor),
    },
    {
      method: 'POST',
      pattern: '/steering/:id/approve',
      capability: 'steering.approve',
      body: ApproveRequestSchema,
      handler: ({ ps, actor, params, body }) => approveSuggestion(ps, params.id ?? '', body.kind, actor),
    },
    {
      method: 'POST',
      pattern: '/steering/:id/reject',
      capability: 'steering.reject',
      body: RejectRequestSchema,
      handler: ({ ps, actor, params, body }) => rejectSuggestion(ps, params.id ?? '', body.reason, actor),
    },
    {
      method: 'POST',
      pattern: '/runs/:id/locks',
      capability: 'editor.write',
      body: LockRequestSchema,
      handler: ({ ps, actor, params, body }) => {
        const run = activeRunOf(ps, params.id ?? '');
        const wp = workpackById(ps, run.workpackId);
        acquireLock(ps, wp, body.path, actor);
        return { humanLockedFiles: wp.humanLockedFiles, version: wp.version };
      },
    },
    {
      method: 'DELETE',
      pattern: '/runs/:id/locks',
      capability: 'editor.write',
      handler: ({ ps, actor, params, query }) => {
        const run = runById(ps, params.id ?? '');
        const path = query.get('path');
        if (!path) throw invalid([{ path: 'path', message: 'Pass ?path= with the locked file.', code: 'required' }]);
        const wp = workpackById(ps, run.workpackId);
        releaseLock(ps, wp, path, actor);
        return { humanLockedFiles: wp.humanLockedFiles, version: wp.version };
      },
    },

    // Budget
    {
      method: 'GET',
      pattern: '/budget',
      handler: ({ ps }) => budgetView(ps),
    },
    {
      method: 'PUT',
      pattern: '/budget',
      capability: 'budget.update',
      body: UpdateBudgetRequestSchema,
      handler: ({ ps, actor, body }) => updateBudget(ps, body, actor),
    },
    {
      method: 'GET',
      pattern: '/budget/attribution',
      handler: ({ ps, query }) => {
        const by = AttributionBySchema.safeParse(query.get('by') ?? 'epic');
        if (!by.success) throw invalid([{ path: 'by', message: 'Use epic, agent or source.', code: 'invalid_value' }]);
        return attribution(ps, by.data);
      },
    },

    // Fleet & Agents
    {
      method: 'GET',
      pattern: '/agents',
      handler: ({ ps }) => agentViews(ps),
    },
    {
      method: 'GET',
      pattern: '/agents/:id',
      handler: ({ ps, params }) => agentViewOf(ps, agentById(ps, params.id ?? '')),
    },
    {
      method: 'GET',
      pattern: '/agents/:id/versions',
      handler: ({ ps, params, query }) => versionPage(agentById(ps, params.id ?? ''), query),
    },
    {
      method: 'GET',
      pattern: '/agents/:id/versions/:v',
      handler: ({ ps, params }) => versionOf(agentById(ps, params.id ?? ''), params.v ?? ''),
    },
    {
      method: 'POST',
      pattern: '/agents/:id/versions',
      capability: 'agent.tune',
      body: CreateVersionRequestSchema,
      status: 201,
      handler: ({ ps, actor, params, body }) => createVersion(ps, agentById(ps, params.id ?? ''), body, actor),
    },
    {
      method: 'PUT',
      pattern: '/agents/:id/active-version',
      capability: 'agent.tune',
      body: ActivateVersionRequestSchema,
      handler: ({ ps, actor, params, body }) => activateVersion(ps, agentById(ps, params.id ?? ''), body.version, actor),
    },
    {
      method: 'POST',
      pattern: '/agents/:id/run',
      capability: 'agent.run',
      handler: ({ ps, actor, params }) => runAgentCycle(ps, agentById(ps, params.id ?? ''), actor),
    },
    {
      method: 'GET',
      pattern: '/fleet/stats',
      handler: ({ ps }) => fleetStats(ps),
    },
    {
      method: 'GET',
      pattern: '/models',
      handler: () => modelCatalog(),
    },

    // Settings
    {
      method: 'GET',
      pattern: '/integrations',
      handler: ({ ps }) => ps.integrations,
    },
    {
      method: 'PATCH',
      pattern: '/integrations/:id',
      capability: 'integration.manage',
      body: ToggleSchema,
      handler: ({ ps, actor, params, body }) => setIntegrationEnabled(ps, params.id ?? '', body.enabled, actor),
    },
    {
      method: 'POST',
      pattern: '/integrations/:id/test',
      capability: 'integration.manage',
      handler: ({ ps, actor, params }) => testIntegration(ps, params.id ?? '', actor),
    },
    {
      method: 'PUT',
      pattern: '/integrations/:id/key',
      capability: 'integration.manage',
      body: KeySchema,
      handler: ({ ps, actor, params }) => {
        integrationById(ps, params.id ?? '');
        rotateProviderKey(ps, params.id ?? '', actor);
      },
    },
    {
      method: 'GET',
      pattern: '/policies',
      handler: ({ ps }) => ps.policies,
    },
    {
      method: 'PATCH',
      pattern: '/policies',
      capability: 'policy.update',
      body: PatchPoliciesSchema,
      handler: ({ ps, actor, body }) => updatePolicies(ps, body, actor),
    },
    {
      method: 'GET',
      pattern: '/notifications/slack',
      handler: ({ ps }) => slackView(ps),
    },
    {
      method: 'PUT',
      pattern: '/notifications/slack',
      capability: 'slack.manage',
      body: UpdateSlackRequestSchema,
      handler: ({ ps, actor, body }) => updateSlack(ps, body, actor),
    },
    {
      method: 'POST',
      pattern: '/notifications/slack/test',
      capability: 'slack.manage',
      handler: ({ ps, actor }) => sendSlackTest(ps, actor),
    },
    {
      method: 'GET',
      pattern: '/tokens',
      handler: ({ ps }) => tokenView(ps),
    },
    {
      method: 'POST',
      pattern: '/tokens/rotate',
      capability: 'token.rotate',
      handler: ({ ps, actor }) => rotateToken(ps, actor),
    },
    {
      method: 'POST',
      pattern: '/tokens/revoke',
      capability: 'token.rotate',
      handler: ({ ps, actor }) => revokeToken(ps, actor),
    },
    {
      method: 'GET',
      pattern: '/vault/keys',
      capability: 'vault.manage',
      handler: ({ ps }) => vaultKeys(ps),
    },
    {
      method: 'PUT',
      pattern: '/vault/keys/:name',
      capability: 'vault.manage',
      body: PutVaultSchema,
      handler: ({ ps, actor, params, body }) => putVaultKey(ps, params.name ?? '', body, actor),
    },
    {
      method: 'DELETE',
      pattern: '/vault/keys/:name',
      capability: 'vault.manage',
      handler: ({ ps, actor, params }) => deleteVaultKey(ps, params.name ?? '', actor),
    },
    {
      method: 'GET',
      pattern: '/repository',
      handler: ({ ps }) => ps.repository,
    },

    // Overview & Benchmarks
    {
      method: 'GET',
      pattern: '/overview/metrics',
      handler: ({ ps, query }) => overviewMetrics(ps, query.get('window') as any),
    },
    {
      method: 'GET',
      pattern: '/overview/health',
      handler: ({ ps }) => healthView(ps),
    },
    {
      method: 'POST',
      pattern: '/benchmarks',
      capability: 'benchmark.run',
      status: 202,
      handler: ({ ps, actor }) => startBenchmark(ps, actor),
    },
    {
      method: 'GET',
      pattern: '/benchmarks/latest',
      handler: ({ ps }) => latestBenchmark(ps),
    },

    // Audit & Search
    {
      method: 'GET',
      pattern: '/audit',
      handler: ({ ps, query }) => auditPage(ps, query),
    },
    {
      method: 'GET',
      pattern: '/audit/verify',
      handler: ({ ps, query }) => verifyAudit(ps, query),
    },
    {
      method: 'GET',
      pattern: '/audit/export',
      capability: 'audit.export',
      handler: ({ ps, query }) => exportAudit(ps, query),
    },
    {
      method: 'GET',
      pattern: '/search',
      handler: ({ ps, query }) => searchProject(ps, query.get('q'), query.get('scope')),
    },

    // Webhooks
    {
      method: 'POST',
      pattern: '/webhooks/github',
      scope: 'global',
      auth: 'none',
      handler: ({ store, req, body, params }) => {
        const mockReq = new Request('http://localhost/webhooks/github', {
          method: 'POST',
          headers: req.headers as any,
        });
        return handleGitHubWebhook(store, mockReq, body ?? {}, params);
      },
    },
    {
      method: 'POST',
      pattern: '/webhooks/github/:projectId',
      scope: 'global',
      auth: 'none',
      handler: ({ store, req, body, params }) => {
        const mockReq = new Request(`http://localhost/webhooks/github/${params.projectId}`, {
          method: 'POST',
          headers: req.headers as any,
        });
        return handleGitHubWebhook(store, mockReq, body ?? {}, params);
      },
    },
  ];

  return routes;
}

export function createDispatcher(store: Store, db: DatabaseSync) {
  const rawRoutes = buildRouteRegistry();
  const compiledRoutes: CompiledRoute[] = rawRoutes.map((r) => compileRoute(r));

  return async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (handleCors(req, res)) return;

    const fullUrl = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = fullUrl.pathname;

    // Strip /api/v1 prefix if present
    if (pathname.startsWith('/api/v1')) {
      pathname = pathname.slice('/api/v1'.length);
    }
    if (pathname === '') pathname = '/';

    const method = req.method?.toUpperCase() ?? 'GET';

    // Find matching route
    let matched: CompiledRoute | undefined;
    let matchResult: RegExpMatchArray | null = null;

    for (const route of compiledRoutes) {
      if (route.method === method) {
        matchResult = pathname.match(route.regex);
        if (matchResult) {
          matched = route;
          break;
        }
      }
    }

    if (!matched || !matchResult) {
      sendProblem(res, new ApiProblem(404, 'not_found', `Cannot ${method} ${fullUrl.pathname}`), store);
      return;
    }

    const opts = matched.options;
    const params: Record<string, string> = {};
    matched.paramNames.forEach((name, index) => {
      params[name] = matchResult![index + 1] ?? '';
    });

    try {
      // Auth verification
      const isWebhook = opts.auth === 'none';
      const authHeader = req.headers['authorization'] as string | undefined;
      const queryToken = fullUrl.searchParams.get('token');
      const actor =
        (authHeader ? parseAuth(authHeader) : null) ??
        (queryToken ? parseMockToken(queryToken) : null) ??
        (isWebhook ? SYSTEM_ACTOR : null);

      if (!actor) {
        throw new ApiProblem(401, 'unauthorized', 'Sign in to continue.');
      }

      // Project context
      let ps: ProjectState | undefined;
      if (opts.scope !== 'global') {
        const projectId = (req.headers['x-project'] as string) || fullUrl.searchParams.get('project');
        if (!projectId) {
          throw new ApiProblem(400, 'project_required', 'Send X-Project with the project id.');
        }
        ps = store.projects.get(projectId);
        if (!ps) {
          throw new ApiProblem(404, 'project_not_found', `Project ${projectId} was not found.`);
        }
      }

      // RBAC check
      if (opts.capability && !can(actor.role, opts.capability)) {
        throw forbiddenFor(opts.capability);
      }

      // Read raw body
      const rawBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await readRequestBody(req) : '';

      // Idempotency check
      const idemKey = req.headers['idempotency-key'] as string | undefined;
      const storeKey = idemKey ? `${actor.id}|${idemKey}` : null;
      const fingerprint = longHash(`${method} ${pathname} ${rawBody}`);

      if (storeKey) {
        const prior = getIdempotency(db, storeKey) ?? store.idempotency.get(storeKey);
        if (prior) {
          if (prior.fingerprint !== fingerprint) {
            throw new ApiProblem(422, 'idempotency_conflict', 'This Idempotency-Key was already used with a different request.');
          }
          sendJson(res, prior.status, prior.body ? JSON.parse(prior.body) : null, store, {
            'Content-Type': prior.contentType,
            'idempotent-replayed': 'true',
          });
          return;
        }
      }

      // Body validation
      let bodyData: any = undefined;
      if (opts.body) {
        let parsedJson: any;
        try {
          parsedJson = rawBody === '' ? {} : JSON.parse(rawBody);
        } catch {
          throw new ApiProblem(400, 'invalid_json', 'The request body is not valid JSON.');
        }
        const parsed = opts.body.safeParse(parsedJson);
        if (!parsed.success) {
          const errors = parsed.error.issues.map((i) => ({
            path: i.path.join('.') || 'body',
            message: i.message,
            code: i.code,
          }));
          throw invalid(errors);
        }
        bodyData = parsed.data;
      } else if (rawBody !== '') {
        try {
          bodyData = JSON.parse(rawBody);
        } catch {
          bodyData = rawBody;
        }
      }

      // Execute handler
      const result = await opts.handler({
        store,
        ps: ps as ProjectState,
        actor,
        req,
        res,
        params,
        query: fullUrl.searchParams,
        body: bodyData,
        db,
      });

      // Persist state to SQLite on mutations
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && ps) {
        try {
          saveProject(db, ps);
        } catch (dbErr) {
          console.error('[SQLite] Error persisting project update:', dbErr);
        }
      }

      const status = opts.status ?? (result === undefined ? 204 : 200);

      if (storeKey && status < 500) {
        const respData = {
          fingerprint,
          status,
          body: result === undefined ? '' : JSON.stringify(result),
          contentType: 'application/json',
        };
        store.idempotency.set(storeKey, respData);
        saveIdempotency(db, storeKey, respData);
      }

      sendJson(res, status, result, store);
    } catch (error) {
      if (error instanceof ApiProblem) {
        sendProblem(res, error, store);
      } else {
        const message = error instanceof Error ? error.message : 'Unexpected server error';
        console.error('[API Error]', error);
        sendProblem(res, new ApiProblem(500, 'internal_error', 'Internal server error', { detail: message }), store);
      }
    }
  };
}
