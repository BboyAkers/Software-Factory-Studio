import { z } from 'zod';
import { IsoSchema } from './common';
import { GateIdSchema } from './gate';

export const IntegrationIdSchema = z.enum([
  'github',
  'slack',
  'anthropic',
  'openai',
  'deepseek',
  'semgrep',
  'sentry',
  'datadog',
]);
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;

export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  name: z.string(),
  category: z.enum(['Source control', 'Notifications', 'Model provider', 'Security scanner', 'Alert source']),
  status: z.enum(['connected', 'degraded', 'disconnected', 'paused']),
  enabled: z.boolean(),
  details: z.string(),
  lastVerifiedAt: IsoSchema.nullable(),
  /** Alert sources only: where to point the webhook. */
  webhookUrl: z.string().nullable(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export const PoliciesSchema = z.object({
  autoMergeVerifiedPRs: z.boolean(),
  humanSignoffP0P1Schema: z.boolean(),
  sastStrictness: z.enum(['strict', 'standard']),
  slaEscalation: z.boolean(),
  /** Always on (spec §11.3). Present so the UI can show it read-only. */
  hardBudgetTripwire: z.literal(true),
});
export type Policies = z.infer<typeof PoliciesSchema>;

export const UpdatePoliciesRequestSchema = PoliciesSchema.omit({ hardBudgetTripwire: true }).partial();
export type UpdatePoliciesRequest = z.infer<typeof UpdatePoliciesRequestSchema>;

export const ProjectTokenSchema = z.object({
  prefix: z.string(),
  last4: z.string(),
  createdAt: IsoSchema,
  createdBy: z.string(),
  lastUsedAt: IsoSchema.nullable(),
  lastUsedBy: z.string().nullable(),
  lastUsedClient: z.enum(['cli', 'studio', 'ci']).nullable(),
  revoked: z.boolean(),
});
export type ProjectToken = z.infer<typeof ProjectTokenSchema>;

export const RotateTokenResponseSchema = z.object({
  /** Shown exactly once. */
  token: z.string(),
  info: ProjectTokenSchema,
});
export type RotateTokenResponse = z.infer<typeof RotateTokenResponseSchema>;

export const VaultKeySchema = z.object({
  name: z.string(),
  allowedGates: z.array(GateIdSchema),
  createdBy: z.string(),
  createdAt: IsoSchema,
  rotatedAt: IsoSchema.nullable(),
  lastUsedAt: IsoSchema.nullable(),
});
export type VaultKey = z.infer<typeof VaultKeySchema>;

export const PutVaultKeyRequestSchema = z.object({
  /** Write-only. Omit to change only the allow-list. */
  value: z.string().min(1).optional(),
  allowedGates: z.array(GateIdSchema).default([]),
});
export type PutVaultKeyRequest = z.infer<typeof PutVaultKeyRequestSchema>;

export const SlackSettingsSchema = z.object({
  webhookConfigured: z.boolean(),
  webhookMasked: z.string().nullable(),
  channel: z.string(),
  oncallHandle: z.string(),
  routing: z.object({
    budget: z.boolean(),
    review: z.boolean(),
    failure: z.boolean(),
    sla: z.boolean(),
  }),
});
export type SlackSettings = z.infer<typeof SlackSettingsSchema>;

export const UpdateSlackRequestSchema = z.object({
  webhookUrl: z.string().url().optional(),
  channel: z.string().min(1).optional(),
  oncallHandle: z.string().optional(),
  routing: SlackSettingsSchema.shape.routing.partial().optional(),
});
export type UpdateSlackRequest = z.infer<typeof UpdateSlackRequestSchema>;

export const RepositorySchema = z.object({
  fullName: z.string(),
  defaultBranch: z.string(),
  language: z.string(),
  languageSupported: z.boolean(),
  webhookActive: z.boolean(),
  permissions: z.array(z.object({ name: z.string(), granted: z.boolean() })),
  lastSyncAt: IsoSchema.nullable(),
  intakeLabel: z.string(),
});
export type Repository = z.infer<typeof RepositorySchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  repo: z.string(),
  defaultBranch: z.string(),
  createdAt: IsoSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const SettingsOverviewSchema = z.object({
  repository: RepositorySchema.nullable(),
});

export const ConnectRequestSchema = z.object({
  repo: z.string().min(3),
  token: z.string().min(8),
  defaultBranch: z.string().min(1).default('main'),
  monthlyCapUsd: z.number().positive(),
  softLimitPercent: z.number().min(50).max(95).default(80),
  autoMergeVerifiedPRs: z.boolean().default(false),
  humanSignoffP0P1Schema: z.boolean().default(true),
});
export type ConnectRequest = z.infer<typeof ConnectRequestSchema>;

export const PreflightCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['pass', 'fail', 'warn']),
  required: z.boolean(),
  detail: z.string(),
  fix: z.string().nullable(),
});
export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

export const PreflightResultSchema = z.object({
  repo: z.string(),
  ok: z.boolean(),
  checks: z.array(PreflightCheckSchema),
});
export type PreflightResult = z.infer<typeof PreflightResultSchema>;

export const REQUIRED_PAT_PERMISSIONS = [
  'Contents: Read and write',
  'Pull requests: Read and write',
  'Checks: Read and write',
  'Issues: Read and write',
  'Deployments: Read',
  'Metadata: Read',
] as const;

/** `POST /integrations/:id/test`. A failed test is a `200` with `ok: false` and the reason in `message`. */
export const ConnectivityResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int(),
  message: z.string(),
});
export type ConnectivityResult = z.infer<typeof ConnectivityResultSchema>;

/** `POST /notifications/slack/test`. */
export const SlackTestResultSchema = z.object({
  ok: z.literal(true),
  channel: z.string(),
  sentAt: IsoSchema,
});
export type SlackTestResult = z.infer<typeof SlackTestResultSchema>;
