import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IntegrationSchema,
  PoliciesSchema,
  PreflightResultSchema,
  ProjectSchema,
  ProjectTokenSchema,
  REQUIRED_PAT_PERMISSIONS,
  RepositorySchema,
  RotateTokenResponseSchema,
  SlackSettingsSchema,
  VaultKeySchema,
  type AuditEntry,
  type Budget,
  type Integration,
  type Me,
  type Paged,
  type PipelineStatus,
  type Policies,
  type PreflightResult,
  type Problem,
  type Project,
  type ProjectToken,
  type Release,
  type ReproBundle,
  type Repository,
  type Role,
  type RotateTokenResponse,
  type SlackSettings,
  type VaultKey,
  type Workpack,
  type FleetStats,
  type Agent,
} from '../../contracts';
import { advanceClock } from '../backend/runtime';
import { seedPlatform } from '../seeds/platform';
import { TEST_NOW_MS, addWorkpack, createWorld, eventTypes, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const populate = () => {
  w.close();
  w = createWorld({ platform: false });
  seedPlatform(w.ps, { populated: true });
};

const NOW = new Date(TEST_NOW_MS).toISOString();
const ROLE_ORDER: Role[] = ['viewer', 'engineer', 'maintainer', 'admin'];
type Failure = Omit<Problem, 'status'>;

const audit = async (action: string, project = 'proj') => (await w.call<Paged<AuditEntry>>('GET', `/audit?action=${action}`, { project })).body.items;
const wpOf = async (id: string) => (await w.call<Workpack>('GET', `/workpacks/${id}`)).body;

/** Every surface a secret could leak through: reads, the audit log, and the event stream. */
async function everywhere(project = 'proj'): Promise<string> {
  const reads = await Promise.all(
    ['/integrations', '/notifications/slack', '/tokens', '/vault/keys', '/policies', '/repository', '/audit?limit=200', '/agents', '/fleet/stats'].map(
      async (path) => (await w.call('GET', path, { role: 'maintainer', project })).body,
    ),
  );
  return JSON.stringify([reads, w.store.projects.get(project)!.events.ring]);
}

/** Role checks: every role below `min` is refused with `requiredRole`, and `min` itself gets through. */
async function expectNeeds(min: Role, method: string, path: string, body?: unknown, project?: string | null): Promise<void> {
  for (const role of ROLE_ORDER.slice(0, ROLE_ORDER.indexOf(min))) {
    const denied = await w.call<Problem>(method, path, { role, body, ...(project === undefined ? {} : { project }) });
    expect(denied.status, `${role} on ${method} ${path}`).toBe(403);
    expect(denied.body).toMatchObject({ type: 'forbidden', requiredRole: min });
  }
  const allowed = await w.call(method, path, { role: min, body, ...(project === undefined ? {} : { project }) });
  expect(allowed.status, `${min} on ${method} ${path}`).not.toBe(403);
}

describe('integrations', () => {
  const list = async () => (await w.call<Integration[]>('GET', '/integrations', { role: 'viewer' })).body;
  const byId = async (id: string) => (await list()).find((i) => i.id === id)!;
  const toggle = (id: string, enabled: boolean, role: Role = 'admin') => w.call<Integration & Failure>('PATCH', `/integrations/${id}`, { role, body: { enabled } });

  it('lists the eight connectors in order, each parsing against the contract', async () => {
    const res = await w.call<Integration[]>('GET', '/integrations', { role: 'viewer' });
    expect(res.status).toBe(200);
    const integrations = res.body.map((i) => IntegrationSchema.parse(i));
    expect(integrations.map((i) => i.id)).toEqual(['github', 'slack', 'anthropic', 'openai', 'deepseek', 'semgrep', 'sentry', 'datadog']);
    expect(integrations.map((i) => i.category)).toEqual([
      'Source control',
      'Notifications',
      'Model provider',
      'Model provider',
      'Model provider',
      'Security scanner',
      'Alert source',
      'Alert source',
    ]);
  });

  it('connects GitHub, the providers and Semgrep on a bare project, and leaves Slack and the alert sources unconnected', async () => {
    const statuses = Object.fromEntries((await list()).map((i) => [i.id, [i.status, i.enabled]]));
    expect(statuses).toEqual({
      github: ['connected', true],
      slack: ['disconnected', false],
      anthropic: ['connected', true],
      openai: ['connected', true],
      deepseek: ['connected', true],
      semgrep: ['connected', true],
      sentry: ['disconnected', false],
      datadog: ['disconnected', false],
    });
  });

  it('connects Slack and Sentry on a populated project, and not Datadog', async () => {
    populate();
    const statuses = Object.fromEntries((await list()).map((i) => [i.id, i.status]));
    expect(statuses).toMatchObject({ github: 'connected', slack: 'connected', sentry: 'connected', datadog: 'disconnected' });
  });

  it('gives the alert sources a webhook URL and nothing else has one', async () => {
    for (const i of await list()) {
      if (i.category === 'Alert source') expect(i.webhookUrl, i.id).toMatch(new RegExp(`^https://.+/${i.id}/proj$`));
      else expect(i.webhookUrl, i.id).toBeNull();
    }
  });

  it('says what Semgrep and GitHub are pinned to', async () => {
    expect((await byId('semgrep')).details).toMatch(/rule pack v1\.88\.0 pinned/i);
    expect((await byId('github')).details).toContain('acme/app');
  });

  it('dates the last verification', async () => {
    populate();
    const github = await byId('github');
    expect(Date.parse(github.lastVerifiedAt!)).toBeLessThan(TEST_NOW_MS);
    expect((await byId('datadog')).lastVerifiedAt).toBeNull();
  });

  describe('turning one off and on', () => {
    it('is for an admin', async () => {
      await expectNeeds('admin', 'PATCH', '/integrations/semgrep', { enabled: false });
    });

    it('pauses a connector without touching work, and shows it as paused', async () => {
      const wp = addWorkpack(w.ps, { status: 'in-progress' });
      const res = await toggle('semgrep', false);
      expect(res.status).toBe(200);
      expect(IntegrationSchema.parse(res.body)).toMatchObject({ id: 'semgrep', enabled: false, status: 'paused' });
      expect(await byId('semgrep')).toMatchObject({ enabled: false, status: 'paused' });
      expect((await wpOf(wp.id)).paused).toBe(false);

      expect(await toggle('semgrep', true)).toMatchObject({ body: { enabled: true, status: 'connected' } });
    });

    it('pauses every open workpack with integration-disabled when GitHub goes off, and says so in queue and pipeline', async () => {
      const running = addWorkpack(w.ps, { status: 'in-progress' });
      const queued = addWorkpack(w.ps, { status: 'queued' });
      const done = addWorkpack(w.ps, { status: 'done' });

      const res = await toggle('github', false);
      expect(res.body).toMatchObject({ id: 'github', enabled: false, status: 'paused' });
      for (const wp of [running, queued]) expect(await wpOf(wp.id), wp.id).toMatchObject({ paused: true, pausedReasons: ['integration-disabled'] });
      expect(await wpOf(done.id)).toMatchObject({ paused: false, pausedReasons: [] });
      expect((await wpOf(queued.id)).queuedReason).toBe('integration-off');
      const pipeline = (await w.call<PipelineStatus>('GET', '/pipeline/status')).body;
      expect(pipeline).toMatchObject({ paused: true });
      expect(pipeline.pausedReasons).toContain('integration-disabled');
    });

    it('resumes them, P0 first, when GitHub comes back, and clears the queue reason', async () => {
      const p2 = addWorkpack(w.ps, { status: 'in-progress', priority: 'P2 Normal' });
      const p0 = addWorkpack(w.ps, { status: 'in-progress', priority: 'P0 Blocker' });
      const queued = addWorkpack(w.ps, { status: 'queued' });
      await toggle('github', false);
      w.ps.events.ring.length = 0;

      const res = await toggle('github', true);
      expect(res.body).toMatchObject({ enabled: true, status: 'connected' });
      for (const wp of [p2, p0, queued]) expect(await wpOf(wp.id), wp.id).toMatchObject({ paused: false, pausedReasons: [] });
      expect((await wpOf(queued.id)).queuedReason).toBeNull();
      const resumed = w.ps.events.ring.filter((e) => e.event.type === 'workpack.resumed').map((e) => (e.event as { workpackId: string }).workpackId);
      expect(resumed.indexOf(p0.id)).toBeLessThan(resumed.indexOf(p2.id));
    });

    it('leaves a pause by hand alone when GitHub comes back', async () => {
      const wp = addWorkpack(w.ps, { status: 'in-progress' });
      await w.call('POST', `/workpacks/${wp.id}/pause`, { role: 'engineer', headers: { 'if-match': String(wp.version) } });
      await toggle('github', false);
      expect((await wpOf(wp.id)).pausedReasons).toEqual(['manual-workpack', 'integration-disabled']);
      await toggle('github', true);
      expect((await wpOf(wp.id)).pausedReasons).toEqual(['manual-workpack']);
    });

    it('announces the change on the stream and records it in the audit log', async () => {
      addWorkpack(w.ps, { status: 'in-progress' });
      addWorkpack(w.ps, { status: 'queued' });
      await toggle('github', false);
      const updated = w.ps.events.ring.find((e) => e.event.type === 'integration.updated')!;
      expect(updated.event).toEqual({ type: 'integration.updated', integrationId: 'github', enabled: false, status: 'paused' });
      const [entry] = await audit('integration.updated');
      expect(entry).toMatchObject({ actor: 'u-admin', target: { integrationId: 'github', enabled: false, pausedWorkpacks: 2 } });

      await toggle('github', true);
      const [latest] = await audit('integration.updated');
      expect(latest).toMatchObject({ target: { integrationId: 'github', enabled: true, resumedWorkpacks: 2 } });
    });

    it('does nothing, and records nothing, when the value is already what was asked for', async () => {
      const res = await toggle('github', true);
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(await audit('integration.updated')).toHaveLength(0);
      expect(eventTypes(w.ps)).not.toContain('integration.updated');
    });

    it('enables a connector that is not connected without pretending it is', async () => {
      const res = await toggle('datadog', true);
      expect(res.body).toMatchObject({ enabled: true, status: 'disconnected' });
    });

    it('answers 404 for an unknown connector and 422 for a body that is not a boolean', async () => {
      expect((await toggle('jira', true)).status).toBe(404);
      const bad = await w.call<Problem>('PATCH', '/integrations/github', { role: 'admin', body: { enabled: 'yes' } });
      expect(bad.status).toBe(422);
      expect(bad.body.errors?.[0]?.path).toBe('enabled');
    });

    it('shows a provider as offline in the fleet stats while its integration is off', async () => {
      await toggle('openai', false);
      const stats = (await w.call<FleetStats>('GET', '/fleet/stats')).body;
      expect(stats.providers.find((p) => p.id === 'openai')).toMatchObject({ status: 'offline' });
      expect(stats.providers.filter((p) => p.status === 'online')).toHaveLength(2);
      await toggle('openai', true);
      expect((await w.call<FleetStats>('GET', '/fleet/stats')).body.providers.every((p) => p.status === 'online')).toBe(true);
    });
  });

  describe('connectivity test', () => {
    const test = (id: string, role: Role = 'admin') => w.call<{ ok: boolean; latencyMs: number; message: string } & Failure>('POST', `/integrations/${id}/test`, { role });

    it('is for an admin', async () => {
      await expectNeeds('admin', 'POST', '/integrations/github/test');
    });

    it('reports success with a latency and a message that names what it reached', async () => {
      for (const id of ['github', 'anthropic', 'semgrep']) {
        const res = await test(id);
        expect(res.status, id).toBe(200);
        expect(res.body.ok, id).toBe(true);
        expect(res.body.latencyMs, id).toBeGreaterThanOrEqual(80);
        expect(res.body.latencyMs, id).toBeLessThanOrEqual(400);
        expect(res.body.message.length, id).toBeGreaterThan(10);
      }
      expect((await test('github')).body.message).toContain('acme/app');
    });

    it('stamps the verification time on success', async () => {
      advanceClock(w.store, 90_000);
      await test('openai');
      expect((await byId('openai')).lastVerifiedAt).toBe(new Date(TEST_NOW_MS + 90_000).toISOString());
    });

    it('says plainly that a disabled connector was not tested', async () => {
      await toggle('anthropic', false);
      const res = await test('anthropic');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: false, latencyMs: 0 });
      expect(res.body.message).toMatch(/disabled/i);
    });

    it('says plainly that an unconnected connector was not tested', async () => {
      const res = await test('datadog');
      expect(res.body).toMatchObject({ ok: false });
      expect(res.body.message).toMatch(/not connected/i);
    });

    it('answers 404 for an unknown connector', async () => {
      expect((await test('jira')).status).toBe(404);
    });
  });

  describe('write-only provider keys', () => {
    const SECRET = 'sk-ant-api03-SUPERSECRETKEYVALUE0123456789';
    const rotate = (id: string, value: unknown = SECRET, role: Role = 'admin') => w.call<Failure>('PUT', `/integrations/${id}/key`, { role, body: { value } });

    it('is for an admin', async () => {
      await expectNeeds('admin', 'PUT', '/integrations/anthropic/key', { value: SECRET });
    });

    it('accepts the key with 204 and no body, and refreshes the verification time', async () => {
      advanceClock(w.store, 60_000);
      const res = await rotate('anthropic');
      expect(res.status).toBe(204);
      expect(res.body).toBeNull();
      expect((await byId('anthropic')).lastVerifiedAt).toBe(new Date(TEST_NOW_MS + 60_000).toISOString());
      expect(w.ps.events.ring.find((e) => e.event.type === 'integration.updated')!.event).toMatchObject({ integrationId: 'anthropic' });
    });

    it('never shows the value anywhere: not in reads, the audit log, or the stream', async () => {
      await rotate('anthropic');
      await rotate('openai', 'sk-proj-ANOTHERSECRETVALUE9876543210');
      const seen = await everywhere();
      expect(seen).not.toContain('SUPERSECRETKEYVALUE');
      expect(seen).not.toContain('ANOTHERSECRETVALUE');
      expect(seen).not.toContain('0123456789');
    });

    it('audits the rotation by connector only', async () => {
      await rotate('deepseek');
      const [entry] = await audit('integration.key_rotated');
      expect(entry).toMatchObject({ actor: 'u-admin', target: { integrationId: 'deepseek' } });
      expect(Object.keys(entry!.target)).toEqual(['integrationId']);
    });

    it('takes a key for model providers only', async () => {
      for (const id of ['github', 'slack', 'semgrep', 'sentry']) {
        const res = await rotate(id);
        expect(res.status, id).toBe(422);
        expect(res.body.type).toBe('validation_failed');
      }
      expect((await rotate('jira')).status).toBe(404);
    });

    it('requires a value', async () => {
      const res = await w.call<Problem>('PUT', '/integrations/anthropic/key', { role: 'admin', body: {} });
      expect(res.status).toBe(422);
      expect(res.body.errors?.[0]?.path).toBe('value');
      expect((await rotate('anthropic', '   ')).status).toBe(422);
    });
  });
});

