import { useMemo, useState } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { AppLink } from '../../app/nav';
import { toast } from '../../app/toast';
import { Page, PageHeader } from '../../components/layout/Page';
import { Badge, Button, Card, ErrorState, Skeleton, StatusDot } from '../../components/ui';
import { useAgents, useIntegrations, useProjectId } from '../../api/queries';
import { useCan } from '../../app/session';
import { useNow } from '../../app/useNow';
import { connectionStore, deriveConnection } from '../../api/state';
import type { Agent, AgentConfig } from '../../contracts';
import {
  PROVIDER_META,
  commitSavedModelsForProject,
  defaultModelForAgent,
  findProviderModelOption,
  getModelsForProvider,
  resolveActiveProvider,
  selectAgentModelForProject,
  useProviderGateway,
} from '../../domain/providerModels';
import { AgentHierarchyTree } from './components/AgentHierarchyTree';
import { AgentTuningDrawer } from './components/AgentTuningDrawer';
import { useRunAgentMutation } from './mutations/useRunAgentMutation';
import { useSaveAgentConfigMutation } from './mutations/useSaveAgentConfigMutation';

const LOADING_FLEET_SKELETON = (
  <div className="space-y-6">
    <div className="flex justify-center">
      <Card className="w-full max-w-md p-5">
        <div className="flex flex-col items-center space-y-3">
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-60" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </Card>
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Card key={i} className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </Card>
      ))}
    </div>
  </div>
);

