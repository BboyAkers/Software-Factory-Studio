import type {
  ConnectivityResult,
  FieldError,
  GateId,
  Integration,
  Policies,
  ProjectToken,
  RotateTokenResponse,
  SlackSettings,
  UpdatePoliciesRequest,
  UpdateSlackRequest,
  VaultKey,
} from '../../contracts';
import { sha256Hex } from '../../domain/auditChain';
import { conflict, invalid, notFound } from '../http';
import { hash32 } from './codegen';
import { emit, nowIso, nowMs, recordAudit, rngOf } from './runtime';
import type { Actor, ProjectState } from './store';
import { holdAll, refreshQueue, releaseAll } from './workpacks';

type Change = { from: unknown; to: unknown };

// ---------------------------------------------------------------------------
// Integrations (spec §10.2, §13)
// ---------------------------------------------------------------------------

const PROVIDER_IDS: readonly string[] = ['anthropic', 'openai', 'deepseek'];

export function integrationById(ps: ProjectState, id: string): Integration {
  const integration = ps.integrations.find((i) => i.id === id);
  if (!integration) throw notFound('Integration', id);
  return integration;
}

/** What a paused connector goes back to when it is enabled again. */
const restingStatus = new WeakMap<Integration, Integration['status']>();

function announce(ps: ProjectState, integration: Integration): void {
  emit(ps, { type: 'integration.updated', integrationId: integration.id, enabled: integration.enabled, status: integration.status });
}

/**
 * Enable or disable a connector. Disabling GitHub pauses every open workpack (`integration-disabled`);
 * enabling it resumes them in priority order and lets the queue move again (spec §13.1).
 */
export function setIntegrationEnabled(ps: ProjectState, id: string, enabled: boolean, actor: Actor): Integration {
  const integration = integrationById(ps, id);
  if (integration.enabled === enabled) return integration;

  integration.enabled = enabled;
  if (!enabled && (integration.status === 'connected' || integration.status === 'degraded')) {
    restingStatus.set(integration, integration.status);
    integration.status = 'paused';
  } else if (enabled && integration.status === 'paused') {
    integration.status = restingStatus.get(integration) ?? 'connected';
  }

  const effect: Record<string, number> = {};
  if (id === 'github') {
    if (enabled) effect.resumedWorkpacks = releaseAll(ps, 'integration-disabled', actor);
    else effect.pausedWorkpacks = holdAll(ps, 'integration-disabled', actor);
    refreshQueue(ps);
  }
  recordAudit(ps, actor, 'integration.updated', { integrationId: id, enabled, status: integration.status, ...effect });
  announce(ps, integration);
  return integration;
}

function successMessage(ps: ProjectState, integration: Integration, latencyMs: number): string {
  switch (integration.category) {
    case 'Source control':
      return `Reached api.github.com and read ${ps.repository?.fullName ?? ps.project.repo} in ${latencyMs} ms.`;
    case 'Notifications':
      return `Delivered a test message to ${ps.slack.channel} in ${latencyMs} ms.`;
    case 'Model provider':
      return `${integration.name} answered a one-token probe in ${latencyMs} ms with the stored key.`;
    case 'Security scanner':
      return `${integration.name} rule pack v1.88.0 loaded in ${latencyMs} ms.`;
    case 'Alert source':
      return `Test alert delivered to the webhook in ${latencyMs} ms. SentryWatch will dedupe it by fingerprint.`;
  }
}

export function testIntegration(ps: ProjectState, id: string, actor: Actor): ConnectivityResult {
  const integration = integrationById(ps, id);
  let result: ConnectivityResult;
  if (integration.status === 'disconnected') {
    // Checked first: enabling a connector that was never connected would not make the test pass.
    result = { ok: false, latencyMs: 0, message: `${integration.name} is not connected yet.` };
  } else if (!integration.enabled) {
    result = { ok: false, latencyMs: 0, message: `${integration.name} is disabled. Enable it to run a connectivity test.` };
  } else {
    const latencyMs = 90 + (hash32(`${id}:${Math.floor(nowMs(ps.store) / 60_000)}`) % 260);
    integration.lastVerifiedAt = nowIso(ps.store);
    result = { ok: true, latencyMs, message: successMessage(ps, integration, latencyMs) };
  }
  recordAudit(ps, actor, 'integration.tested', { integrationId: id, ok: result.ok });
  return result;
}

