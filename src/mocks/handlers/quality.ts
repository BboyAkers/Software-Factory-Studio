import type { HttpHandler } from 'msw/http';
import { z } from 'zod';
import { attribution, updateBudget } from '../backend/budget';
import { contractsFor, gatesView, releaseView, reproBundle, unlockContract } from '../backend/quality';
import { budgetView } from '../backend/runtime';
import { workpackById } from '../backend/workpacks';
import { AttributionBySchema, UpdateBudgetRequestSchema } from '../../contracts';
import { invalid, type Router } from '../http';

/** Maintainers must say why a locked contract is being opened (spec §16.7). */
const UnlockRequestSchema = z.object({
  reason: z.string().trim().min(10, 'Give a reason of at least 10 characters.').max(500),
});

export function qualityHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/workpacks/:id/gates', ({ ps, params }) => gatesView(ps, workpackById(ps, params.id ?? ''))),

    r.get('/workpacks/:id/screenshots', ({ ps, params }) => ps.screenshots.get(workpackById(ps, params.id ?? '').id) ?? []),

    r.get('/workpacks/:id/release', ({ ps, params }) => releaseView(ps, workpackById(ps, params.id ?? ''))),

    r.get('/workpacks/:id/repro', ({ ps, params }) => reproBundle(ps, workpackById(ps, params.id ?? ''))),

    r.get('/workpacks/:id/contracts', ({ ps, params }) => contractsFor(ps, workpackById(ps, params.id ?? ''))),

    r.post('/contracts/:id/unlock', { capability: 'contract.unlock', body: UnlockRequestSchema }, ({ ps, actor, params, body }) =>
      unlockContract(ps, params.id ?? '', body.reason, actor),
    ),
  ];
}

export function budgetHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/budget', ({ ps }) => budgetView(ps)),

    r.put('/budget', { capability: 'budget.update', body: UpdateBudgetRequestSchema }, ({ ps, actor, body }) => updateBudget(ps, body, actor)),

    r.get('/budget/attribution', ({ ps, query }) => {
      const by = AttributionBySchema.safeParse(query.get('by') ?? 'epic');
      if (!by.success) throw invalid([{ path: 'by', message: 'Use epic, agent or source.', code: 'invalid_value' }]);
      return attribution(ps, by.data);
    }),
  ];
}