export default function FleetTuningPage() {
  usePageTitle('Fleet & Tuning');

  const projectId = useProjectId();
  const { data: agents, isLoading, error, refetch } = useAgents();
  const { data: integrations } = useIntegrations();
  const gatewayState = useProviderGateway();

  const canTune = useCan('agent.tune');
  const canRun = useCan('agent.run');

  const now = useNow();
  const isOffline = deriveConnection(connectionStore.get(), now) === 'offline';

  const runMutation = useRunAgentMutation();
  const saveMutation = useSaveAgentConfigMutation();

  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [tuningAgent, setTuningAgent] = useState<Agent | null>(null);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Dynamically resolve active provider from Settings key rotation or project integrations
  const activeProvider = useMemo(
    () => resolveActiveProvider(projectId, integrations, agents, gatewayState),
    [projectId, integrations, agents, gatewayState],
  );

  const availableModels = useMemo(
    () => getModelsForProvider(activeProvider),
    [activeProvider],
  );

  const providerMeta = PROVIDER_META[activeProvider];

  // Current selected model option ID per agent for the active provider
  const modelPreferences = useMemo(() => {
    const map: Record<string, string> = {};
    if (!agents) return map;
    const storedMap = gatewayState.selectedModelByProject[projectId] ?? {};
    for (const a of agents) {
      const candidate = storedMap[a.id];
      const validInProvider =
        candidate && availableModels.some((m) => m.id === candidate);
      if (validInProvider) {
        map[a.id] = candidate;
      } else if (
        activeProvider === 'anthropic' &&
        availableModels.some((m) => m.id === a.config.model.primary)
      ) {
        map[a.id] = a.config.model.primary;
      } else {
        map[a.id] = defaultModelForAgent(a.id, activeProvider).id;
      }
    }
    return map;
  }, [agents, gatewayState.selectedModelByProject, projectId, availableModels, activeProvider]);

  // Saved baseline model option ID per agent for the active provider
  const savedPreferences = useMemo(() => {
    const map: Record<string, string> = {};
    if (!agents) return map;
    const storedSaved = gatewayState.savedModelByProject[projectId] ?? {};
    for (const a of agents) {
      const candidate = storedSaved[a.id];
      const validInProvider =
        candidate && availableModels.some((m) => m.id === candidate);
      if (validInProvider) {
        map[a.id] = candidate;
      } else if (
        activeProvider === 'anthropic' &&
        availableModels.some((m) => m.id === a.config.model.primary)
      ) {
        map[a.id] = a.config.model.primary;
      } else {
        map[a.id] = defaultModelForAgent(a.id, activeProvider).id;
      }
    }
    return map;
  }, [agents, gatewayState.savedModelByProject, projectId, availableModels, activeProvider]);

  const leadAgent = useMemo(() => {
    if (!agents || agents.length === 0) return undefined;
    return agents.find((a) => a.id === 'architect-prime') ?? agents[0];
  }, [agents]);

  const specialists = useMemo(() => {
    if (!agents || agents.length === 0) return [];
    return agents.filter((a) => a.id !== leadAgent?.id);
  }, [agents, leadAgent]);

  // Compute if any agent's selected model differs from its saved baseline
  const unsavedCount = useMemo(() => {
    if (!agents) return 0;
    let count = 0;
    for (const a of agents) {
      if (modelPreferences[a.id] !== savedPreferences[a.id]) {
        count++;
      }
    }
    return count;
  }, [agents, modelPreferences, savedPreferences]);

  const handleSelectModel = (agentId: string, modelId: string) => {
    selectAgentModelForProject(projectId, agentId, modelId);
  };

  const handleSavePreferences = async () => {
    if (!agents || !canTune.allowed || isOffline || unsavedCount === 0) return;
    setIsSavingPreferences(true);
    try {
      const committed: Record<string, string> = {};
      let mutatedBackend = false;

      for (const a of agents) {
        const chosenId = modelPreferences[a.id];
        if (!chosenId) continue;
        committed[a.id] = chosenId;

        if (chosenId !== savedPreferences[a.id]) {
          const modelOption = findProviderModelOption(activeProvider, chosenId, a.id);
          if (modelOption.catalogModelId !== a.config.model.primary) {
            const fallbacks = a.config.model.fallbacks.filter(
              (f) => f !== modelOption.catalogModelId,
            );
            const updatedConfig: AgentConfig = {
              ...a.config,
              model: {
                ...a.config.model,
                primary: modelOption.catalogModelId,
                fallbacks,
              },
            };
            await saveMutation.mutateAsync({
              agentId: a.id,
              config: updatedConfig,
              note: `Updated primary model routing to ${modelOption.displayName} (${modelOption.pinnedModel})`,
              agentName: a.name,
            });
            mutatedBackend = true;
          }
        }
      }

      commitSavedModelsForProject(projectId, committed);
      if (!mutatedBackend) {
        toast.success(`Saved ${providerMeta.name} model preferences for the agent fleet.`);
      }
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleRunAgent = async (agentId: string) => {
    if (!canRun.allowed || isOffline) return;
    setRunningAgentId(agentId);
    try {
      await runMutation.mutateAsync(agentId);
    } finally {
      setRunningAgentId(null);
    }
  };

  const handleSaveAgentConfig = async (
    agentId: string,
    updatedConfig: AgentConfig,
    note?: string,
    selectedModelOptionId?: string,
  ) => {
    const targetAgent = agents?.find((a) => a.id === agentId);
    const currentConfig = targetAgent?.config;
    const configChanged =
      !currentConfig ||
      JSON.stringify(currentConfig) !== JSON.stringify(updatedConfig);

    if (configChanged) {
      await saveMutation.mutateAsync({
        agentId,
        config: updatedConfig,
        note,
        agentName: targetAgent?.name,
      });
    } else {
      toast.success(`Updated ${targetAgent?.name ?? agentId} model configuration.`);
    }

    const optionId = selectedModelOptionId ?? updatedConfig.model.primary;
    commitSavedModelsForProject(projectId, { [agentId]: optionId });
  };

  const saveDisabledReason = !canTune.allowed
    ? (canTune.reason ?? 'Requires Maintainer role')
    : isOffline
      ? 'Needs a connection'
      : undefined;

  return (
    <Page scroll="page">
      {/* Standard Application PageHeader */}
      <PageHeader
        title="Fleet & Tuning"
        description="Autonomous specialist hierarchy, model inference routing, and prompt boundary governance."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="purple" icon="hub">
              {agents?.length ?? 6} Specialists
            </Badge>
            <Badge tone="info" icon="key">
              {providerMeta.name} · {availableModels.map((m) => m.shortLabel).join(' / ')}
            </Badge>
            {unsavedCount > 0 ? (
              <Badge tone="warning" icon="pending">
                {unsavedCount} Unsaved {unsavedCount === 1 ? 'Change' : 'Changes'}
              </Badge>
            ) : (
              <Badge tone="success" icon="check_circle">
                Inference Synced
              </Badge>
            )}
          </div>
        }
        actions={
          <Button
            variant={unsavedCount > 0 ? 'primary' : 'secondary'}
            size="sm"
            icon={unsavedCount > 0 ? 'save' : 'check'}
            onClick={() => void handleSavePreferences()}
            loading={isSavingPreferences}
            disabled={unsavedCount === 0 || !canTune.allowed || isOffline || isSavingPreferences}
            disabledReason={saveDisabledReason}
          >
            Save preferences
          </Button>
        }
      />

      {/* Hierarchy Section Subtitle */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-fluent-border pb-3">
        <div className="font-mono text-[12px] font-medium tracking-[0.14em] uppercase flex items-center gap-1.5">
          <span className="text-on-surface-muted">// </span>
          <span className="text-fluent-success">AGENT MODELS</span>
          <span className="text-on-surface-muted">·</span>
          <span className="text-fluent-blue-light">{providerMeta.name} GATEWAY</span>
        </div>

        <div className="flex items-center gap-3 text-[12px] text-on-surface-muted">
          <div className="flex items-center gap-1.5">
            <StatusDot tone="success" />
            <span>
              Loaded {availableModels.length} {providerMeta.name} models ({availableModels.map((m) => m.shortLabel).join(', ')})
            </span>
          </div>
          <AppLink
            to="settings"
            className="text-brand hover:underline font-medium"
          >
            Change provider in Settings
          </AppLink>
        </div>
      </div>

      {/* Main Hierarchy Tree View */}
      {isLoading ? (
        LOADING_FLEET_SKELETON
      ) : error ? (
        <Card className="p-6">
          <ErrorState
            error={error}
            title="Could not load agent fleet"
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <AgentHierarchyTree
          leadAgent={leadAgent}
          specialists={specialists}
          activeProvider={activeProvider}
          availableModels={availableModels}
          modelPreferences={modelPreferences}
          onSelectModel={handleSelectModel}
          onRunAgent={(id) => void handleRunAgent(id)}
          onEditPrompt={(a) => setTuningAgent(a)}
          runningAgentId={runningAgentId}
          canRunAllowed={canRun.allowed}
          canTuneAllowed={canTune.allowed}
          isOffline={isOffline}
        />
      )}

      {/* System Prompt & Tuning Drawer */}
      <AgentTuningDrawer
        agent={tuningAgent}
        open={Boolean(tuningAgent)}
        activeProvider={activeProvider}
        availableModels={availableModels}
        selectedModelOptionId={tuningAgent ? modelPreferences[tuningAgent.id] : undefined}
        onClose={() => setTuningAgent(null)}
        onSaveConfig={handleSaveAgentConfig}
        isSaving={saveMutation.isPending}
        canTuneAllowed={canTune.allowed}
        isOffline={isOffline}
      />
    </Page>
  );
}