describe('governance policies', () => {
  const patch = (body: unknown, role: Role = 'admin') => w.call<Policies & Failure>('PATCH', '/policies', { role, body });
  const policies = async () => (await w.call<Policies>('GET', '/policies', { role: 'viewer' })).body;

  it('starts with the §11.3 defaults and is readable by a viewer', async () => {
    const res = await w.call<Policies>('GET', '/policies', { role: 'viewer' });
    expect(res.status).toBe(200);
    expect(PoliciesSchema.parse(res.body)).toEqual({
      autoMergeVerifiedPRs: false,
      humanSignoffP0P1Schema: true,
      sastStrictness: 'strict',
      slaEscalation: true,
      hardBudgetTripwire: true,
    });
  });

  it('is changed by an admin only', async () => {
    await expectNeeds('admin', 'PATCH', '/policies', { slaEscalation: false });
  });

  it('changes only what it is given and returns the result', async () => {
    const res = await patch({ sastStrictness: 'standard', autoMergeVerifiedPRs: true });
    expect(res.status).toBe(200);
    expect(PoliciesSchema.parse(res.body)).toEqual({
      autoMergeVerifiedPRs: true,
      humanSignoffP0P1Schema: true,
      sastStrictness: 'standard',
      slaEscalation: true,
      hardBudgetTripwire: true,
    });
    expect(await policies()).toEqual(res.body);
  });

  it('keeps the hard budget tripwire on: it can be sent as true, never as false', async () => {
    expect((await patch({ hardBudgetTripwire: true, slaEscalation: false })).body.hardBudgetTripwire).toBe(true);
    const res = await patch({ hardBudgetTripwire: false });
    expect(res.status).toBe(422);
    expect(res.body.errors?.map((e) => e.path)).toContain('hardBudgetTripwire');
    expect((await policies()).hardBudgetTripwire).toBe(true);
  });

  it('rejects a value outside the options', async () => {
    const res = await patch({ sastStrictness: 'lenient' });
    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.path).toBe('sastStrictness');
    expect(await policies()).toMatchObject({ sastStrictness: 'strict' });
  });

  it('writes one audit entry listing each field that changed, with old and new values', async () => {
    await patch({ sastStrictness: 'standard', slaEscalation: false, humanSignoffP0P1Schema: true });
    const entries = await audit('policy.updated');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor: 'u-admin',
      target: {
        changed: ['sastStrictness', 'slaEscalation'],
        sastStrictness: { from: 'strict', to: 'standard' },
        slaEscalation: { from: true, to: false },
      },
    });
  });

  it('records nothing when nothing changed', async () => {
    expect((await patch({})).status).toBe(200);
    expect((await patch({ slaEscalation: true })).status).toBe(200);
    expect(await audit('policy.updated')).toHaveLength(0);
  });

  it('takes effect: turning off sign-off removes the requirement from a P0 workpack’s release', async () => {
    const wp = addWorkpack(w.ps, { status: 'awaiting-review', priority: 'P0 Blocker' });
    const signoff = async () => (await w.call<Release>('GET', `/workpacks/${wp.id}/release`)).body.signoff.find((s) => s.id === 'human-signoff')!.state;
    expect(await signoff()).toBe('unmet');
    await patch({ humanSignoffP0P1Schema: false });
    expect(await signoff()).toBe('na');
  });
});

