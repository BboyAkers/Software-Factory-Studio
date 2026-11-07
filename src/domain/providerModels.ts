import { createStore, useStore } from '../api/state';
import type { Agent, Integration, ModelId } from '../contracts';

export type ModelProviderId = 'anthropic' | 'openai' | 'deepseek';

export const PROVIDER_ORDER: readonly ModelProviderId[] = ['anthropic', 'openai', 'deepseek'];

export interface ProviderMeta {
  id: ModelProviderId;
  name: string;
  modelLabel: string;
  keyPrefix: string;
  placeholder: string;
}

export const PROVIDER_META: Record<ModelProviderId, ProviderMeta> = {
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
    modelLabel: 'GPT-4o & o3',
    keyPrefix: 'sk-proj-',
    placeholder: 'sk-proj-...',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    modelLabel: 'DeepSeek R1 & V3',
    keyPrefix: 'sk-',
    placeholder: 'sk-...',
  },
};

export interface ProviderModelOption {
  /** Unique option identifier within the provider catalog */
  id: string;
  /** Underlying v1 contract ModelId used when persisting to AgentConfigSchema */
  catalogModelId: ModelId;
  /** Provider that serves this model */
  provider: ModelProviderId;
  /** Concise label shown in the segmented pill control on AgentCard */
  shortLabel: string;
  /** Full human-readable model name */
  displayName: string;
  /** Pinned release version string displayed under the model selector */
  pinnedModel: string;
  /** Capability tier for automatic specialist role assignment */
  tier: 'flagship' | 'balanced' | 'specialized' | 'fast';
}

export const PROVIDER_MODELS: Record<ModelProviderId, readonly ProviderModelOption[]> = {
  anthropic: [
    {
      id: 'anthropic/claude-opus',
      catalogModelId: 'anthropic/claude-opus',
      provider: 'anthropic',
      shortLabel: 'Opus',
      displayName: 'Claude Opus 4.1',
      pinnedModel: 'claude-opus-4-1-20250805',
      tier: 'flagship',
    },
    {
      id: 'anthropic/claude-sonnet',
      catalogModelId: 'anthropic/claude-sonnet',
      provider: 'anthropic',
      shortLabel: 'Sonnet',
      displayName: 'Claude Sonnet 4',
      pinnedModel: 'claude-sonnet-4-20250514',
      tier: 'balanced',
    },
    {
      id: 'anthropic/claude-sonnet-3-7',
      catalogModelId: 'anthropic/claude-sonnet',
      provider: 'anthropic',
      shortLabel: 'Sonnet 3.7',
      displayName: 'Claude 3.7 Sonnet',
      pinnedModel: 'claude-3-7-sonnet-20250219',
      tier: 'specialized',
    },
    {
      id: 'anthropic/claude-haiku',
      catalogModelId: 'anthropic/claude-haiku',
      provider: 'anthropic',
      shortLabel: 'Haiku',
      displayName: 'Claude 3.5 Haiku',
      pinnedModel: 'claude-3-5-haiku-20241022',
      tier: 'fast',
    },
  ],
  openai: [
    {
      id: 'openai/o3',
      catalogModelId: 'openai/gpt-4o',
      provider: 'openai',
      shortLabel: 'o3',
      displayName: 'OpenAI o3',
      pinnedModel: 'o3-2025-04-16',
      tier: 'flagship',
    },
    {
      id: 'openai/gpt-4.1',
      catalogModelId: 'openai/gpt-4o',
      provider: 'openai',
      shortLabel: 'GPT-4.1',
      displayName: 'GPT-4.1',
      pinnedModel: 'gpt-4.1-2025-04-14',
      tier: 'balanced',
    },
    {
      id: 'openai/gpt-4o',
      catalogModelId: 'openai/gpt-4o',
      provider: 'openai',
      shortLabel: 'GPT-4o',
      displayName: 'GPT-4o',
      pinnedModel: 'gpt-4o-2024-11-20',
      tier: 'specialized',
    },
    {
      id: 'openai/gpt-4o-mini',
      catalogModelId: 'openai/gpt-4o',
      provider: 'openai',
      shortLabel: '4o-mini',
      displayName: 'GPT-4o mini',
      pinnedModel: 'gpt-4o-mini-2024-07-18',
      tier: 'fast',
    },
  ],
  deepseek: [
    {
      id: 'deepseek/deepseek-r1',
      catalogModelId: 'deepseek/deepseek-v3',
      provider: 'deepseek',
      shortLabel: 'R1',
      displayName: 'DeepSeek-R1',
      pinnedModel: 'deepseek-reasoner-r1-0528',
      tier: 'flagship',
    },
    {
      id: 'deepseek/deepseek-v3',
      catalogModelId: 'deepseek/deepseek-v3',
      provider: 'deepseek',
      shortLabel: 'V3',
      displayName: 'DeepSeek-V3',
      pinnedModel: 'deepseek-chat-v3-0324',
      tier: 'balanced',
    },
    {
      id: 'deepseek/deepseek-coder',
      catalogModelId: 'deepseek/deepseek-v3',
      provider: 'deepseek',
      shortLabel: 'Coder',
      displayName: 'DeepSeek-Coder-V2',
      pinnedModel: 'deepseek-coder-v2-0724',
      tier: 'specialized',
    },
    {
      id: 'deepseek/deepseek-lite',
      catalogModelId: 'deepseek/deepseek-v3',
      provider: 'deepseek',
      shortLabel: 'V3-Lite',
      displayName: 'DeepSeek-V3-Lite',
      pinnedModel: 'deepseek-chat-v3-lite',
      tier: 'fast',
    },
  ],
};