function syncFleetProviderModels(ps: ProjectState, providerId: string): void {
  for (const agent of ps.agents) {
    const active = agent.versions.find((v) => v.status === 'active') ?? agent.versions[agent.versions.length - 1];
    if (!active) continue;
    if (providerId === 'openai') {
      active.config.model.primary = 'openai/gpt-4o';
      active.config.model.fallbacks = ['anthropic/claude-sonnet', 'deepseek/deepseek-v3'];
    } else if (providerId === 'deepseek') {
      active.config.model.primary = 'deepseek/deepseek-v3';
      active.config.model.fallbacks = ['anthropic/claude-sonnet', 'openai/gpt-4o'];
    } else if (providerId === 'anthropic') {
      const primary =
        agent.id === 'architect-prime'
          ? 'anthropic/claude-opus'
          : agent.id === 'docuforge'
            ? 'anthropic/claude-haiku'
            : 'anthropic/claude-sonnet';
      active.config.model.primary = primary;
      active.config.model.fallbacks =
        primary === 'anthropic/claude-sonnet'
          ? ['anthropic/claude-haiku', 'openai/gpt-4o']
          : ['anthropic/claude-sonnet', 'openai/gpt-4o'];
    }
  }
}

/** Provider keys are write-only: the mock keeps no copy at all, only the time it was last verified. */
export function rotateProviderKey(ps: ProjectState, id: string, actor: Actor): void {
  const integration = integrationById(ps, id);
  if (!PROVIDER_IDS.includes(id)) {
    throw invalid([{ path: 'id', message: `${integration.name} does not take a model-provider key.`, code: 'not_a_provider' }]);
  }
  integration.lastVerifiedAt = nowIso(ps.store);
  syncFleetProviderModels(ps, id);
  recordAudit(ps, actor, 'integration.key_rotated', { integrationId: id });
  announce(ps, integration);
}

// ---------------------------------------------------------------------------
// Governance policies (spec §11.3)
// ---------------------------------------------------------------------------

const POLICY_FIELDS = ['autoMergeVerifiedPRs', 'humanSignoffP0P1Schema', 'sastStrictness', 'slaEscalation'] as const;

export function updatePolicies(ps: ProjectState, patch: UpdatePoliciesRequest, actor: Actor): Policies {
  const changes: Record<string, Change> = {};
  for (const field of POLICY_FIELDS) {
    const next = patch[field];
    if (next === undefined || next === ps.policies[field]) continue;
    changes[field] = { from: ps.policies[field], to: next };
    Object.assign(ps.policies, { [field]: next });
  }
  const changed = Object.keys(changes);
  if (changed.length > 0) recordAudit(ps, actor, 'policy.updated', { changed, ...changes });
  return ps.policies;
}

// ---------------------------------------------------------------------------
// Slack (spec §13.4)
// ---------------------------------------------------------------------------

/** `https://hooks.slack.com/services/T0…/B0…/••••••••`: enough to recognise the hook, nothing that can post to it. */
export function maskWebhook(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '••••••••';
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.hostname === 'hooks.slack.com' && parts[0] === 'services' && parts.length >= 4) {
    return `${url.origin}/services/${parts[1]!.slice(0, 2)}…/${parts[2]!.slice(0, 2)}…/••••••••`;
  }
  return `${url.origin}/…/••••••••`;
}

export function slackView(ps: ProjectState): SlackSettings {
  const { webhookConfigured, webhookMasked, channel, oncallHandle, routing } = ps.slack;
  return { webhookConfigured, webhookMasked, channel, oncallHandle, routing: { ...routing } };
}

/** Keep the Integrations card in step with the notification settings. */
function syncSlackIntegration(ps: ProjectState): Integration | undefined {
  const integration = ps.integrations.find((i) => i.id === 'slack');
  if (!integration) return undefined;
  if (ps.slack.webhookConfigured && integration.status === 'disconnected') {
    integration.status = 'connected';
    integration.enabled = true;
    integration.lastVerifiedAt = nowIso(ps.store);
  }
  integration.details = ps.slack.webhookConfigured ? `Posting to ${ps.slack.channel}` : 'Add an incoming webhook under Notifications to connect.';
  return integration;
}

export function updateSlack(ps: ProjectState, patch: UpdateSlackRequest, actor: Actor): SlackSettings {
  const slack = ps.slack;
  const changed: string[] = [];
  const changes: Record<string, Change> = {};

  if (patch.webhookUrl !== undefined && patch.webhookUrl !== slack.rawWebhook) {
    slack.rawWebhook = patch.webhookUrl;
    slack.webhookConfigured = true;
    slack.webhookMasked = maskWebhook(patch.webhookUrl);
    changed.push('webhookUrl');
  }
  if (patch.channel !== undefined && patch.channel !== slack.channel) {
    changes.channel = { from: slack.channel, to: patch.channel };
    slack.channel = patch.channel;
    ps.budget.slackChannel = patch.channel;
    changed.push('channel');
  }
  if (patch.oncallHandle !== undefined && patch.oncallHandle !== slack.oncallHandle) {
    changes.oncallHandle = { from: slack.oncallHandle, to: patch.oncallHandle };
    slack.oncallHandle = patch.oncallHandle;
    changed.push('oncallHandle');
  }
  for (const key of ['budget', 'review', 'failure', 'sla'] as const) {
    const next = patch.routing?.[key];
    if (next === undefined || next === slack.routing[key]) continue;
    changes[`routing.${key}`] = { from: slack.routing[key], to: next };
    slack.routing[key] = next;
    changed.push(`routing.${key}`);
  }

  if (changed.length > 0) {
    const integration = syncSlackIntegration(ps);
    // The webhook is a secret: its change is recorded by name only.
    recordAudit(ps, actor, 'slack.updated', { changed, ...changes });
    if (integration) announce(ps, integration);
  }
  return slackView(ps);
}

