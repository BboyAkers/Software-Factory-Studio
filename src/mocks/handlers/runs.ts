import type { HttpHandler } from 'msw/http';
import { z } from 'zod';
import {
  ApproveRequestSchema,
  LogLevelSchema,
  RejectRequestSchema,
  SteerRequestSchema,
  SuggestRequestSchema,
  type LogEntry,
  type Paged,
} from '../../contracts';
import { acquireLock, releaseLock, runById, workpackById } from '../backend/workpacks';
import { approveSuggestion, inject, rejectSuggestion, steeringState, suggest } from '../backend/steering';
import type { ProjectState } from '../backend/store';
import { conflict, invalid, type Router } from '../http';

const LockRequestSchema = z.object({ path: z.string().min(1) });

const seqOf = (entry: LogEntry): number => Number(entry.id.replace(/^log-/, '')) || 0;

/**
 * Newest-first paging for a log that grows at the end: `cursor` is the sequence number of the oldest
 * entry the client already has, and a page holds the entries just before it, oldest first.
 */
export function logPage(entries: readonly LogEntry[], limit: number, cursor: string | null): Paged<LogEntry> {
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

export function runHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/runs/:id', ({ ps, params }) => runById(ps, params.id ?? '')),

    r.get('/runs/:id/logs', ({ ps, params, query }) => {
      const run = runById(ps, params.id ?? '');
      const level = query.get('level');
      if (level && level !== 'all' && !LogLevelSchema.safeParse(level).success) {
        throw invalid([{ path: 'level', message: 'Use all, info, warn, success, agent or error.', code: 'invalid_value' }]);
      }
      const limit = Math.min(Math.max(Number(query.get('limit')) || 200, 1), 500);
      const entries = (ps.logs.get(run.id) ?? []).filter((e) => !level || level === 'all' || e.level === level);
      return logPage(entries, limit, query.get('cursor'));
    }),

    r.get('/runs/:id/reasoning', ({ ps, params }) => ps.reasoning.get(runById(ps, params.id ?? '').id) ?? []),

    r.get('/runs/:id/steering', ({ ps, params }) => steeringState(ps, params.id ?? '')),

    r.post('/steering/suggest', { capability: 'steering.suggest', body: SuggestRequestSchema, status: 201 }, ({ ps, actor, body }) =>
      suggest(ps, body.runId, body.text, actor),
    ),

    r.post('/runs/:id/steer', { capability: 'steering.inject', body: SteerRequestSchema, status: 201 }, ({ ps, actor, params, body }) =>
      inject(ps, params.id ?? '', body.text, body.kind, actor),
    ),

    r.post('/steering/:id/approve', { capability: 'steering.approve', body: ApproveRequestSchema }, ({ ps, actor, params, body }) =>
      approveSuggestion(ps, params.id ?? '', body.kind, actor),
    ),

    r.post('/steering/:id/reject', { capability: 'steering.reject', body: RejectRequestSchema }, ({ ps, actor, params, body }) =>
      rejectSuggestion(ps, params.id ?? '', body.reason, actor),
    ),

    r.post('/runs/:id/locks', { capability: 'editor.write', body: LockRequestSchema }, ({ ps, actor, params, body }) => {
      const run = activeRunOf(ps, params.id ?? '');
      const wp = workpackById(ps, run.workpackId);
      acquireLock(ps, wp, body.path, actor);
      return { humanLockedFiles: wp.humanLockedFiles, version: wp.version };
    }),

    r.delete('/runs/:id/locks', { capability: 'editor.write' }, ({ ps, actor, params, query }) => {
      const run = runById(ps, params.id ?? '');
      const path = query.get('path');
      if (!path) throw invalid([{ path: 'path', message: 'Pass ?path= with the locked file.', code: 'required' }]);
      const wp = workpackById(ps, run.workpackId);
      releaseLock(ps, wp, path, actor);
      return { humanLockedFiles: wp.humanLockedFiles, version: wp.version };
    }),
  ];
}
