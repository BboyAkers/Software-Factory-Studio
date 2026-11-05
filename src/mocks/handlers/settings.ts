import type { HttpHandler } from 'msw/http';
import { z } from 'zod';
import { ConnectRequestSchema, GateIdSchema, PutVaultKeyRequestSchema, UpdatePoliciesRequestSchema, UpdateSlackRequestSchema } from '../../contracts';
import { connectProject, disconnectProject, runPreflight } from '../backend/connect';
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
} from '../backend/settings';
import type { Router } from '../http';

const ToggleSchema = z.object({ enabled: z.boolean() });
const KeySchema = z.object({ value: z.string().trim().min(1, 'Enter the key.') });

/** The tripwire is displayed, never edited: it may be sent back as `true`, never as anything else. */
const PatchPoliciesSchema = UpdatePoliciesRequestSchema.extend({
  hardBudgetTripwire: z.literal(true, { error: 'The hard budget tripwire is always on.' }).optional(),
});

/** Omitting the allow-list leaves it as it is, so rotating a value cannot silently clear it. */
const PutVaultSchema = PutVaultKeyRequestSchema.extend({ allowedGates: z.array(GateIdSchema).optional() });

const PreflightRequestSchema = z.object({ repo: z.string(), token: z.string(), defaultBranch: z.string().optional() });

export function settingsHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/integrations', ({ ps }) => ps.integrations),

    r.patch('/integrations/:id', { capability: 'integration.manage', body: ToggleSchema }, ({ ps, actor, params, body }) =>
      setIntegrationEnabled(ps, params.id ?? '', body.enabled, actor),
    ),

    r.post('/integrations/:id/test', { capability: 'integration.manage' }, ({ ps, actor, params }) => testIntegration(ps, params.id ?? '', actor)),

    r.put('/integrations/:id/key', { capability: 'integration.manage', body: KeySchema }, ({ ps, actor, params }) => {
      integrationById(ps, params.id ?? '');
      rotateProviderKey(ps, params.id ?? '', actor);
    }),

    r.get('/policies', ({ ps }) => ps.policies),

    r.patch('/policies', { capability: 'policy.update', body: PatchPoliciesSchema }, ({ ps, actor, body }) => updatePolicies(ps, body, actor)),

    r.get('/notifications/slack', ({ ps }) => slackView(ps)),

    r.put('/notifications/slack', { capability: 'slack.manage', body: UpdateSlackRequestSchema }, ({ ps, actor, body }) => updateSlack(ps, body, actor)),

    r.post('/notifications/slack/test', { capability: 'slack.manage' }, ({ ps, actor }) => sendSlackTest(ps, actor)),

    r.get('/tokens', ({ ps }) => tokenView(ps)),

    r.post('/tokens/rotate', { capability: 'token.rotate' }, ({ ps, actor }) => rotateToken(ps, actor)),

    r.post('/tokens/revoke', { capability: 'token.rotate' }, ({ ps, actor }) => revokeToken(ps, actor)),

    r.get('/vault/keys', { capability: 'vault.manage' }, ({ ps }) => vaultKeys(ps)),

    r.put('/vault/keys/:name', { capability: 'vault.manage', body: PutVaultSchema }, ({ ps, actor, params, body }) =>
      putVaultKey(ps, params.name ?? '', body, actor),
    ),

    r.delete('/vault/keys/:name', { capability: 'vault.manage' }, ({ ps, actor, params }) => deleteVaultKey(ps, params.name ?? '', actor)),

    r.get('/repository', ({ ps }) => ps.repository),

    r.post('/projects/connect/preflight', { scope: 'global', capability: 'project.connect', body: PreflightRequestSchema }, ({ body }) => runPreflight(body)),

    r.post('/projects/connect', { scope: 'global', capability: 'project.connect', body: ConnectRequestSchema, status: 201 }, ({ store, actor, body }) =>
      connectProject(store, body, actor),
    ),

    r.delete('/projects/:projectId', { scope: 'global', capability: 'project.connect' }, ({ store, actor, params }) => {
      const projectId = params.projectId ?? '';
      return disconnectProject(store, projectId, actor);
    }),

    r.post('/projects/:projectId/disconnect', { scope: 'global', capability: 'project.connect' }, ({ store, actor, params }) => {
      const projectId = params.projectId ?? '';
      return disconnectProject(store, projectId, actor);
    }),
  ];
}