export function sendSlackTest(ps: ProjectState, actor: Actor): { ok: true; channel: string; sentAt: string } {
  if (!ps.slack.webhookConfigured) throw conflict('slack_not_configured', 'Add a Slack webhook before sending a test message.');
  recordAudit(ps, actor, 'slack.test_sent', { channel: ps.slack.channel });
  return { ok: true, channel: ps.slack.channel, sentAt: nowIso(ps.store) };
}

// ---------------------------------------------------------------------------
// Project token (spec §14): one per project, its value shown once
// ---------------------------------------------------------------------------

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const tokenView = (ps: ProjectState): ProjectToken => ({ ...ps.token.info });

/** Regenerate: a new value is returned this once, and only its last four characters and a hash are kept. */
export async function rotateToken(ps: ProjectState, actor: Actor): Promise<RotateTokenResponse> {
  const rng = rngOf(ps.store);
  const value = `fct_${Array.from({ length: 32 }, () => TOKEN_ALPHABET.charAt(rng.int(0, TOKEN_ALPHABET.length - 1))).join('')}`;
  const hash = await sha256Hex(value);
  ps.token = {
    info: {
      prefix: 'fct_',
      last4: value.slice(-4),
      createdAt: nowIso(ps.store),
      createdBy: actor.name,
      lastUsedAt: null,
      lastUsedBy: null,
      lastUsedClient: null,
      revoked: false,
    },
    hash,
  };
  recordAudit(ps, actor, 'token.rotated');
  emit(ps, { type: 'token.rotated', actor: actor.name });
  return { token: value, info: tokenView(ps) };
}

export function revokeToken(ps: ProjectState, actor: Actor): ProjectToken {
  if (!ps.token.info.revoked) {
    ps.token.info.revoked = true;
    recordAudit(ps, actor, 'token.revoked');
    emit(ps, { type: 'token.rotated', actor: actor.name });
  }
  return tokenView(ps);
}

// ---------------------------------------------------------------------------
// Test-secret vault (spec §14): names and allow-lists only, values are never kept
// ---------------------------------------------------------------------------

const VAULT_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;

const vaultView = (key: VaultKey): VaultKey => ({ ...key, allowedGates: [...key.allowedGates] });

export const vaultKeys = (ps: ProjectState): VaultKey[] => ps.vault.map(vaultView);

export interface VaultWrite {
  /** Write-only; absent when only the allow-list is being edited. */
  value?: string;
  /** Absent means unchanged (and none for a new key). */
  allowedGates?: GateId[];
}

/** Create a key or rotate it. The value is accepted and dropped: there is nothing here that reads it back. */
export function putVaultKey(ps: ProjectState, name: string, write: VaultWrite, actor: Actor): VaultKey {
  const existing = ps.vault.find((k) => k.name === name);
  const errors: FieldError[] = [];
  if (!VAULT_NAME.test(name)) {
    errors.push({ path: 'name', message: 'Use 3 to 64 characters: capital letters, digits and underscores, starting with a letter.', code: 'invalid_name' });
  }
  if (!existing && write.value === undefined) errors.push({ path: 'value', message: 'Enter a value for a new key.', code: 'required' });
  if (errors.length > 0) throw invalid(errors);

  let key: VaultKey;
  let created = false;
  let rotated = false;
  if (existing) {
    key = existing;
    if (write.allowedGates !== undefined) key.allowedGates = [...write.allowedGates];
    if (write.value !== undefined) {
      key.rotatedAt = nowIso(ps.store);
      rotated = true;
    }
  } else {
    key = { name, allowedGates: [...(write.allowedGates ?? [])], createdBy: actor.name, createdAt: nowIso(ps.store), rotatedAt: null, lastUsedAt: null };
    ps.vault.push(key);
    created = true;
  }
  recordAudit(ps, actor, 'vault.key_written', { name, allowedGates: [...key.allowedGates], created, rotated });
  return vaultView(key);
}

export function deleteVaultKey(ps: ProjectState, name: string, actor: Actor): void {
  const index = ps.vault.findIndex((k) => k.name === name);
  if (index === -1) throw notFound('Vault key', name);
  ps.vault.splice(index, 1);
  recordAudit(ps, actor, 'vault.key_deleted', { name });
}
