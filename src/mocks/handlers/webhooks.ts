import { http, type HttpHandler } from 'msw/http';
import { handleGitHubWebhook } from '../backend/webhooks';
import type { Router } from '../http';

/**
 * Handlers that accept webhooks from GitHub via an endpoint.
 *
 * Supported endpoints:
 * - `POST /api/v1/webhooks/github` (resolves project via `repository.full_name` or `X-Project`)
 * - `POST /api/v1/webhooks/github/:projectId` (direct project binding)
 * - `POST /webhooks/github` (vanity endpoint without `/api/v1` prefix)
 * - `POST /webhooks/github/:projectId`
 */
export function webhookHandlers(r: Router): HttpHandler[] {
  return [
    // Standard API path: /api/v1/webhooks/github
    r.post('/webhooks/github', { scope: 'global', auth: 'none' }, ({ store, request, body, params }) => {
      const raw = (body ?? {}) as unknown as Record<string, unknown>;
      return handleGitHubWebhook(store, request, raw, params);
    }),

    r.post('/webhooks/github/:projectId', { scope: 'global', auth: 'none' }, ({ store, request, body, params }) => {
      const raw = (body ?? {}) as unknown as Record<string, unknown>;
      return handleGitHubWebhook(store, request, raw, params);
    }),

    // Vanity path without /api/v1 prefix: /webhooks/github
    http.post('*/webhooks/github', async ({ request, params }) => {
      const store = r.store();
      let body: Record<string, unknown> = {};
      try {
        body = ((await request.json()) ?? {}) as Record<string, unknown>;
      } catch {
        // empty body
      }
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) ? (v[0] ?? '') : String(v);
      const res = handleGitHubWebhook(store, request, body, flat);
      return Response.json(res, { status: 200 });
    }),

    http.post('*/webhooks/github/:projectId', async ({ request, params }) => {
      const store = r.store();
      let body: Record<string, unknown> = {};
      try {
        body = ((await request.json()) ?? {}) as Record<string, unknown>;
      } catch {
        // empty body
      }
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) ? (v[0] ?? '') : String(v);
      const res = handleGitHubWebhook(store, request, body, flat);
      return Response.json(res, { status: 200 });
    }),
  ];
}