describe('Slack notifications', () => {
  const WEBHOOK = 'https://hooks.slack.com/services/T01ABCDEF/B02GHIJKL/xYz123SecretSecretSecret';
  const MASKED = 'https://hooks.slack.com/services/T0…/B0…/••••••••';
  const put = (body: unknown, role: Role = 'admin') => w.call<SlackSettings & Failure>('PUT', '/notifications/slack', { role, body });
  const get = async () => (await w.call<SlackSettings>('GET', '/notifications/slack', { role: 'viewer' })).body;

  it('is unconfigured on a bare project, and readable by a viewer', async () => {
    const res = await w.call<SlackSettings>('GET', '/notifications/slack', { role: 'viewer' });
    expect(res.status).toBe(200);
    expect(SlackSettingsSchema.parse(res.body)).toEqual({
      webhookConfigured: false,
      webhookMasked: null,
      channel: '#factory-alerts',
      oncallHandle: '',
      routing: { budget: true, review: true, failure: true, sla: true },
    });
  });

  it('is configured on a populated project, with the webhook masked', async () => {
    populate();
    expect(await get()).toEqual({
      webhookConfigured: true,
      webhookMasked: MASKED,
      channel: '#factory-alerts',
      oncallHandle: '@studio-oncall',
      routing: { budget: true, review: true, failure: true, sla: true },
    });
  });

  it('is changed by an admin only', async () => {
    await expectNeeds('admin', 'PUT', '/notifications/slack', { channel: '#ops' });
  });

  it('stores the webhook and shows it only as T0…/B0…/••••••••', async () => {
    const res = await put({ webhookUrl: WEBHOOK, channel: '#eng-alerts', oncallHandle: '@oncall', routing: { sla: false } });
    expect(res.status).toBe(200);
    expect(SlackSettingsSchema.parse(res.body)).toEqual({
      webhookConfigured: true,
      webhookMasked: MASKED,
      channel: '#eng-alerts',
      oncallHandle: '@oncall',
      routing: { budget: true, review: true, failure: true, sla: false },
    });
    expect(await get()).toEqual(res.body);
    expect(w.ps.slack.rawWebhook).toBe(WEBHOOK);
  });

  it('never lets the raw webhook out: not in reads, the audit log, or the stream', async () => {
    await put({ webhookUrl: WEBHOOK });
    const seen = await everywhere();
    expect(seen).not.toContain('SecretSecretSecret');
    expect(seen).not.toContain('T01ABCDEF');
    expect(seen).not.toContain('rawWebhook');
  });

  it('changes only the fields it is given, and keeps the stored webhook', async () => {
    await put({ webhookUrl: WEBHOOK, oncallHandle: '@oncall' });
    const res = await put({ channel: '#ops' });
    expect(res.body).toMatchObject({ channel: '#ops', oncallHandle: '@oncall', webhookMasked: MASKED, webhookConfigured: true });
    expect(w.ps.slack.rawWebhook).toBe(WEBHOOK);
  });

  it('rejects a webhook that is not a URL and an empty channel, naming the field', async () => {
    const bad = await put({ webhookUrl: 'not a url', channel: '' });
    expect(bad.status).toBe(422);
    expect(bad.body.errors?.map((e) => e.path).sort()).toEqual(['channel', 'webhookUrl']);
    expect(await get()).toMatchObject({ webhookConfigured: false });
  });

  it('turns the Slack integration on, and gives the budget modal the same channel', async () => {
    await put({ webhookUrl: WEBHOOK, channel: '#eng-alerts' });
    const slack = (await w.call<Integration[]>('GET', '/integrations')).body.find((i) => i.id === 'slack')!;
    expect(slack).toMatchObject({ status: 'connected', enabled: true });
    expect(slack.details).toContain('#eng-alerts');
    expect((await w.call<Budget>('GET', '/budget')).body.slackChannel).toBe('#eng-alerts');
    expect(w.ps.events.ring.some((e) => e.event.type === 'integration.updated' && (e.event as { integrationId: string }).integrationId === 'slack')).toBe(true);
  });

  it('audits the change by field name, without the webhook', async () => {
    await put({ webhookUrl: WEBHOOK, channel: '#eng-alerts', routing: { review: false } });
    const [entry] = await audit('slack.updated');
    expect(entry).toMatchObject({ actor: 'u-admin' });
    expect(entry!.target.changed).toEqual(['webhookUrl', 'channel', 'routing.review']);
    expect(entry!.target.channel).toEqual({ from: '#factory-alerts', to: '#eng-alerts' });
    expect(entry!.target['routing.review']).toEqual({ from: true, to: false });
    expect(entry!.target.webhookUrl).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('hooks.slack.com');
  });

  describe('test message', () => {
    const send = (role: Role = 'admin') => w.call<{ ok: boolean; channel: string; sentAt: string } & Failure>('POST', '/notifications/slack/test', { role });

    it('is for an admin', async () => {
      await put({ webhookUrl: WEBHOOK });
      await expectNeeds('admin', 'POST', '/notifications/slack/test');
    });

    it('answers 409 slack_not_configured until a webhook is set', async () => {
      const res = await send();
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('slack_not_configured');
    });

    it('sends to the configured channel and says when', async () => {
      await put({ webhookUrl: WEBHOOK, channel: '#eng-alerts' });
      const res = await send();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, channel: '#eng-alerts', sentAt: NOW });
    });
  });
});