export const KNOWN_AGENT_IDS = [
  'architect-prime',
  'codecraft',
  'gatekeeper',
  'secops-vanguard',
  'docuforge',
  'sentrywatch',
] as const;

export function getModelsForProvider(provider: ModelProviderId): readonly ProviderModelOption[] {
  return PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.anthropic;
}

/**
 * Maps each specialist in the Software Factory crew to its recommended model tier
 * within the active provider's model lineup.
 */
export function defaultModelForAgent(agentId: string, provider: ModelProviderId): ProviderModelOption {
  const models = getModelsForProvider(provider);
  const flagship = models.find((m) => m.tier === 'flagship') ?? models[0]!;
  const balanced = models.find((m) => m.tier === 'balanced') ?? models[1] ?? models[0]!;
  const specialized = models.find((m) => m.tier === 'specialized') ?? balanced;
  const fast = models.find((m) => m.tier === 'fast') ?? models[models.length - 1]!;

  switch (agentId) {
    case 'architect-prime':
      return flagship;
    case 'codecraft':
      return provider === 'deepseek' ? specialized : balanced;
    case 'secops-vanguard':
      return provider === 'anthropic' ? balanced : flagship;
    case 'docuforge':
      return fast;
    case 'gatekeeper':
    case 'sentrywatch':
    default:
      return provider === 'openai' ? specialized : balanced;
  }
}

export function findProviderModelOption(
  provider: ModelProviderId,
  optionIdOrCatalogId: string,
  agentId?: string,
): ProviderModelOption {
  const models = getModelsForProvider(provider);
  const exact = models.find((m) => m.id === optionIdOrCatalogId);
  if (exact) return exact;
  if (agentId) return defaultModelForAgent(agentId, provider);
  const byCatalog = models.find((m) => m.catalogModelId === optionIdOrCatalogId);
  return byCatalog ?? models[1] ?? models[0]!;
}

// ---------------------------------------------------------------------------
// Reactive Store (synced with localStorage so Settings -> Fleet stays in sync)
// ---------------------------------------------------------------------------

export interface ProviderGatewayState {
  activeProviderByProject: Record<string, ModelProviderId>;
  selectedModelByProject: Record<string, Record<string, string>>;
  savedModelByProject: Record<string, Record<string, string>>;
}

const STORAGE_KEY = 'sf.providerGateway.v1';

function loadInitialState(): ProviderGatewayState {
  if (typeof window === 'undefined') {
    return { activeProviderByProject: {}, selectedModelByProject: {}, savedModelByProject: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeProviderByProject: {}, selectedModelByProject: {}, savedModelByProject: {} };
    const parsed = JSON.parse(raw) as Partial<ProviderGatewayState>;
    return {
      activeProviderByProject: parsed.activeProviderByProject ?? {},
      selectedModelByProject: parsed.selectedModelByProject ?? {},
      savedModelByProject: parsed.savedModelByProject ?? {},
    };
  } catch {
    return { activeProviderByProject: {}, selectedModelByProject: {}, savedModelByProject: {} };
  }
}

