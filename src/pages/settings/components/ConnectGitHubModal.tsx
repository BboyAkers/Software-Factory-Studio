import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useCan } from '../../../app/session';
import { useGo } from '../../../app/nav';
import { useNow } from '../../../app/useNow';
import { connectionStore, deriveConnection } from '../../../api/state';
import {
  Badge,
  Button,
  Dialog,
  Field,
  Icon,
  Input,
  Toggle,
  Tooltip,
} from '../../../components/ui';
import type { PreflightCheck } from '../../../contracts';
import { normalizeRepo } from '../lib/normalizeRepo';
import { usePreflightMutation } from '../mutations/usePreflightMutation';
import { useConnectProjectMutation } from '../mutations/useConnectProjectMutation';
import { GitHubIcon } from './GitHubIcon';

interface ConnectGitHubModalProps {
  open: boolean;
  onClose: () => void;
  initialRepo?: string;
  onSuccess?: (projectId: string) => void;
}

interface ConnectGitHubFormValues {
  repoInput: string;
  token: string;
  defaultBranch: string;
  monthlyCapUsd: number;
  softLimitPercent: number;
  autoMergeVerifiedPRs: boolean;
  humanSignoffP0P1Schema: boolean;
}

export function ConnectGitHubModal({ open, onClose, initialRepo = '', onSuccess }: ConnectGitHubModalProps) {
  const [showToken, setShowToken] = useState(false);

  const defaultRepo = initialRepo || ((import.meta.env.VITE_DEFAULT_REPO as string | undefined) ?? '');

  const {
    register,
    control,
    handleSubmit,
    watch,
    trigger,
    getValues,
    reset,
    formState: { errors },
  } = useForm<ConnectGitHubFormValues>({
    defaultValues: {
      repoInput: defaultRepo,
      token: '',
      defaultBranch: 'main',
      monthlyCapUsd: 1500,
      softLimitPercent: 80,
      autoMergeVerifiedPRs: false,
      humanSignoffP0P1Schema: true,
    },
    mode: 'onSubmit',
  });

  useEffect(() => {
    if (initialRepo) {
      reset((current) => ({
        ...current,
        repoInput: current.repoInput || initialRepo,
      }));
    }
  }, [initialRepo, reset]);

  const now = useNow();
  const isOffline = deriveConnection(connectionStore.get(), now) === 'offline';
  const connectCapability = useCan('project.connect');
  const go = useGo();

  const preflight = usePreflightMutation();
  const connect = useConnectProjectMutation();

  const repoInput = watch('repoInput');
  const normalizedRepo = normalizeRepo(repoInput);

  const handleRunPreflight = async () => {
    const valid = await trigger(['repoInput', 'token']);
    if (!valid) return;

    const values = getValues();
    const targetRepo = normalizeRepo(values.repoInput);

    try {
      await preflight.mutateAsync({
        repo: targetRepo,
        token: values.token.trim(),
        defaultBranch: values.defaultBranch.trim() || 'main',
      });
    } catch {
      // Inline results will show
    }
  };

  const onSubmit = async (values: ConnectGitHubFormValues) => {
    if (!connectCapability.allowed || isOffline) return;

    const targetRepo = normalizeRepo(values.repoInput);

    try {
      const createdProject = await connect.mutateAsync({
        repo: targetRepo,
        token: values.token.trim(),
        defaultBranch: values.defaultBranch.trim() || 'main',
        monthlyCapUsd: values.monthlyCapUsd,
        softLimitPercent: values.softLimitPercent,
        autoMergeVerifiedPRs: values.autoMergeVerifiedPRs,
        humanSignoffP0P1Schema: values.humanSignoffP0P1Schema,
      });

      if ('id' in createdProject) {
        onClose();
        reset({
          repoInput: '',
          token: '',
          defaultBranch: 'main',
          monthlyCapUsd: 1500,
          softLimitPercent: 80,
          autoMergeVerifiedPRs: false,
          humanSignoffP0P1Schema: true,
        });
        try {
          globalThis.localStorage?.setItem('factory.selected_project', createdProject.id);
        } catch {
          // ignore
        }
        if (onSuccess) {
          onSuccess(createdProject.id);
        } else {
          // Navigate to the newly connected project overview
          void go('overview', { project: createdProject.id });
        }
      }
    } catch {
      // Error is toasted by useApiMutation
    }
  };

  const preflightData = preflight.data && 'checks' in preflight.data ? preflight.data : null;
  const canConnect =
    preflightData?.ok === true &&
    connectCapability.allowed &&
    !isOffline &&
    !connect.isPending;

  const connectDisabledReason = !connectCapability.allowed
    ? connectCapability.reason ?? 'Requires Admin role'
    : isOffline
      ? 'Needs a connection'
      : !preflightData
        ? 'Run preflight check first'
        : !preflightData.ok
          ? 'Resolve failing preflight checks before connecting'
          : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={!connect.isPending && !preflight.isPending}
      title={
        <span className="flex items-center gap-2.5">
          <GitHubIcon size={20} className="text-white" />
          <span>Connect GitHub Repository</span>
        </span>
      }
      description="Connect a personal or organization repository to the autonomous software factory (spec §13.1)."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={connect.isPending || preflight.isPending}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon="rule"
              onClick={() => void handleRunPreflight()}
              loading={preflight.isPending}
              disabled={connect.isPending}
            >
              Run Preflight
            </Button>

            <Button
              variant="primary"
              icon="link"
              onClick={() => void handleSubmit(onSubmit)()}
              loading={connect.isPending}
              disabled={!canConnect}
              disabledReason={connectDisabledReason}
            >
              Connect Repository
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-5" noValidate>
        {/* Step 1: Repository & Target */}
        <div className="space-y-3 rounded-lg border border-fluent-border bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-white">1. Repository Target</h3>
            <span className="text-[12px] text-on-surface-muted">One repository = One project</span>
          </div>

          <Field
            label="Repository (owner/repo or GitHub URL)"
            required
            hint={
              normalizedRepo && normalizedRepo !== repoInput
                ? `Will connect: ${normalizedRepo}`
                : 'Enter as owner/repo (e.g. BboyAkers/Software-Factory-Studio) or paste URL'
            }
            error={errors.repoInput?.message}
          >
            {(props) => (
              <Input
                {...props}
                placeholder="e.g. BboyAkers/Software-Factory-Studio"
                {...register('repoInput', {
                  validate: (value) => {
                    const normalized = normalizeRepo(value);
                    return (
                      (Boolean(normalized) && normalized.includes('/')) ||
                      'Enter a valid repository as owner/repo or paste its GitHub URL.'
                    );
                  },
                })}
              />
            )}
          </Field>

          {/* Authentication Method Selector */}
          <div>
            <label className="mb-1 block text-[13px] font-medium text-on-surface">Authentication Method</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[13px] font-medium text-white">
                <span className="flex items-center gap-2">
                  <Icon name="key" size={16} className="text-fluent-blue-light" />
                  Personal Access Token (PAT)
                </span>
                <Badge tone="info">Active</Badge>
              </div>

              <Tooltip content="GitHub App & OAuth authentication is disabled in v1 (spec §1.2 / §13.1).">
                <div className="flex cursor-not-allowed items-center justify-between rounded-md border border-fluent-border bg-white/5 px-3 py-2 text-[13px] text-on-surface-muted opacity-60">
                  <span className="flex items-center gap-2">
                    <Icon name="apps" size={16} />
                    GitHub App / OAuth
                  </span>
                  <span className="text-[11px] font-medium">Disabled in v1</span>
                </div>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Step 2: Fine-Grained Personal Access Token */}
        <div className="space-y-3 rounded-lg border border-fluent-border bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-white">2. Fine-Grained Personal Access Token</h3>
            <a
              href="https://github.com/settings/tokens?type=beta"
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-[12px] text-fluent-blue-light hover:underline"
            >
              <span>Generate on GitHub</span>
              <Icon name="open_in_new" size={13} />
            </a>
          </div>

          <Field
            label="Personal Access Token"
            required
            hint="Fine-grained token scoped strictly to this repository (starts with github_pat_)."
            error={errors.token?.message}
          >
            {(props) => (
              <div className="relative">
                <Input
                  {...props}
                  type={showToken ? 'text' : 'password'}
                  placeholder="github_pat_..."
                  className="pr-10 font-mono text-[13px]"
                  {...register('token', {
                    validate: (value) =>
                      value.trim().length > 0 ||
                      'A Personal Access Token is required for repository synchronization.',
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  className="focus-ring absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:text-white"
                >
                  <Icon name={showToken ? 'visibility_off' : 'visibility'} size={16} />
                </button>
              </div>
            )}
          </Field>

          {/* Required Scopes Reminder */}
          <div>
            <span className="block text-[12px] font-medium text-on-surface-variant mb-1.5">
              Required token repository permissions (spec §13.1):
            </span>
            <div className="flex flex-wrap gap-1.5 text-[12px]">
              <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-on-surface">
                Contents: Read &amp; write
              </span>
              <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-on-surface">
                Pull requests: Read &amp; write
              </span>
              <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-on-surface">
                Checks: Read &amp; write
              </span>
              <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-on-surface">
                Issues: Read &amp; write
              </span>
              <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-on-surface">
                Deployments: Read
              </span>
              <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-on-surface-muted">
                Webhooks: Read &amp; write (optional)
              </span>
            </div>
          </div>
        </div>

        {/* Step 3: Branch & Project Budget */}
        <div className="space-y-3 rounded-lg border border-fluent-border bg-white/[0.02] p-4">
          <h3 className="text-[14px] font-semibold text-white">3. Branch &amp; Project Budget</h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Default Target Branch"
              required
              hint="Trunk branch to target (e.g. main, master)"
              error={errors.defaultBranch?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  placeholder="main"
                  {...register('defaultBranch')}
                />
              )}
            </Field>

            <Field label="Workpack Branch Prefix" hint="Isolated branch convention used by factory agents">
              {(props) => (
                <Input
                  {...props}
                  disabled
                  value="factory/<wp-id>-<slug>"
                  className="font-mono text-[12px] text-on-surface-muted"
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Monthly Budget Cap (USD)"
              required
              hint="Hard limit per calendar month"
              error={errors.monthlyCapUsd?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min="1"
                  step="50"
                  {...register('monthlyCapUsd', {
                    valueAsNumber: true,
                    validate: (value) =>
                      (!Number.isNaN(value) && value > 0) ||
                      'Monthly budget cap must be a positive number.',
                  })}
                />
              )}
            </Field>

            <Field
              label="Soft Limit Alert (%)"
              hint="Slack alert triggers when spend crosses threshold"
              error={errors.softLimitPercent?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min="50"
                  max="95"
                  step="5"
                  {...register('softLimitPercent', {
                    valueAsNumber: true,
                    min: { value: 50, message: 'Soft limit must be at least 50%.' },
                    max: { value: 95, message: 'Soft limit cannot exceed 95%.' },
                  })}
                />
              )}
            </Field>
          </div>
        </div>

        {/* Step 4: Governance Toggles */}
        <div className="space-y-3 rounded-lg border border-fluent-border bg-white/[0.02] p-4">
          <h3 className="text-[14px] font-semibold text-white">4. Autonomous Governance Policies</h3>

          <Controller
            name="autoMergeVerifiedPRs"
            control={control}
            render={({ field }) => (
              <Toggle
                label="Mainline Auto-Merge"
                description="Automatically merge verified pull requests when 100% of Quality Sandbox deterministic gates pass (default: off)."
                checked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <div className="border-t border-fluent-border/60 pt-3">
            <Controller
              name="humanSignoffP0P1Schema"
              control={control}
              render={({ field }) => (
                <Toggle
                  label="Human Sign-Off for P0/P1 & Schemas"
                  description="Require explicit maintainer approval before promoting P0 blocker workpacks or database schema changes."
                  checked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </div>

        {/* Step 5: Preflight Diagnostics & Results */}
        <div className="space-y-3 rounded-lg border border-fluent-border bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold text-white">5. Preflight Diagnostics</h3>
              <p className="text-[12px] text-on-surface-variant">
                Verify token scopes, branch reachability, and TypeScript language support before connecting.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon="sync"
              onClick={() => void handleRunPreflight()}
              loading={preflight.isPending}
            >
              Verify
            </Button>
          </div>

          {preflight.isPending && (
            <div className="flex items-center gap-2 rounded-md border border-fluent-border bg-white/5 p-3 text-[13px] text-on-surface-variant">
              <span className="spinner size-4 animate-[spin_700ms_linear_infinite] rounded-full border-2 border-primary border-t-transparent" />
              <span>Running preflight checks on GitHub API...</span>
            </div>
          )}

          {preflightData && (
            <div className="space-y-2">
              <div
                className={`flex items-center gap-2 rounded-md border p-3 text-[13px] font-medium ${
                  preflightData.ok
                    ? 'border-fluent-success/30 bg-fluent-success-subtle text-fluent-success'
                    : 'border-fluent-error/30 bg-fluent-error-subtle text-fluent-danger-text'
                }`}
              >
                <Icon name={preflightData.ok ? 'check_circle' : 'error'} size={18} />
                <span>
                  {preflightData.ok
                    ? 'All required checks passed. Ready to connect.'
                    : 'Some preflight checks failed. Review the diagnostics below.'}
                </span>
              </div>

              <div className="divide-y divide-fluent-border rounded-md border border-fluent-border bg-white/[0.02]">
                {preflightData.checks.map((c: PreflightCheck) => (
                  <div key={c.id} className="p-3 text-[13px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Icon
                          name={
                            c.status === 'pass'
                              ? 'check_circle'
                              : c.status === 'fail'
                                ? 'cancel'
                                : 'warning'
                          }
                          size={16}
                          className={
                            c.status === 'pass'
                              ? 'mt-0.5 text-fluent-success'
                              : c.status === 'fail'
                                ? 'mt-0.5 text-fluent-danger-text'
                                : 'mt-0.5 text-fluent-warning'
                          }
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{c.label}</span>
                            {c.required && (
                              <span className="text-[11px] font-mono uppercase text-on-surface-muted">
                                Required
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[12px] text-on-surface-variant">{c.detail}</p>
                          {c.fix && c.status !== 'pass' && (
                            <div className="mt-1.5 rounded bg-fluent-error-subtle/50 border border-fluent-error/20 p-2 text-[12px] text-fluent-danger-text">
                              <span className="font-semibold">Recommended Fix: </span>
                              {c.fix}
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge
                        tone={
                          c.status === 'pass'
                            ? 'success'
                            : c.status === 'fail'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {c.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}