describe('project token', () => {
  const rotate = (role: Role = 'admin') => w.call<RotateTokenResponse & Failure>('POST', '/tokens/rotate', { role });
  const revoke = (role: Role = 'admin') => w.call<ProjectToken & Failure>('POST', '/tokens/revoke', { role });
  const info = async () => (await w.call<ProjectToken>('GET', '/tokens', { role: 'viewer' })).body;

  it('shows a bare project’s token masked: prefix, last four, created, never used', async () => {
    const res = await w.call<ProjectToken>('GET', '/tokens', { role: 'viewer' });
    expect(res.status).toBe(200);
    const token = ProjectTokenSchema.parse(res.body);
    expect(token).toMatchObject({ prefix: 'fct_', revoked: false, lastUsedAt: null, lastUsedBy: null, lastUsedClient: null });
    expect(token.last4).toMatch(/^[a-z0-9]{4}$/);
    expect(Object.keys(res.body).sort()).toEqual(['createdAt', 'createdBy', 'last4', 'lastUsedAt', 'lastUsedBy', 'lastUsedClient', 'prefix', 'revoked']);
  });

  it('shows who last used a populated project’s token, from where, and when', async () => {
    populate();
    const token = await info();
    expect(token).toMatchObject({ prefix: 'fct_', createdBy: 'Austin Akers', lastUsedBy: 'factory CLI', lastUsedClient: 'cli' });
    expect(TEST_NOW_MS - Date.parse(token.lastUsedAt!)).toBe(12 * 60_000);
    expect(TEST_NOW_MS - Date.parse(token.createdAt)).toBe(6 * 86_400_000);
  });

  describe('regenerate', () => {
    it('is for an admin', async () => {
      await expectNeeds('admin', 'POST', '/tokens/rotate');
    });

    it('returns a new value exactly once: fct_ and 32 lowercase letters or digits', async () => {
      const res = await rotate();
      expect(res.status).toBe(200);
      const { token, info: fresh } = RotateTokenResponseSchema.parse(res.body);
      expect(token).toMatch(/^fct_[a-z0-9]{32}$/);
      expect(fresh).toMatchObject({ prefix: 'fct_', last4: token.slice(-4), createdAt: NOW, createdBy: 'Test admin', revoked: false });
      expect(await info()).toEqual(fresh);
    });

    it('clears the last use, and un-revokes', async () => {
      populate();
      await revoke();
      const { body } = await rotate();
      expect(body.info).toMatchObject({ lastUsedAt: null, lastUsedBy: null, lastUsedClient: null, revoked: false, createdBy: 'Test admin' });
    });

    it('draws from the seeded generator, so values differ from call to call and repeat from run to run', async () => {
      const first = (await rotate()).body.token;
      const second = (await rotate()).body.token;
      expect(second).not.toBe(first);

      w.close();
      w = createWorld();
      expect((await rotate()).body.token).toBe(first);
    });

    it('never lets the value out again: not in reads, the audit log, or the stream', async () => {
      const { token } = (await rotate()).body;
      const seen = await everywhere();
      expect(seen).not.toContain(token);
      expect(seen).not.toContain(token.slice(4));
    });

    it('announces token.rotated and audits it without the value', async () => {
      await rotate();
      expect(w.ps.events.ring.find((e) => e.event.type === 'token.rotated')!.event).toEqual({ type: 'token.rotated', actor: 'Test admin' });
      const [entry] = await audit('token.rotated');
      expect(entry).toMatchObject({ actor: 'u-admin', actorName: 'Test admin' });
    });
  });

  describe('revoke', () => {
    it('is for an admin', async () => {
      await expectNeeds('admin', 'POST', '/tokens/revoke');
    });

    it('invalidates the token at once and announces token.rotated', async () => {
      const res = await revoke();
      expect(res.status).toBe(200);
      expect(ProjectTokenSchema.parse(res.body)).toMatchObject({ revoked: true });
      expect((await info()).revoked).toBe(true);
      expect(w.ps.events.ring.filter((e) => e.event.type === 'token.rotated')).toHaveLength(1);
      expect(await audit('token.revoked')).toHaveLength(1);
      expect(await audit('token.rotated')).toHaveLength(0);
    });

    it('does nothing the second time', async () => {
      await revoke();
      expect((await revoke()).body.revoked).toBe(true);
      expect(await audit('token.revoked')).toHaveLength(1);
      expect(w.ps.events.ring.filter((e) => e.event.type === 'token.rotated')).toHaveLength(1);
    });
  });
});

