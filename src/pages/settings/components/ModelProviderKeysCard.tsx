import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useIntegrations } from '../../../api/queries';
import { connectionStore, deriveConnection } from '../../../api/state';
import { useCan } from '../../../app/session';
import { useNow } from '../../../app/useNow';
import {
  Button,
  Card,
  ErrorState,
  Icon,
  Input,
  Skeleton,
  StatusDot,
  cx,
} from '../../../components/ui';
import type { Integration } from '../../../contracts';
import { relativeTime } from '../../../domain/format';
import { useRotateProviderKeyMutation } from '../mutations/useRotateProviderKeyMutation';
import { useToggleIntegrationMutation } from '../mutations/useToggleIntegrationMutation';

export type ModelProviderId = 'anthropic' | 'openai' | 'deepseek';

interface ProviderMeta {
  id: ModelProviderId;
  name: string;
  modelLabel: string;
  keyPrefix: string;
  placeholder: string;
}

const PROVIDER_META: Record<ModelProviderId, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    modelLabel: 'Claude',
    keyPrefix: 'sk-ant-',
    placeholder: 'sk-ant-...',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    modelLabel: 'GPT-4o',
    keyPrefix: 'sk-proj-',
    placeholder: 'sk-proj-...',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    modelLabel: 'DeepSeek-V3',
    keyPrefix: 'sk-',
    placeholder: 'sk-...',
  },
};

const PROVIDER_ORDER: readonly ModelProviderId[] = ['anthropic', 'openai', 'deepseek'];

const LOADING_SKELETON_CARD = (
  <Card className="p-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-4 w-20" />
    </div>
    <Skeleton className="mt-3 h-4 w-3/4" />
    <div className="mt-5 flex gap-2">
      <Skeleton className="h-8 w-24 rounded-md" />
      <Skeleton className="h-8 w-24 rounded-md" />
      <Skeleton className="h-8 w-24 rounded-md" />
    </div>
    <div className="mt-5 flex items-center gap-3">
      <Skeleton className="h-10 flex-1 rounded-md" />
      <Skeleton className="h-10 w-24 rounded-md" />
    </div>
  </Card>
);

interface ImportProviderKeyFormValues {
  providerId: ModelProviderId;
  apiKey: string;
}