function persistState(state: ProviderGatewayState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export const providerGatewayStore = createStore<ProviderGatewayState>(loadInitialState());

export function activateProviderForProject(
  projectId: string,
  provider: ModelProviderId,
  agentIds: readonly string[] = KNOWN_AGENT_IDS,
): void {
  if (!projectId) return;
  const defaults: Record<string, string> = {};
  for (const id of agentIds) {
    defaults[id] = defaultModelForAgent(id, provider).id;
  }

  providerGatewayStore.set((prev) => {
    const next: ProviderGatewayState = {
      activeProviderByProject: {
        ...prev.activeProviderByProject,
        [projectId]: provider,
      },
      selectedModelByProject: {
        ...prev.selectedModelByProject,
        [projectId]: defaults,
      },
      savedModelByProject: {
        ...prev.savedModelByProject,
        [projectId]: { ...defaults },
      },
    };
    persistState(next);
    return next;
  });
}

export function selectAgentModelForProject(
  projectId: string,
  agentId: string,
  modelOptionId: string,
): void {
  if (!projectId) return;
  providerGatewayStore.set((prev) => {
    const currentProjectMap = prev.selectedModelByProject[projectId] ?? {};
    const next: ProviderGatewayState = {
      ...prev,
      selectedModelByProject: {
        ...prev.selectedModelByProject,
        [projectId]: {
          ...currentProjectMap,
          [agentId]: modelOptionId,
        },
      },
    };
    persistState(next);
    return next;
  });
}

export function commitSavedModelsForProject(
  projectId: string,
  updates: Record<string, string>,
): void {
  if (!projectId) return;
  providerGatewayStore.set((prev) => {
    const currentSelected = prev.selectedModelByProject[projectId] ?? {};
    const currentSaved = prev.savedModelByProject[projectId] ?? {};
    const next: ProviderGatewayState = {
      ...prev,
      selectedModelByProject: {
        ...prev.selectedModelByProject,
        [projectId]: { ...currentSelected, ...updates },
      },
      savedModelByProject: {
        ...prev.savedModelByProject,
        [projectId]: { ...currentSaved, ...updates },
      },
    };
    persistState(next);
    return next;
  });
}

export function resetProviderGatewayStore(): void {
  const empty: ProviderGatewayState = {
    activeProviderByProject: {},
    selectedModelByProject: {},
    savedModelByProject: {},
  };
  providerGatewayStore.set(empty);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Resolves which model provider is currently active for the project:
 * 1. Explicit provider saved in Settings (`providerGatewayStore`)
 * 2. Most recently verified connected model provider in `integrations` (when timestamps differ)
 * 3. Provider prefix of the lead agent's primary model in `agents`
 * 4. Defaults to `'anthropic'`
 */
export function resolveActiveProvider(
  projectId: string,
  integrations?: readonly Integration[],
  agents?: readonly Agent[],
  storeState: ProviderGatewayState = providerGatewayStore.get(),
): ModelProviderId {
  const explicit = storeState.activeProviderByProject[projectId];
  if (explicit && PROVIDER_ORDER.includes(explicit)) {
    return explicit;
  }

  if (integrations && integrations.length > 0) {
    const providerItems = integrations.filter(
      (i): i is Integration & { id: ModelProviderId } =>
        PROVIDER_ORDER.includes(i.id as ModelProviderId) &&
        i.enabled &&
        i.status === 'connected' &&
        Boolean(i.lastVerifiedAt),
    );
    if (providerItems.length > 0) {
      const timestamps = providerItems.map((i) => Date.parse(i.lastVerifiedAt!));
      const maxTs = Math.max(...timestamps);
      const minTs = Math.min(...timestamps);
      // If one provider was verified more recently than the initial seed timestamp
      if (maxTs > minTs) {
        const newest = providerItems.find((i) => Date.parse(i.lastVerifiedAt!) === maxTs);
        if (newest) return newest.id;
      }
    }
  }

  if (agents && agents.length > 0) {
    const leadPrimary = agents[0]!.config.model.primary;
    if (leadPrimary.startsWith('openai/')) return 'openai';
    if (leadPrimary.startsWith('deepseek/')) return 'deepseek';
    if (leadPrimary.startsWith('anthropic/')) return 'anthropic';
  }

  return 'anthropic';
}

export function useProviderGateway() {
  return useStore(providerGatewayStore);
}

