import { z } from 'zod';
import { IsoSchema, MetricSchema } from './common';

export const GATE_IDS = [
  'static.types_lint',
  'tests.unit_integration',
  'tests.e2e_viewports',
  'security.sast_sbom',
  'contract.conformance',
  'diff.scope',
  'perf.budgets',
  'a11y.scan',
  'i18n.check',
  'migration.safety',
] as const;
export const GateIdSchema = z.enum(GATE_IDS);
export type GateId = z.infer<typeof GateIdSchema>;

export const GateSeveritySchema = z.enum(['block', 'warn', 'quarantine']);
export type GateSeverity = z.infer<typeof GateSeveritySchema>;

export const GateStatusSchema = z.enum(['queued', 'running', 'passed', 'failed', 'skipped', 'quarantined']);
export type GateStatus = z.infer<typeof GateStatusSchema>;

export interface GateCatalogEntry {
  id: GateId;
  index: number;
  slug: string;
  title: string;
  owner: 'GateKeeper' | 'SecOps-Vanguard' | 'Orchestrator';
  /** Default severity; a quarantined test lowers a result to `quarantine`. */
  severity: 'block' | 'warn';
  description: string;
}

/** Spec §8: ten gates. Blocking = 1–6 and 10; warn = 7–9. */
export const GATE_CATALOG: readonly GateCatalogEntry[] = [
  { id: 'static.types_lint', index: 1, slug: 'types-lint', title: 'Types & lint', owner: 'GateKeeper', severity: 'block', description: 'tsc --noEmit, oxlint/eslint, formatter check. 0 errors and no new warnings.' },
  { id: 'tests.unit_integration', index: 2, slug: 'unit-integration', title: 'Unit & integration tests', owner: 'GateKeeper', severity: 'block', description: 'vitest with coverage in the sandbox. 100% pass, ≥ 80% coverage on changed lines.' },
  { id: 'tests.e2e_viewports', index: 3, slug: 'e2e-viewports', title: 'E2E across viewports', owner: 'GateKeeper', severity: 'block', description: 'Playwright across the viewport and browser matrix. Captures stored as screenshots.' },
  { id: 'security.sast_sbom', index: 4, slug: 'security', title: 'Security: SAST, secrets, SBOM', owner: 'SecOps-Vanguard', severity: 'block', description: 'Semgrep, gitleaks, SBOM and CVE scan, license policy. 0 new high/critical findings.' },
  { id: 'contract.conformance', index: 5, slug: 'contract', title: 'Contract conformance', owner: 'Orchestrator', severity: 'block', description: 'Compiles against locked contracts. No contract file modified, no breaking API diff.' },
  { id: 'diff.scope', index: 6, slug: 'diff-scope', title: 'Diff scope', owner: 'Orchestrator', severity: 'block', description: 'Changed files within target files and allowed globs; respects human-locked files.' },
  { id: 'perf.budgets', index: 7, slug: 'perf', title: 'Performance budgets', owner: 'GateKeeper', severity: 'warn', description: 'Bundle delta and LCP/p95 on sandbox captures. Never blocks in v1.' },
  { id: 'a11y.scan', index: 8, slug: 'a11y', title: 'Accessibility scan', owner: 'GateKeeper', severity: 'warn', description: 'Automated a11y scan; new criticals are flagged. Warns only in v1.' },
  { id: 'i18n.check', index: 9, slug: 'i18n', title: 'i18n check', owner: 'GateKeeper', severity: 'warn', description: 'Missing-key and locale-format check. Warns only in v1.' },
  { id: 'migration.safety', index: 10, slug: 'migration', title: 'Migration safety', owner: 'GateKeeper', severity: 'block', description: 'Migration dry-run and backward-compatibility check. Blocks on failure.' },
] as const;

export function gateEntry(id: GateId): GateCatalogEntry {
  const entry = GATE_CATALOG.find((g) => g.id === id);
  if (!entry) throw new Error(`Unknown gate: ${id}`);
  return entry;
}

