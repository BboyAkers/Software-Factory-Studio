import type { HttpHandler } from 'msw/http';
import { ActivateVersionRequestSchema, CreateVersionRequestSchema } from '../../contracts';
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
} from '../backend/agents';
import type { Router } from '../http';

export function fleetHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/agents', ({ ps }) => agentViews(ps)),

    r.get('/agents/:id', ({ ps, params }) => agentViewOf(ps, agentById(ps, params.id ?? ''))),

    r.get('/agents/:id/versions', ({ ps, params, query }) => versionPage(agentById(ps, params.id ?? ''), query)),

    r.get('/agents/:id/versions/:v', ({ ps, params }) => versionOf(agentById(ps, params.id ?? ''), params.v ?? '')),

    r.post('/agents/:id/versions', { capability: 'agent.tune', body: CreateVersionRequestSchema, status: 201 }, ({ ps, actor, params, body }) =>
      createVersion(ps, agentById(ps, params.id ?? ''), body, actor),
    ),

    r.put('/agents/:id/active-version', { capability: 'agent.tune', body: ActivateVersionRequestSchema }, ({ ps, actor, params, body }) =>
      activateVersion(ps, agentById(ps, params.id ?? ''), body.version, actor),
    ),

    r.post('/agents/:id/run', { capability: 'agent.run' }, ({ ps, actor, params }) => runAgentCycle(ps, agentById(ps, params.id ?? ''), actor)),

    r.get('/fleet/stats', ({ ps }) => fleetStats(ps)),

    r.get('/models', () => modelCatalog()),
  ];
}