describe('test-secret vault', () => {
  const VALUE = 'hunter2-VAULTSECRETVALUE-4242';
  const keys = async () => (await w.call<VaultKey[]>('GET', '/vault/keys', { role: 'maintainer' })).body;
  const put = (name: string, body: unknown, role: Role = 'maintainer') => w.call<VaultKey & Failure>('PUT', `/vault/keys/${name}`, { role, body });

  it('is for a maintainer on every endpoint, including the list', async () => {
    await expectNeeds('maintainer', 'GET', '/vault/keys');
    await expectNeeds('maintainer', 'PUT', '/vault/keys/API_TOKEN', { value: VALUE });
    await expectNeeds('maintainer', 'DELETE', '/vault/keys/API_TOKEN');
  });

  it('lists a populated project’s three keys with their allow-lists, and a bare project’s none', async () => {
    expect(await keys()).toEqual([]);
    populate();
    const list = (await w.call<VaultKey[]>('GET', '/vault/keys', { role: 'maintainer' })).body.map((k) => VaultKeySchema.parse(k));
    expect(list.map((k) => [k.name, k.allowedGates])).toEqual([
      ['PLAYWRIGHT_TEST_TOKEN', ['tests.e2e_viewports']],
      ['STAGING_BASIC_AUTH', ['tests.e2e_viewports']],
      ['SENTRY_AUTH_TOKEN', []],
    ]);
    expect(list[0]).toMatchObject({ createdBy: 'Mira Okafor', rotatedAt: expect.any(String), lastUsedAt: expect.any(String) });
    expect(list[2]!.lastUsedAt).toBeNull();
  });

  it('creates a key from a name, a write-only value and the gates that may receive it', async () => {
    const res = await put('API_TOKEN', { value: VALUE, allowedGates: ['tests.e2e_viewports', 'tests.unit_integration'] });
    expect(res.status).toBe(200);
    expect(VaultKeySchema.parse(res.body)).toEqual({
      name: 'API_TOKEN',
      allowedGates: ['tests.e2e_viewports', 'tests.unit_integration'],
      createdBy: 'Test maintainer',
      createdAt: NOW,
      rotatedAt: null,
      lastUsedAt: null,
    });
    expect((await keys()).map((k) => k.name)).toEqual(['API_TOKEN']);
  });

  it('defaults to no gates', async () => {
    expect((await put('API_TOKEN', { value: VALUE })).body.allowedGates).toEqual([]);
  });

  it('requires a value to create a key, naming the field', async () => {
    const res = await put('API_TOKEN', { allowedGates: [] });
    expect(res.status).toBe(422);
    expect(res.body.type).toBe('validation_failed');
    expect(res.body.errors?.map((e) => e.path)).toEqual(['value']);
    expect(await keys()).toEqual([]);
  });

  it.each([
    ['lower case', 'api_token'],
    ['too short', 'AB'],
    ['a leading digit', '1ABC'],
    ['a dash', 'API-TOKEN'],
    ['more than 64 characters', `A${'B'.repeat(64)}`],
  ])('refuses a name with %s, naming the field', async (_label, name) => {
    const res = await put(name, { value: VALUE });
    expect(res.status).toBe(422);
    expect(res.body.errors?.map((e) => e.path)).toContain('name');
    expect(await keys()).toEqual([]);
  });

  it('accepts the shortest and longest names', async () => {
    expect((await put('ABC', { value: VALUE })).status).toBe(200);
    expect((await put(`A${'B'.repeat(63)}`, { value: VALUE })).status).toBe(200);
  });

  it('accepts only gate ids in an allow-list', async () => {
    const res = await put('API_TOKEN', { value: VALUE, allowedGates: ['tests.e2e_viewports', 'deploy.production'] });
    expect(res.status).toBe(422);
    expect(res.body.errors?.[0]?.path).toMatch(/^allowedGates/);
  });

  it('rotates a key: new value, rotation time set, creation and allow-list kept', async () => {
    await put('API_TOKEN', { value: VALUE, allowedGates: ['tests.e2e_viewports'] });
    advanceClock(w.store, 3_600_000);
    const res = await put('API_TOKEN', { value: 'a-newer-secret-value' }, 'admin');
    expect(res.body).toMatchObject({ name: 'API_TOKEN', createdBy: 'Test maintainer', createdAt: NOW, rotatedAt: new Date(TEST_NOW_MS + 3_600_000).toISOString(), allowedGates: ['tests.e2e_viewports'] });
    expect(await keys()).toHaveLength(1);
  });

  it('edits only the allow-list when no value is given, leaving the rotation time alone', async () => {
    await put('API_TOKEN', { value: VALUE, allowedGates: ['tests.e2e_viewports'] });
    const res = await put('API_TOKEN', { allowedGates: ['security.sast_sbom'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ allowedGates: ['security.sast_sbom'], rotatedAt: null });
    expect((await put('API_TOKEN', { allowedGates: [] })).body.allowedGates).toEqual([]);
  });

  it('never returns, logs or audits a value', async () => {
    await put('API_TOKEN', { value: VALUE, allowedGates: ['tests.e2e_viewports'] });
    await put('API_TOKEN', { value: 'ROTATEDVAULTSECRETVALUE' });
    const seen = await everywhere();
    expect(seen).not.toContain('VAULTSECRETVALUE');
    expect(seen).not.toContain('ROTATEDVAULTSECRETVALUE');
    expect(seen).not.toContain('hunter2');
  });

  it('audits each write by name and gate list: created, rotated, or re-scoped', async () => {
    await put('API_TOKEN', { value: VALUE, allowedGates: ['tests.e2e_viewports'] });
    await put('API_TOKEN', { value: 'a-newer-secret-value' });
    await put('API_TOKEN', { allowedGates: [] });
    const entries = (await audit('vault.key_written')).reverse();
    expect(entries.map((e) => e.target)).toEqual([
      { name: 'API_TOKEN', allowedGates: ['tests.e2e_viewports'], created: true, rotated: false },
      { name: 'API_TOKEN', allowedGates: ['tests.e2e_viewports'], created: false, rotated: true },
      { name: 'API_TOKEN', allowedGates: [], created: false, rotated: false },
    ]);
    expect(entries[0]).toMatchObject({ actor: 'u-maintainer' });
  });

  it('deletes a key with 204, 404s on a key that is not there, and lets the name be reused', async () => {
    await put('API_TOKEN', { value: VALUE });
    const res = await w.call('DELETE', '/vault/keys/API_TOKEN', { role: 'maintainer' });
    expect(res.status).toBe(204);
    expect(await keys()).toEqual([]);
    expect((await w.call<Problem>('DELETE', '/vault/keys/API_TOKEN', { role: 'maintainer' })).status).toBe(404);
    expect((await put('API_TOKEN', { allowedGates: [] })).status).toBe(422);
    expect((await put('API_TOKEN', { value: VALUE })).body.rotatedAt).toBeNull();
    const [entry] = await audit('vault.key_deleted');
    expect(entry).toMatchObject({ target: { name: 'API_TOKEN' } });
  });

  it('lists a key in the repro bundle’s redacted environment only while a gate may receive it', async () => {
    const wp = addWorkpack(w.ps, { status: 'verification' });
    await put('GATED_KEY', { value: VALUE, allowedGates: ['tests.e2e_viewports'] });
    await put('UNUSED_KEY', { value: VALUE });
    const bundle = (await w.call<ReproBundle>('GET', `/workpacks/${wp.id}/repro`)).body;
    expect(bundle.envRedacted).toEqual(['GATED_KEY=<redacted>']);
  });
});

describe('repository', () => {
  it('describes the connected repository: branch, language, webhook and the six token permissions', async () => {
    const res = await w.call<Repository>('GET', '/repository', { role: 'viewer' });
    expect(res.status).toBe(200);
    const repo = RepositorySchema.parse(res.body);
    expect(repo).toMatchObject({
      fullName: 'acme/app',
      defaultBranch: 'main',
      language: 'TypeScript',
      languageSupported: true,
      webhookActive: true,
      intakeLabel: 'factory',
      lastSyncAt: null,
    });
    expect(repo.permissions.map((p) => p.name)).toEqual([...REQUIRED_PAT_PERMISSIONS]);
    expect(repo.permissions.every((p) => p.granted)).toBe(true);
  });

  it('shows a populated project as synced a few minutes ago', async () => {
    populate();
    const repo = (await w.call<Repository>('GET', '/repository')).body;
    expect(TEST_NOW_MS - Date.parse(repo.lastSyncAt!)).toBeGreaterThanOrEqual(2 * 60_000);
    expect(TEST_NOW_MS - Date.parse(repo.lastSyncAt!)).toBeLessThanOrEqual(10 * 60_000);
  });

  it('answers with a null body for a project that has no repository', async () => {
    w.ps.repository = null;
    const res = await w.call<Repository | null>('GET', '/repository');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('is seeded again from the project’s own repository when the project is re-seeded', async () => {
    w.ps.project.repo = 'octocat/hello-world';
    w.ps.project.defaultBranch = 'develop';
    seedPlatform(w.ps, { populated: false });
    expect((await w.call<Repository>('GET', '/repository')).body).toMatchObject({ fullName: 'octocat/hello-world', defaultBranch: 'develop' });
    expect((await w.call<Integration[]>('GET', '/integrations')).body[0]!.details).toContain('octocat/hello-world');
  });
});

describe('connecting a repository', () => {
  const PAT = `github_pat_${'A1b2C3d4E5f6G7h8I9j0'}KLMNOP`;
  const preflight = (body: Record<string, unknown>, role: Role = 'admin') =>
    w.call<PreflightResult & Failure>('POST', '/projects/connect/preflight', { project: null, role, body: { token: PAT, ...body } });
  const check = (result: PreflightResult, id: string) => result.checks.find((c) => c.id === id)!;

  describe('preflight', () => {
    it('is for an admin, needs no project, and ignores one if sent', async () => {
      await expectNeeds('admin', 'POST', '/projects/connect/preflight', { repo: 'acme/new-app', token: PAT }, null);
      expect((await w.call('POST', '/projects/connect/preflight', { role: 'admin', body: { repo: 'acme/new-app', token: PAT } })).status).toBe(200);
    });

    it('passes a healthy repository with the eight checks in order, only the webhook being optional', async () => {
      const res = await preflight({ repo: 'acme/new-app' });
      expect(res.status).toBe(200);
      const result = PreflightResultSchema.parse(res.body);
      expect(result).toMatchObject({ repo: 'acme/new-app', ok: true });
      expect(result.checks.map((c) => c.id)).toEqual(['token-valid', 'permissions', 'repo-access', 'default-branch', 'language', 'webhook', 'label', 'index']);
      expect(result.checks.map((c) => c.required)).toEqual([true, true, true, true, true, false, false, false]);
      expect(result.checks.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'warn', 'pass', 'pass']);
      for (const c of result.checks) {
        expect(c.label.length, c.id).toBeGreaterThan(0);
        expect(c.detail.length, c.id).toBeGreaterThan(0);
      }
    });

    it('lists all six required permissions on a pass, and explains the optional webhook', async () => {
      const result = (await preflight({ repo: 'acme/new-app' })).body;
      for (const name of REQUIRED_PAT_PERMISSIONS) expect(check(result, 'permissions').detail).toContain(name);
      expect(check(result, 'webhook').detail).toBe('Created automatically when the token has Webhooks: Read and write; otherwise follow the manual steps');
      expect(check(result, 'label').detail).toBe('The factory label exists or will be created');
      expect(check(result, 'index').detail).toBe('Initial code index queued');
    });

    it.each([
      ['an owner/repo pair', 'octocat/hello-world'],
      ['a URL', 'https://github.com/octocat/hello-world'],
      ['a URL with .git', 'https://github.com/octocat/hello-world.git'],
      ['a URL with a trailing slash', 'https://github.com/octocat/hello-world/'],
      ['a URL into a branch', 'https://github.com/octocat/hello-world/tree/main'],
      ['a URL without the scheme', 'github.com/octocat/hello-world'],
      ['an SSH remote', 'git@github.com:octocat/hello-world.git'],
      ['spaces around it', '  octocat/hello-world  '],
    ])('normalizes %s to owner/repo', async (_label, repo) => {
      expect((await preflight({ repo })).body.repo).toBe('octocat/hello-world');
    });

    it.each([
      ['not a github_pat_ token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
      ['too short', 'github_pat_abc'],
      ['empty', ''],
    ])('fails the token check for a token that is %s, and offers the fix', async (_label, token) => {
      const result = (await preflight({ repo: 'acme/new-app', token })).body;
      expect(result.ok).toBe(false);
      expect(check(result, 'token-valid')).toMatchObject({ status: 'fail', required: true, fix: 'Create a fine-grained token scoped to this repository' });
    });

    it('fails a token ending in -limited for exactly the two permissions it lacks', async () => {
      const result = (await preflight({ repo: 'acme/new-app', token: `${PAT}-limited` })).body;
      expect(result.ok).toBe(false);
      expect(check(result, 'token-valid').status).toBe('pass');
      const permissions = check(result, 'permissions');
      expect(permissions).toMatchObject({ status: 'fail', required: true });
      expect(permissions.detail).toContain('Issues: Read and write');
      expect(permissions.detail).toContain('Deployments: Read');
      for (const granted of ['Contents: Read and write', 'Pull requests: Read and write', 'Checks: Read and write', 'Metadata: Read']) {
        expect(permissions.detail).not.toContain(granted);
      }
      expect(permissions.fix).toEqual(expect.any(String));
    });

    it('fails a repository whose name contains “missing”, or that is not owner/repo', async () => {
      for (const repo of ['acme/missing-app', 'justaname', 'a/b/c']) {
        const result = (await preflight({ repo })).body;
        expect(result.ok, repo).toBe(false);
        expect(check(result, 'repo-access'), repo).toMatchObject({ status: 'fail', required: true });
        expect(check(result, 'repo-access').fix, repo).toEqual(expect.any(String));
      }
    });

    it('checks the default branch: main when none is given, a missing one fails', async () => {
      expect(check((await preflight({ repo: 'acme/new-app' })).body, 'default-branch').status).toBe('pass');
      expect(check((await preflight({ repo: 'acme/new-app', defaultBranch: 'develop' })).body, 'default-branch').status).toBe('pass');
      const result = (await preflight({ repo: 'acme/new-app', defaultBranch: 'nonexistent' })).body;
      expect(result.ok).toBe(false);
      expect(check(result, 'default-branch')).toMatchObject({ status: 'fail', required: true });
      expect(check(result, 'default-branch').fix).toEqual(expect.any(String));
    });

    it.each(['acme/python-etl', 'acme/django-shop', 'acme/rails-blog', 'acme/java-api', 'acme/golang-svc', 'acme/rust-cli', 'acme/my_python_app', 'acme/Rust-Tools'])(
      'blocks %s as an unsupported language',
      async (repo) => {
        const result = (await preflight({ repo })).body;
        expect(result.ok, repo).toBe(false);
        expect(check(result, 'language')).toMatchObject({ status: 'fail', required: true });
        expect(check(result, 'language').detail).toContain('unsupported_language');
      },
    );

    it.each(['acme/javascript-utils', 'acme/typescript-starter', 'acme/trust-center', 'acme/trails-app', 'acme/frontend'])('does not mistake %s for another language', async (repo) => {
      const result = (await preflight({ repo })).body;
      expect(check(result, 'language').status, repo).toBe('pass');
      expect(result.ok, repo).toBe(true);
    });

    it('gives every failed check a fix and every passed check none', async () => {
      const result = (await preflight({ repo: 'acme/missing-django', token: 'nope', defaultBranch: 'nonexistent' })).body;
      for (const c of result.checks) {
        if (c.status === 'fail') expect(c.fix, c.id).toEqual(expect.any(String));
        if (c.status === 'pass') expect(c.fix, c.id).toBeNull();
      }
    });

    it('still passes when only the optional webhook is a warning', async () => {
      const result = (await preflight({ repo: 'acme/new-app' })).body;
      expect(check(result, 'webhook')).toMatchObject({ status: 'warn', required: false });
      expect(result.ok).toBe(true);
    });
  });

  describe('connect', () => {
    const body = (over: Record<string, unknown> = {}) => ({ repo: 'https://github.com/acme/new-app', token: PAT, monthlyCapUsd: 1200, ...over });
    const connect = (over: Record<string, unknown> = {}, role: Role = 'admin') =>
      w.call<Project & Failure>('POST', '/projects/connect', { project: null, role, body: body(over) });
    const inProject = <T,>(path: string, project = 'acme-new-app', role: Role = 'admin') => w.call<T>('GET', path, { project, role });

    it('is for an admin, and needs no project', async () => {
      await expectNeeds('admin', 'POST', '/projects/connect', body({ repo: 'acme/other-app' }), null);
    });

    it('creates the project from the repository and answers 201 with it', async () => {
      const res = await connect({ defaultBranch: 'develop' });
      expect(res.status).toBe(201);
      expect(ProjectSchema.parse(res.body)).toEqual({ id: 'acme-new-app', name: 'new-app', repo: 'acme/new-app', defaultBranch: 'develop', createdAt: NOW });

      const projects = (await w.call<Project[]>('GET', '/projects', { project: null })).body;
      expect(projects.map((p) => p.id)).toEqual(['proj', 'acme-new-app']);
      const me = (await w.call<Me>('GET', '/me', { project: null })).body;
      expect(me.projects.map((p) => p.id)).toEqual(['proj', 'acme-new-app']);
    });

    it('sets the cap, soft limit and the two governance toggles from the request', async () => {
      await connect({ monthlyCapUsd: 1200, softLimitPercent: 70, autoMergeVerifiedPRs: true, humanSignoffP0P1Schema: false });
      const budget = (await inProject<Budget>('/budget')).body;
      expect(budget).toMatchObject({ monthlyCapUsdMicros: 1_200_000_000, softLimitPercent: 70, spendUsdMicros: 0, hardCapHit: false });
      expect((await inProject<Policies>('/policies')).body).toMatchObject({ autoMergeVerifiedPRs: true, humanSignoffP0P1Schema: false, sastStrictness: 'strict', slaEscalation: true });
    });

    it('defaults to main, an 80% soft limit, auto-merge off and sign-off on', async () => {
      const res = await connect();
      expect(res.body.defaultBranch).toBe('main');
      expect((await inProject<Budget>('/budget')).body.softLimitPercent).toBe(80);
      expect((await inProject<Policies>('/policies')).body).toMatchObject({ autoMergeVerifiedPRs: false, humanSignoffP0P1Schema: true });
    });

    it('starts it bare: six specialists on version 1, the repository described, nothing running', async () => {
      await connect({ defaultBranch: 'develop' });
      const agents = (await inProject<Agent[]>('/agents')).body;
      expect(agents).toHaveLength(6);
      expect(agents.every((a) => a.activeVersion === 1 && a.tokens24h === 0 && a.status === 'idle')).toBe(true);
      expect((await inProject<Repository>('/repository')).body).toMatchObject({
        fullName: 'acme/new-app',
        defaultBranch: 'develop',
        language: 'TypeScript',
        webhookActive: true,
        permissions: REQUIRED_PAT_PERMISSIONS.map((name) => ({ name, granted: true })),
      });
      const integrations = (await inProject<Integration[]>('/integrations')).body;
      expect(integrations.find((i) => i.id === 'github')).toMatchObject({ status: 'connected', enabled: true });
      expect(integrations.find((i) => i.id === 'github')!.details).toContain('acme/new-app');
      expect(integrations.find((i) => i.id === 'sentry')!.webhookUrl).toContain('acme-new-app');
      expect((await inProject<Paged<Workpack>>('/workpacks')).body.items).toEqual([]);
    });

    it('leaves the first project as it was', async () => {
      await connect({ monthlyCapUsd: 99, autoMergeVerifiedPRs: true });
      expect((await w.call<Budget>('GET', '/budget')).body.monthlyCapUsdMicros).toBe(5_000_000_000);
      expect((await w.call<Policies>('GET', '/policies')).body.autoMergeVerifiedPRs).toBe(false);
      expect((await w.call<Repository>('GET', '/repository')).body.fullName).toBe('acme/app');
    });

    it('audits the connection in the new project’s chain, and nowhere else', async () => {
      await connect({ monthlyCapUsd: 1200 });
      const [entry] = await audit('project.connected', 'acme-new-app');
      expect(entry).toMatchObject({ projectId: 'acme-new-app', actor: 'u-admin', actorName: 'Test admin', target: { repo: 'acme/new-app', monthlyCapUsd: 1200 } });
      expect(await audit('project.connected', 'proj')).toHaveLength(0);
      const verify = (await w.call<{ ok: boolean; checked: number }>('GET', '/audit/verify', { project: 'acme-new-app' })).body;
      expect(verify).toMatchObject({ ok: true, checked: 1 });
    });

    it('never stores or shows the token: only its last four characters appear, on the GitHub card', async () => {
      await connect();
      const seen = await everywhere('acme-new-app');
      expect(seen).not.toContain(PAT);
      expect(seen).not.toContain(PAT.slice(0, -4));
      const github = (await inProject<Integration[]>('/integrations')).body.find((i) => i.id === 'github')!;
      expect(github.details).toContain(PAT.slice(-4));
      const token = (await inProject<ProjectToken>('/tokens')).body;
      expect(ProjectTokenSchema.parse(token)).toMatchObject({ prefix: 'fct_', createdBy: 'Test admin', revoked: false });
    });

    it('refuses an unsupported language with 422 unsupported_language, and creates nothing', async () => {
      const res = await connect({ repo: 'acme/django-shop' });
      expect(res.status).toBe(422);
      expect(res.body.type).toBe('unsupported_language');
      expect(res.body.errors?.[0]).toMatchObject({ path: 'repo', code: 'unsupported_language' });
      expect((await w.call<Project[]>('GET', '/projects', { project: null })).body).toHaveLength(1);
    });

    it('reports each failed required check as a field error, once per field, and creates nothing', async () => {
      const res = await connect({ repo: 'acme/missing-app', token: 'short-token-x', defaultBranch: 'nonexistent' });
      expect(res.status).toBe(422);
      expect(res.body.type).toBe('validation_failed');
      expect(res.body.errors?.map((e) => e.path)).toEqual(['token', 'repo', 'defaultBranch']);
      expect(res.body.errors!.every((e) => e.message.length > 0)).toBe(true);
      expect((await w.call<Project[]>('GET', '/projects', { project: null })).body).toHaveLength(1);
    });

    it('refuses a token that lacks permissions', async () => {
      const res = await connect({ token: `${PAT}-limited` });
      expect(res.status).toBe(422);
      expect(res.body.errors?.map((e) => e.path)).toEqual(['token']);
    });

    it('answers 409 already_connected for a repository that is a project, however it is written', async () => {
      for (const repo of ['acme/app', 'https://github.com/ACME/App.git']) {
        const res = await connect({ repo });
        expect(res.status, repo).toBe(409);
        expect(res.body.type).toBe('already_connected');
      }
      await connect();
      expect((await connect()).body.type).toBe('already_connected');
      expect((await w.call<Project[]>('GET', '/projects', { project: null })).body).toHaveLength(2);
    });

    it('rejects a body that is missing its cap or has a soft limit out of range', async () => {
      const noCap = await w.call<Problem>('POST', '/projects/connect', { project: null, role: 'admin', body: { repo: 'acme/new-app', token: PAT } });
      expect(noCap.status).toBe(422);
      expect(noCap.body.errors?.map((e) => e.path)).toContain('monthlyCapUsd');
      const range = await connect({ softLimitPercent: 20 });
      expect(range.status).toBe(422);
      expect(range.body.errors?.map((e) => e.path)).toContain('softLimitPercent');
    });

    it('gives projects whose names flatten to the same id different ids', async () => {
      expect((await connect({ repo: 'a/b-c' })).body.id).toBe('a-b-c');
      expect((await connect({ repo: 'a-b/c' })).body.id).toBe('a-b-c-2');
    });

    it('makes the new project’s fleet work like any other', async () => {
      await connect();
      const { config } = (await inProject<Agent>('/agents/codecraft')).body;
      const saved = await w.call<{ version: number; status: string }>('POST', '/agents/codecraft/versions', {
        project: 'acme-new-app',
        role: 'maintainer',
        body: { config: { ...config, limits: { ...config.limits, maxTurns: 44 } } },
      });
      expect(saved.status).toBe(201);
      expect(saved.body).toMatchObject({ version: 2, status: 'evaluating' });
    });
  });
});