export function ModelProviderKeysCard() {
  const [showKey, setShowKey] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    resetField,
    formState: { errors },
  } = useForm<ImportProviderKeyFormValues>({
    defaultValues: {
      providerId: 'anthropic',
      apiKey: '',
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

  const now = useNow();
  const isOffline = deriveConnection(connectionStore.get(), now) === 'offline';
  const canManage = useCan('integration.manage');

  const rotateKeyMutation = useRotateProviderKeyMutation();
  const toggleMutation = useToggleIntegrationMutation();

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
        status: 'disconnected',
        enabled: false,
        details: '',
        lastVerifiedAt: null,
        webhookUrl: null,
      };
    }
    return result;
  }, [integrations]);

  const selectedMeta = PROVIDER_META[selectedProvider];
  const selectedIntegration = providerIntegrationsById[selectedProvider];
  const isConnected =
    selectedIntegration.enabled && selectedIntegration.status === 'connected';

  const handleSelectProvider = (providerId: ModelProviderId) => {
    setValue('providerId', providerId);
    clearErrors('apiKey');
  };

  const onSubmit = async (values: ImportProviderKeyFormValues) => {
    if (!canManage.allowed || isOffline) return;

    const trimmed = values.apiKey.trim();
    const meta = PROVIDER_META[values.providerId];

    try {
      await rotateKeyMutation.mutateAsync({
        id: values.providerId,
        value: trimmed,
        providerName: meta.name,
      });

      resetField('apiKey');
      setShowKey(false);

      if (!selectedIntegration.enabled) {
        await toggleMutation.mutateAsync({ id: values.providerId, enabled: true });
      }
    } catch {
      // Error toasted by mutation
    }
  };

  if (intLoading) {
    return LOADING_SKELETON_CARD;
  }

  if (intError) {
    return (
      <Card className="p-6">
        <ErrorState
          error={intError}
          title="Could not load model provider keys"
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
    <Card className="p-6">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-4">
        <div className="font-mono text-[12px] font-medium tracking-[0.14em] uppercase">
          <span className="text-on-surface-muted">// </span>
          <span className="text-fluent-success">MODEL ACCESS</span>
        </div>

        <div className="inline-flex items-center gap-2 font-mono text-[12px]">
          <StatusDot tone={isConnected ? 'success' : 'danger'} />
          <span className={isConnected ? 'text-fluent-success' : 'text-fluent-danger-text'}>
            {isConnected ? 'connected' : 'no key'}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="mt-2.5 text-[13px] leading-5 text-on-surface-variant">
        The crew runs on {selectedMeta.modelLabel} via your {selectedMeta.name} API key. It is stored server-side in the project vault and never sent to the browser or committed anywhere.
      </p>

      {/* Provider Selector Tabs */}
      <div
        role="radiogroup"
        aria-label="Model Provider"
        className="mt-4 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-fluent-border bg-black/25 p-1"
      >
        {PROVIDER_ORDER.map((id) => {
          const meta = PROVIDER_META[id];
          const integration = providerIntegrationsById[id];
          const active = integration.enabled && integration.status === 'connected';
          const isSelected = selectedProvider === id;

          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelectProvider(id)}
              className={cx(
                'focus-ring inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
                isSelected
                  ? 'bg-white/10 text-white shadow-xs'
                  : 'text-on-surface-variant hover:bg-white/[0.04] hover:text-white',
              )}
            >
              <StatusDot tone={active ? 'success' : 'danger'} />
              <span>{meta.name}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Provider Status */}
      <div className="mt-5 flex items-center gap-3">
        <Icon name="key" size={20} className="shrink-0 text-on-surface-variant" />
        <div>
          <h3 className="text-[15px] font-semibold text-white">{selectedMeta.name} API key</h3>
          <p className="mt-0.5 font-mono text-[12px] text-on-surface-variant">
            {isConnected
              ? `connected — the crew can call ${selectedMeta.modelLabel}${selectedIntegration.lastVerifiedAt
                ? ` (verified ${relativeTime(selectedIntegration.lastVerifiedAt, now)})`
                : ''
              }`
              : `not connected — the crew cannot call ${selectedMeta.modelLabel}`}
          </p>
        </div>
      </div>

      {/* Simple Input + Save Key Row */}
      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        aria-label={`Save ${selectedMeta.name} API key`}
        noValidate
        className="mt-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              aria-label={`${selectedMeta.name} API key`}
              aria-invalid={Boolean(errors.apiKey)}
              placeholder={selectedMeta.placeholder}
              disabled={!canManage.allowed || isOffline || rotateKeyMutation.isPending}
              className="h-10 bg-black/30 pr-9 font-mono text-[13px]"
              {...register('apiKey', {
                validate: (value, formValues) => {
                  const meta = PROVIDER_META[formValues.providerId];
                  const trimmed = value.trim();
                  if (!trimmed) {
                    return `Enter a valid ${meta.name} API key.`;
                  }
                  if (trimmed.length < 8) {
                    return `Expected a key starting with ${meta.keyPrefix}`;
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
              className="focus-ring absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:text-white disabled:opacity-50"
            >
              <Icon name={showKey ? 'visibility_off' : 'visibility'} size={16} />
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={rotateKeyMutation.isPending}
            disabled={!canManage.allowed || isOffline || rotateKeyMutation.isPending}
            disabledReason={disabledReason}
            className="h-10 shrink-0 px-4"
          >
            Save key
          </Button>
        </div>

        {errors.apiKey?.message ? (
          <p role="alert" className="mt-2 text-[12px] text-fluent-danger-text">
            {errors.apiKey.message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
