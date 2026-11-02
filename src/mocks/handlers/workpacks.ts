import type { HttpHandler } from 'msw/http';
import { z } from 'zod';
import { CreateWorkpackRequestSchema, WorkpackStatusSchema, type FieldError, type Priority, type Workpack } from '../../contracts';
import { diffView, fileContent, humanSave } from '../backend/files';
import { promoteWorkpack } from '../backend/quality';
import { nowMs, pageOf } from '../backend/runtime';
import type { ProjectState } from '../backend/store';
import {
  archiveWorkpack,
  cancelWorkpack,
  createWorkpack,
  forkWorkpack,
  pauseWorkpack,
  requestChanges,
  resumeWorkpack,
  rollbackWorkpack,
  setHoldForReview,
  transition,
  workpackById,
  workpackDetail,
} from '../backend/workpacks';
import { checkIfMatch, conflict, invalid, requireCapability, type Router } from '../http';

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

/** Task Matrix listing: filters of spec §10.2, newest first. */
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
      // The window only applies to finished work, so the Done column shows the last day and nothing else is hidden.
      if (doneWindow !== null && w.status === 'done' && now - Date.parse(w.completedAt ?? w.createdAt) > doneWindow) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}

/** Target files are workspace-relative paths or globs. */
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

function validateCreate(ps: ProjectState, body: z.infer<typeof CreateWorkpackRequestSchema>): FieldError[] {
  const errors: FieldError[] = [];
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

const StatusRequestSchema = z.object({
  status: WorkpackStatusSchema,
  /** Required when moving an awaiting-review workpack back to in-progress: the reviewer's request. */
  text: z.string().trim().min(3).max(1000).optional(),
});
const TextRequestSchema = z.object({ text: z.string().trim().min(3, 'Say what should change.').max(1000) });
const HoldRequestSchema = z.object({ holdForReview: z.boolean() });
const SaveFileRequestSchema = z.object({ path: z.string().min(1), content: z.string().max(200_000) });

export function workpackHandlers(r: Router): HttpHandler[] {
  const load = (ps: ProjectState, id: string | undefined) => workpackById(ps, id ?? '');

  return [
    r.get('/workpacks', ({ ps, query }) => pageOf(listWorkpacks(ps, query), intParam(query, 'limit', 100, 500), query.get('cursor'))),

    r.post('/workpacks', { capability: 'workpack.create', body: CreateWorkpackRequestSchema, status: 201 }, ({ ps, actor, body }) => {
      const errors = validateCreate(ps, body);
      if (errors.length > 0) throw invalid(errors);
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
    }),

    r.get('/workpacks/:id', ({ ps, params }) => workpackDetail(ps, load(ps, params.id))),

    r.patch('/workpacks/:id', { capability: 'workpack.holdForReview', body: HoldRequestSchema }, ({ ps, actor, params, request, body }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      return setHoldForReview(ps, wp, body.holdForReview, actor);
    }),

    r.patch('/workpacks/:id/status', { body: StatusRequestSchema }, ({ ps, actor, params, request, body }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
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
          // Nothing else is a manual move: the state machine answers with 409 and the allowed targets.
          return transition(ps, wp, body.status, { actor });
      }
    }),

    r.post('/workpacks/:id/request-changes', { capability: 'workpack.requestChanges', body: TextRequestSchema }, ({ ps, actor, params, request, body }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      return requestChanges(ps, wp, body.text, actor);
    }),

    r.post('/workpacks/:id/pause', { capability: 'workpack.pause' }, ({ ps, actor, params, request }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      pauseWorkpack(ps, wp, actor);
      return wp;
    }),

    r.post('/workpacks/:id/resume', { capability: 'workpack.pause' }, ({ ps, actor, params, request }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      resumeWorkpack(ps, wp, actor);
      return wp;
    }),

    r.post('/workpacks/:id/archive', { capability: 'workpack.archive' }, ({ ps, actor, params, request }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      return archiveWorkpack(ps, wp, actor);
    }),

    r.post('/workpacks/:id/fork', { capability: 'workpack.fork', status: 201 }, ({ ps, actor, params, request }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      return forkWorkpack(ps, wp, actor);
    }),

    r.post('/workpacks/:id/promote', { capability: 'workpack.promote' }, ({ ps, actor, params, request }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      return promoteWorkpack(ps, wp, actor);
    }),

    r.post('/workpacks/:id/rollback', { capability: 'workpack.rollback', status: 201 }, ({ ps, actor, params, request }) => {
      const wp = load(ps, params.id);
      checkIfMatch(request, wp.version, wp.id);
      return rollbackWorkpack(ps, wp, actor);
    }),

    r.get('/workpacks/:id/diff', ({ ps, params, query }) => diffView(ps, load(ps, params.id), query.get('file'))),

    r.get('/workpacks/:id/files', ({ ps, params, query }) => {
      const path = query.get('path');
      if (!path) throw invalid([{ path: 'path', message: 'Pass ?path= with a file path.', code: 'required' }]);
      return fileContent(ps, load(ps, params.id), path);
    }),

    r.put('/workpacks/:id/files', { capability: 'editor.write', body: SaveFileRequestSchema }, ({ ps, actor, params, body }) => {
      const wp = load(ps, params.id);
      if (!wp.activeRunId) throw conflict('run_not_active', `${wp.id} has no active run, so its files can no longer be edited.`);
      humanSave(ps, wp, body.path, body.content, actor);
      return fileContent(ps, wp, body.path);
    }),

    r.get('/workpacks/:id/runs', ({ ps, params }) => ps.runs.filter((run) => run.workpackId === load(ps, params.id).id)),
  ];
}
