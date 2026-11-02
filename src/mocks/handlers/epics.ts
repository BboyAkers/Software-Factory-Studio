import type { HttpHandler } from 'msw/http';
import { PreviewRequestSchema, type PipelineToggle } from '../../contracts';
import { dispatchEpic, epicDetail, epicList, intakeList, pipelineStatus, previewEpic, stagesView } from '../backend/epics';
import { pageOf } from '../backend/runtime';
import { epicById, pauseEpic, pauseProject, resumeEpic, resumeProject } from '../backend/workpacks';
import type { Router } from '../http';

const intParam = (query: URLSearchParams, name: string, fallback: number, max: number): number => {
  const n = Number(query.get(name));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
};

export function epicHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/pipeline/status', ({ ps }) => pipelineStatus(ps)),

    r.get('/pipeline/stages', ({ ps, query }) => stagesView(ps, query.get('epic'))),

    r.post('/pipeline/pause', { capability: 'pipeline.pause' }, ({ ps, actor }): PipelineToggle => {
      const affected = pauseProject(ps, actor);
      return { status: pipelineStatus(ps), affected };
    }),

    r.post('/pipeline/resume', { capability: 'pipeline.pause' }, ({ ps, actor }): PipelineToggle => {
      const affected = resumeProject(ps, actor);
      return { status: pipelineStatus(ps), affected };
    }),

    r.get('/epics', ({ ps, query }) =>
      pageOf(epicList(ps, { status: query.get('status'), q: query.get('q') }), intParam(query, 'limit', 100, 200), query.get('cursor')),
    ),

    r.post('/epics/preview', { capability: 'epic.preview', body: PreviewRequestSchema }, ({ ps, actor, body }) =>
      previewEpic(ps, body.specMarkdown, actor),
    ),

    r.post('/epics', { capability: 'epic.dispatch', body: PreviewRequestSchema, status: 202 }, ({ ps, actor, body }) =>
      dispatchEpic(ps, body.specMarkdown, actor),
    ),

    r.get('/epics/:id', ({ ps, params }) => epicDetail(ps, params.id ?? '')),

    r.post('/epics/:id/pause', { capability: 'epic.pause' }, ({ ps, actor, params }) => {
      const epic = epicById(ps, params.id ?? '');
      pauseEpic(ps, epic, actor);
      return epic;
    }),

    r.post('/epics/:id/resume', { capability: 'epic.pause' }, ({ ps, actor, params }) => {
      const epic = epicById(ps, params.id ?? '');
      resumeEpic(ps, epic, actor);
      return epic;
    }),

    r.get('/intake', ({ ps, query }) => {
      const items = intakeList(ps, intParam(query, 'limit', 20, 100));
      return { items, nextCursor: null };
    }),
  ];
}
