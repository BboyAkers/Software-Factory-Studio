import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  useAgents,
  useFleetStats,
  useIntegrations,
  useModels,
} from '../../../api/queries';
import { connectionStore, deriveConnection } from '../../../api/state';
import { useCan } from '../../../app/session';
import { useNow } from '../../../app/useNow';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Icon,
  Input,
  Skeleton,
  StatusDot,
  Toggle,
  Tooltip,
  cx,
} from '../../../components/ui';
import type { Agent, Integration, ModelCatalogEntry, ProviderStat } from '../../../contracts';
import { relativeTime } from '../../../domain/format';
import { useRotateProviderKeyMutation } from '../mutations/useRotateProviderKeyMutation';
import { useTestIntegrationMutation } from '../mutations/useTestIntegrationMutation';
import { useToggleIntegrationMutation } from '../mutations/useToggleIntegrationMutation';

export type ModelProviderId = 'anthropic' | 'openai' | 'deepseek';

interface ProviderMeta {
  id: ModelProviderId;
  name: string;
  tagline: string;
  keyPrefix: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  accentClass: string;
  iconBgClass: string;
}

const PROVIDER_META: Record<ModelProviderId, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    tagline: 'Claude Opus, Sonnet & Haiku reasoning and synthesis models',
    keyPrefix: 'sk-ant-',
    placeholder: 'sk-ant-api03-••••••••••••••••••••••••••••••••',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Anthropic Console',
    accentClass: 'text-[#d97757]',
    iconBgClass: 'border-[#d97757]/30 bg-[#d97757]/10 text-[#f09a7e]',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'GPT-4o multimodal synthesis & high-speed fallback routing',
    keyPrefix: 'sk-proj-',
    placeholder: 'sk-proj-••••••••••••••••••••••••••••••••',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'OpenAI Platform',
    accentClass: 'text-fluent-success',
    iconBgClass: 'border-fluent-success/30 bg-fluent-success/10 text-fluent-success',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'DeepSeek-V3 high-throughput code generation & verification',
    keyPrefix: 'sk-',
    placeholder: 'sk-••••••••••••••••••••••••••••••••',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    docsLabel: 'DeepSeek Platform',
    accentClass: 'text-fluent-blue-light',
    iconBgClass: 'border-primary/30 bg-primary/10 text-fluent-blue-light',
  },
};

const PROVIDER_ORDER: readonly ModelProviderId[] = ['anthropic', 'openai', 'deepseek'];

const LOADING_SKELETON_CARD = (
  <Card className="p-5">
    <div className="flex items-center justify-between border-b border-fluent-border pb-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <Skeleton className="h-8 w-32 rounded-md" />
    </div>
    <div className="mt-5 space-y-4">
      <Skeleton className="h-32 w-full rounded-md" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    </div>
  </Card>
);

const ZERO_READBACK_GUARANTEE_BADGE = (
  <span className="inline-flex items-center gap-1.5 text-[11px] text-on-surface-muted">
    <Icon name="verified_user" size={14} className="text-fluent-success" />
    <span>Zero-readback guarantee: keys are never exposed in API reads, logs, or SSE streams.</span>
  </span>
);

const MULTI_PROVIDER_FAILOVER_NOTE = (
  <div className="flex items-start gap-2.5 rounded-md border border-fluent-border bg-white/[0.01] p-3 text-[12px] text-on-surface-variant">
    <Icon name="hub" size={16} className="mt-0.5 text-fluent-blue-light" />
    <div className="leading-5">
      <strong className="text-white">Multi-Provider Failover &amp; Key Isolation:</strong> Every specialist agent is configured with a primary model and cross-provider fallbacks (for example, <code className="font-mono text-[11px] text-white">anthropic/claude-sonnet</code> failing over to <code className="font-mono text-[11px] text-white">deepseek/deepseek-v3</code> and <code className="font-mono text-[11px] text-white">openai/gpt-4o</code>). Imported provider keys are used strictly by the Factory LLM gateway and are never injected into sandbox test containers.
    </div>
  </div>
);