export function checkRunName(id: GateId): string {
  const g = gateEntry(id);
  return `factory/gates/${String(g.index).padStart(2, '0')}-${g.slug}`;
}

export const GateFailureSchema = z.object({
  file: z.string(),
  line: z.number().int(),
  message: z.string(),
  excerpt: z.string(),
});
export type GateFailure = z.infer<typeof GateFailureSchema>;

export const GateResultSchema = z.object({
  id: z.string(),
  workpackId: z.string(),
  runId: z.string(),
  gate: GateIdSchema,
  severity: GateSeveritySchema,
  status: GateStatusSchema,
  metrics: z.array(MetricSchema),
  failures: z.array(GateFailureSchema),
  checkRun: z.string(),
  startedAt: IsoSchema,
  finishedAt: IsoSchema.nullable(),
});
export type GateResult = z.infer<typeof GateResultSchema>;

export const ViewportSchema = z.enum(['desktop', 'tablet', 'mobile']);
export type Viewport = z.infer<typeof ViewportSchema>;
export const BrowserSchema = z.enum(['chromium', 'firefox', 'webkit']);
export type Browser = z.infer<typeof BrowserSchema>;

export const ScreenshotSchema = z.object({
  id: z.string(),
  viewport: ViewportSchema,
  width: z.number().int(),
  height: z.number().int(),
  browser: BrowserSchema,
  route: z.string(),
  uri: z.string(),
  capturedAt: IsoSchema,
  expiresAt: IsoSchema,
});
export type Screenshot = z.infer<typeof ScreenshotSchema>;

export const QuarantinedTestSchema = z.object({
  name: z.string(),
  file: z.string(),
  retries: z.array(z.enum(['passed', 'failed'])),
  issueUrl: z.string(),
});
export type QuarantinedTest = z.infer<typeof QuarantinedTestSchema>;

export const GatesResponseSchema = z.object({
  workpackId: z.string(),
  results: z.array(GateResultSchema),
  quarantined: z.array(QuarantinedTestSchema),
});
export type GatesResponse = z.infer<typeof GatesResponseSchema>;

export const SignoffItemSchema = z.object({
  id: z.enum(['blocking-gates', 'secops-veto', 'human-signoff', 'contract-conformance']),
  label: z.string(),
  state: z.enum(['met', 'unmet', 'na']),
  detail: z.string(),
});
export type SignoffItem = z.infer<typeof SignoffItemSchema>;

export const DeploymentSchema = z.object({
  status: z.enum(['queued', 'in-progress', 'succeeded', 'failed']),
  environment: z.literal('staging'),
  sha: z.string(),
  url: z.string().nullable(),
  updatedAt: IsoSchema,
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const ReleaseSchema = z.object({
  workpackId: z.string(),
  prNumber: z.number().int().nullable(),
  prUrl: z.string().nullable(),
  branch: z.string(),
  commitSha: z.string().nullable(),
  prBodyMarkdown: z.string(),
  checkRuns: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['queued', 'in_progress', 'success', 'failure', 'neutral']),
      url: z.string(),
    }),
  ),
  signoff: z.array(SignoffItemSchema),
  canPromote: z.boolean(),
  unmet: z.array(z.string()),
  merged: z.boolean(),
  mergedAt: IsoSchema.nullable(),
  deployment: DeploymentSchema.nullable(),
  /** True when the merge happened and no deployment event has arrived within 30 min. */
  noDeploymentReported: z.boolean(),
});
export type Release = z.infer<typeof ReleaseSchema>;

export const ReproBundleSchema = z.object({
  workpackId: z.string(),
  branch: z.string(),
  commitSha: z.string().nullable(),
  prNumber: z.number().int().nullable(),
  gateResults: z.array(GateResultSchema),
  transcriptUri: z.string().nullable(),
  envRedacted: z.array(z.string()),
  generatedAt: IsoSchema,
});
export type ReproBundle = z.infer<typeof ReproBundleSchema>;