function ProviderGlyph({ providerId, size = 18 }: { providerId: ModelProviderId; size?: number }) {
  if (providerId === 'anthropic') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 4h-5L4 20h3.5l1.1-3.5h6.8L16.5 20H20L14.5 4Z" />
        <path d="M9.6 13.5 12 6l2.4 7.5H9.6Z" />
      </svg>
    );
  }
  if (providerId === 'openai') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
      <line x1="12" y1="22" x2="12" y2="15.5" />
      <polyline points="22 8.5 12 15.5 2 8.5" />
    </svg>
  );
}

interface AgentProviderUsage {
  agent: Agent;
  roleType: 'primary' | 'fallback';
  modelIds: string[];
}

interface ImportProviderKeyFormValues {
  providerId: ModelProviderId;
  apiKey: string;
  verifyOnImport: boolean;
}

export function ModelProviderKeysCard() {
  const [showKey, setShowKey] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    providerId: ModelProviderId;
    ok: boolean;
    title: string;
    detail?: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setFocus,
    resetField,
    clearErrors,
    formState: { errors },
  } = useForm<ImportProviderKeyFormValues>({
    defaultValues: {
      providerId: 'anthropic',
      apiKey: '',
      verifyOnImport: true,
    },
    mode: 'onSubmit',
  });

  const selectedProvider = watch('providerId');

  const {
    data: integrations,
    isLoading: intLoading,
    error: intError,
    refetch: refetchIntegrations,
  } = useIntegrations();
  const { data: models } = useModels();
  const { data: agents } = useAgents();
  const { data: fleetStats } = useFleetStats();

  const now = useNow();
  const isOffline = deriveConnection(connectionStore.get(), now) === 'offline';
  const canManage = useCan('integration.manage');

  const rotateKeyMutation = useRotateProviderKeyMutation();
  const toggleMutation = useToggleIntegrationMutation();
  const testMutation = useTestIntegrationMutation();

  // Build O(1) lookup maps once per data change instead of filtering inside render loops (js-index-maps & js-combine-iterations)
  const providerIntegrationsById = useMemo((): Record<ModelProviderId, Integration> => {
    const byId = new Map<string, Integration>();
    for (const item of integrations ?? []) {
      byId.set(item.id, item);
    }
    const result = {} as Record<ModelProviderId, Integration>;
    for (const id of PROVIDER_ORDER) {
      result[id] = byId.get(id) ?? {
        id,
        name: PROVIDER_META[id].name,
        category: 'Model provider',
        status: 'connected',
        enabled: true,
        details: PROVIDER_META[id].tagline,
        lastVerifiedAt: null,
        webhookUrl: null,
      };
    }
    return result;
  }, [integrations]);

  const modelsByProvider = useMemo((): Record<ModelProviderId, ModelCatalogEntry[]> => {
    const grouped: Record<ModelProviderId, ModelCatalogEntry[]> = {
      anthropic: [],
      openai: [],
      deepseek: [],
    };
    for (const m of models ?? []) {
      grouped[m.provider].push(m);
    }
    return grouped;
  }, [models]);

  const agentUsagesByProvider = useMemo((): Record<ModelProviderId, AgentProviderUsage[]> => {
    const grouped: Record<ModelProviderId, AgentProviderUsage[]> = {
      anthropic: [],
      openai: [],
      deepseek: [],
    };
    if (!agents) return grouped;

    for (const agent of agents) {
      for (const providerId of PROVIDER_ORDER) {
        const prefix = `${providerId}/`;
        const primaryMatches = agent.config.model.primary.startsWith(prefix);
        const fallbackMatches = agent.config.model.fallbacks.filter((m) => m.startsWith(prefix));

        if (primaryMatches) {
          grouped[providerId].push({
            agent,
            roleType: 'primary',
            modelIds: [agent.config.model.primary, ...fallbackMatches],
          });
        } else if (fallbackMatches.length > 0) {
          grouped[providerId].push({
            agent,
            roleType: 'fallback',
            modelIds: fallbackMatches,
          });
        }
      }
    }
    return grouped;
  }, [agents]);

  const providerStatsById = useMemo((): Map<ModelProviderId, ProviderStat> => {
    const map = new Map<ModelProviderId, ProviderStat>();
    for (const stat of fleetStats?.providers ?? []) {
      map.set(stat.id, stat);
    }
    return map;
  }, [fleetStats]);

  const activeCount = useMemo(
    () =>
      PROVIDER_ORDER.reduce((count, id) => {
        const p = providerIntegrationsById[id];
        return p.enabled && p.status !== 'disconnected' ? count + 1 : count;
      }, 0),
    [providerIntegrationsById],
  );

  const selectedMeta = PROVIDER_META[selectedProvider];
  const selectedIntegration = providerIntegrationsById[selectedProvider];
  const selectedProviderModelNames = modelsByProvider[selectedProvider]
    .map((m) => m.displayName)
    .join(', ');

  const handleSelectProviderForImport = (providerId: ModelProviderId, focusInput = false) => {
    setValue('providerId', providerId);
    clearErrors('apiKey');
    if (focusInput) {
      setFocus('apiKey');
    }
  };

  const onSubmit = async (values: ImportProviderKeyFormValues) => {
    if (!canManage.allowed || isOffline) return;

    const trimmed = values.apiKey.trim();
    const meta = PROVIDER_META[values.providerId];
    setFeedbackBanner(null);

    try {
      await rotateKeyMutation.mutateAsync({
        id: values.providerId,
        value: trimmed,
        providerName: meta.name,
      });

      // Clear the secret input immediately after write-only import
      resetField('apiKey');
      setShowKey(false);

      // If the provider was paused/disabled, automatically enable it so agents can use the newly imported key
      if (!selectedIntegration.enabled) {
        await toggleMutation.mutateAsync({ id: values.providerId, enabled: true });
      }

      if (values.verifyOnImport) {
        setTestingProviderId(values.providerId);
        try {
          const probe = await testMutation.mutateAsync(values.providerId);
          if ('ok' in probe) {
            setFeedbackBanner({
              providerId: values.providerId,
              ok: probe.ok,
              title: probe.ok
                ? `${meta.name} API key imported and verified (${probe.latencyMs} ms)`
                : `${meta.name} API key imported, but probe reported an issue`,
              detail: probe.message,
            });
          }
        } finally {
          setTestingProviderId(null);
        }
      } else {
        setFeedbackBanner({
          providerId: values.providerId,
          ok: true,
          title: `${meta.name} API key imported (write-only)`,
          detail: `Stored in project vault and ready for ${meta.name} agent routing. The raw key is never returned by the API.`,
        });
      }
    } catch {
      // Handled by useApiMutation toast
    }
  };

  const handleTestProvider = async (providerId: ModelProviderId) => {
    if (!canManage.allowed || isOffline) return;
    setTestingProviderId(providerId);
    try {
      const res = await testMutation.mutateAsync(providerId);
      if ('ok' in res) {
        setFeedbackBanner({
          providerId,
          ok: res.ok,
          title: res.ok
            ? `${PROVIDER_META[providerId].name} connectivity verified (${res.latencyMs} ms)`
            : `${PROVIDER_META[providerId].name} connectivity probe failed`,
          detail: res.message,
        });
      }
    } catch {
      // Error toasted by mutation
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleToggleProvider = async (providerId: ModelProviderId, nextEnabled: boolean) => {
    if (!canManage.allowed || isOffline) return;
    try {
      await toggleMutation.mutateAsync({ id: providerId, enabled: nextEnabled });
    } catch {
      // Error toasted by mutation
    }
  };

  if (intLoading) {
    return LOADING_SKELETON_CARD;
  }

  if (intError) {
    return (
      <Card className="p-5">
        <ErrorState
          error={intError}
          title="Could not load model provider gateways"
          onRetry={() => {
            void refetchIntegrations();
          }}
        />
      </Card>
    );
  }

  const disabledReason = !canManage.allowed
    ? (canManage.reason ?? 'Requires Admin role')
    : isOffline
      ? 'Needs a connection'
      : undefined;

  return (
    <Card className="transition-all duration-150">
      {/* Card Header */}
      <div className="flex flex-col gap-3 border-b border-fluent-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-fluent-blue-light">
            <Icon name="key" size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-white">Model Provider Gateways &amp; API Keys</h2>
              <Badge
                tone={activeCount === PROVIDER_ORDER.length ? 'success' : activeCount > 0 ? 'warning' : 'danger'}
                icon={activeCount === PROVIDER_ORDER.length ? 'check_circle' : 'warning'}
              >
                {activeCount} / {PROVIDER_ORDER.length} Providers Active
              </Badge>
              <Badge tone="neutral" icon="lock">
                Write-Only Vault
              </Badge>
            </div>
            <p className="mt-0.5 text-[12px] text-on-surface-variant">
              Import and rotate API keys for LLM providers used by your autonomous agent fleet. Keys are write-only and never returned after saving.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="key"
            onClick={() => setFocus('apiKey')}
            disabled={!canManage.allowed || isOffline}
            disabledReason={disabledReason}
          >
            Import API Key
          </Button>
        </div>
      </div>

      {/* Card Body */}
      <div className="space-y-6 p-5">
        {/* Import / Rotate Provider API Key Form */}
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          aria-label="Import model provider API key"
          className="rounded-lg border border-fluent-border bg-white/[0.02] p-4 space-y-4"
          noValidate
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-fluent-border pb-3">
            <div>
              <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
                <Icon name="vpn_key" size={16} className="text-fluent-blue-light" />
                Import or Rotate Provider API Key
              </h3>
              <p className="text-[12px] text-on-surface-variant">
                Select a model provider gateway and paste a new API key to provision or rotate credentials for your agents.
              </p>
            </div>
            <a
              href={selectedMeta.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="focus-ring inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-fluent-blue-light hover:underline"
            >
              <span>Get key on {selectedMeta.docsLabel}</span>
              <Icon name="open_in_new" size={13} />
            </a>
          </div>

          {/* Step 1: Provider Selector Tabs/Cards */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-on-surface">
              Target Model Provider
            </label>
            <div
              role="radiogroup"
              aria-label="Target Model Provider"
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
            >
              {PROVIDER_ORDER.map((id) => {
                const meta = PROVIDER_META[id];
                const integration = providerIntegrationsById[id];
                const isSelected = selectedProvider === id;
                const providerModels = modelsByProvider[id];
                const agentUsages = agentUsagesByProvider[id];

                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectProviderForImport(id)}
                    className={cx(
                      'focus-ring flex flex-col justify-between rounded-lg border p-3 text-left transition-all duration-150',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-fluent-elevation-2'
                        : 'border-fluent-border bg-white/[0.02] hover:border-fluent-border-hover hover:bg-white/[0.05]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div className="flex items-center gap-2.5">
                        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-md border', meta.iconBgClass)}>
                          <ProviderGlyph providerId={id} size={16} />
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold text-white">{meta.name}</span>
                            <code className="rounded bg-white/8 px-1 py-0.5 font-mono text-[10px] text-on-surface-variant">
                              {meta.keyPrefix}*
                            </code>
                          </div>
                          <div className="text-[11px] text-on-surface-variant">
                            {providerModels.length} pinned {providerModels.length === 1 ? 'model' : 'models'} · {agentUsages.length} {agentUsages.length === 1 ? 'agent' : 'agents'}
                          </div>
                        </div>
                      </div>
                      <StatusDot
                        tone={
                          !integration.enabled || integration.status === 'paused'
                            ? 'warning'
                            : integration.status === 'connected'
                              ? 'success'
                              : 'danger'
                        }
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: API Key Input */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
            <Field
              label={`${selectedMeta.name} API Key`}
              required
              error={errors.apiKey?.message}
              hint={
                <span>
                  Expected prefix: <code className="font-mono text-white">{selectedMeta.keyPrefix}</code> · Write-only credential for{' '}
                  <span className="text-white font-medium">
                    {selectedProviderModelNames || selectedMeta.name}
                  </span>
                </span>
              }
            >
              {(props) => (
                <div className="relative">
                  <Input
                    {...props}
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={selectedMeta.placeholder}
                    disabled={!canManage.allowed || isOffline || rotateKeyMutation.isPending}
                    className="pr-10 font-mono text-[13px]"
                    {...register('apiKey', {
                      validate: (value, formValues) => {
                        const meta = PROVIDER_META[formValues.providerId];
                        const trimmed = value.trim();
                        if (!trimmed) {
                          return `Enter a valid ${meta.name} API key to import.`;
                        }
                        if (trimmed.length < 8) {
                          return `API key is too short. Expected a key starting with ${meta.keyPrefix}...`;
                        }
                        return true;
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => !prev)}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    disabled={!canManage.allowed || isOffline}
                    className="focus-ring absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:text-white disabled:opacity-50"
                  >
                    <Icon name={showKey ? 'visibility_off' : 'visibility'} size={16} />
                  </button>
                </div>
              )}
            </Field>

            <div className="flex items-center gap-2 lg:mt-6">
              <Button
                type="submit"
                variant="primary"
                icon="upload"
                loading={rotateKeyMutation.isPending || testingProviderId === selectedProvider}
                disabled={!canManage.allowed || isOffline || rotateKeyMutation.isPending}
                disabledReason={disabledReason}
              >
                Import Key to {selectedMeta.name}
              </Button>
            </div>
          </div>

          {/* Step 3: Post-Import Probe Toggle & Security Guarantee */}
          <div className="flex flex-col gap-3 border-t border-fluent-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-on-surface-variant select-none">
              <input
                type="checkbox"
                disabled={!canManage.allowed || isOffline}
                className="focus-ring size-3.5 rounded border-fluent-border bg-white/10 accent-primary"
                {...register('verifyOnImport')}
              />
              <span>Run a 1-token connectivity probe immediately after importing key</span>
            </label>

            {ZERO_READBACK_GUARANTEE_BADGE}
          </div>

          {/* Inline Feedback Banner */}
          {feedbackBanner ? (
            <div
              role="status"
              className={cx(
                'flex items-start justify-between gap-3 rounded-md border p-3 text-[12px]',
                feedbackBanner.ok
                  ? 'border-fluent-success/30 bg-fluent-success-subtle text-fluent-success'
                  : 'border-fluent-error/30 bg-fluent-error-subtle text-fluent-danger-text',
              )}
            >
              <div className="flex items-start gap-2">
                <Icon name={feedbackBanner.ok ? 'check_circle' : 'error'} size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-white">{feedbackBanner.title}</div>
                  {feedbackBanner.detail ? (
                    <div className="mt-0.5 text-on-surface-variant">{feedbackBanner.detail}</div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackBanner(null)}
                aria-label="Dismiss notification"
                className="focus-ring rounded p-0.5 text-on-surface-variant hover:text-white"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          ) : null}
        </form>

        {/* Provider Cards Grid: Status, Models, Agent Assignments, and Actions */}
        <div className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[13px] font-semibold text-white">Configured Provider Gateways &amp; Agent Routing</h3>
              <p className="text-[12px] text-on-surface-variant">
                Each provider gateway supplies pinned models to your specialists. Pausing a provider routes agents to their fallback models.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {PROVIDER_ORDER.map((providerId) => {
              const meta = PROVIDER_META[providerId];
              const integration = providerIntegrationsById[providerId];
              const providerModels = modelsByProvider[providerId];
              const agentUsages = agentUsagesByProvider[providerId];
              const stat = providerStatsById.get(providerId);
              const isPaused = !integration.enabled || integration.status === 'paused';
              const isTesting = testingProviderId === providerId && testMutation.isPending;

              return (
                <div
                  key={providerId}
                  className={cx(
                    'flex flex-col justify-between rounded-lg border p-4 transition-colors',
                    selectedProvider === providerId
                      ? 'border-fluent-border-high bg-white/[0.03]'
                      : 'border-fluent-border bg-white/[0.015] hover:bg-white/[0.025]',
                  )}
                >
                  <div className="space-y-3.5">
                    {/* Provider Card Top Row */}
                    <div className="flex items-start justify-between gap-2 border-b border-fluent-border pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg border', meta.iconBgClass)}>
                          <ProviderGlyph providerId={providerId} size={18} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="text-[14px] font-semibold text-white">{meta.name}</h4>
                            {isPaused ? (
                              <Badge tone="warning" icon="pause_circle">
                                Paused
                              </Badge>
                            ) : integration.status === 'connected' ? (
                              <Badge tone="success" icon="check_circle">
                                Connected
                              </Badge>
                            ) : (
                              <Badge tone="danger" icon="error">
                                {integration.status}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-on-surface-variant">{integration.details}</p>
                        </div>
                      </div>

                      <Toggle
                        label={<span className="sr-only">Enable {meta.name}</span>}
                        checked={!isPaused}
                        disabled={!canManage.allowed || isOffline || toggleMutation.isPending}
                        disabledReason={disabledReason}
                        onChange={(next) => void handleToggleProvider(providerId, next)}
                      />
                    </div>

                    {/* Stored Key Metadata & Telemetry */}
                    <div className="grid grid-cols-2 gap-2 rounded-md border border-white/8 bg-black/25 p-2.5 text-[11px]">
                      <div>
                        <span className="block text-on-surface-muted">Stored Credential</span>
                        <span className="mt-0.5 inline-flex items-center gap-1 font-mono font-medium text-white">
                          <Icon name="lock" size={12} className="text-fluent-success" />
                          {meta.keyPrefix}••••••••
                        </span>
                      </div>
                      <div>
                        <span className="block text-on-surface-muted">Last Verified</span>
                        <span className="mt-0.5 block font-medium text-white">
                          {integration.lastVerifiedAt ? relativeTime(integration.lastVerifiedAt, now) : 'Not verified'}
                        </span>
                      </div>
                      {stat ? (
                        <>
                          <div className="border-t border-white/6 pt-1.5">
                            <span className="block text-on-surface-muted">Gateway Latency (p50)</span>
                            <span className="mt-0.5 block font-mono text-white">
                              {stat.status === 'offline' ? 'Offline' : `${stat.p50LatencyMs} ms`}
                            </span>
                          </div>
                          <div className="border-t border-white/6 pt-1.5">
                            <span className="block text-on-surface-muted">24h Error Rate</span>
                            <span className="mt-0.5 block font-mono text-white">
                              {stat.status === 'offline' ? '—' : `${(stat.errorRate * 100).toFixed(2)}%`}
                            </span>
                          </div>
                        </>
                      ) : null}
                    </div>

                    {/* Pinned Models Provided */}
                    <div>
                      <span className="block text-[11px] font-medium text-on-surface-variant mb-1.5">
                        Pinned Models Available to Fleet
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {providerModels.map((m) => (
                          <Tooltip
                            key={m.id}
                            content={`${m.pinnedModel} · ${(m.contextWindow / 1000).toFixed(0)}k context · $${(m.inputPerMTokUsdMicros / 1_000_000).toFixed(2)}/MTok in`}
                          >
                            <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white">
                              <Icon name="memory" size={12} className="text-on-surface-variant" />
                              <span className="font-medium">{m.displayName}</span>
                            </span>
                          </Tooltip>
                        ))}
                      </div>
                    </div>

                    {/* Agents Using This Provider */}
                    <div>
                      <span className="block text-[11px] font-medium text-on-surface-variant mb-1.5">
                        Agents Routing Through {meta.name}
                      </span>
                      {agentUsages.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {agentUsages.map(({ agent, roleType, modelIds }) => (
                            <Tooltip
                              key={agent.id}
                              content={`${agent.name} (${agent.role}) — ${roleType === 'primary' ? 'Primary' : 'Fallback'}: ${modelIds.join(', ')}`}
                            >
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-0.5 pr-2 pl-1 text-[11px] text-on-surface">
                                <Avatar initials={agent.initials} color={agent.color} size={18} />
                                <span className="font-medium text-white">{agent.name}</span>
                                <span
                                  className={cx(
                                    'rounded px-1 py-px font-mono text-[10px]',
                                    roleType === 'primary'
                                      ? 'bg-primary/20 text-fluent-blue-light'
                                      : 'bg-white/10 text-on-surface-muted',
                                  )}
                                >
                                  {roleType === 'primary' ? 'Primary' : 'Fallback'}
                                </span>
                              </span>
                            </Tooltip>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-on-surface-muted">No agents currently assigned.</p>
                      )}
                    </div>
                  </div>

                  {/* Provider Card Footer Actions */}
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-fluent-border pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="sync"
                      loading={isTesting}
                      disabled={!canManage.allowed || isOffline || isPaused}
                      disabledReason={
                        isPaused
                          ? `Enable ${meta.name} to run a connectivity test`
                          : disabledReason
                      }
                      onClick={() => void handleTestProvider(providerId)}
                    >
                      Test Key
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      icon="key"
                      disabled={!canManage.allowed || isOffline}
                      disabledReason={disabledReason}
                      onClick={() => handleSelectProviderForImport(providerId, true)}
                    >
                      Rotate Key
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Provider Failover & Governance Note */}
        {MULTI_PROVIDER_FAILOVER_NOTE}
      </div>
    </Card>
  );
}
