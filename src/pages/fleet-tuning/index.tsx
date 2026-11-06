import { useMemo, useState, useEffect } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { Page, PageHeader } from '../../components/layout/Page';
import { Badge, Button, Card, ErrorState, Skeleton, StatusDot } from '../../components/ui';
import { useAgents } from '../../api/queries';
import { useCan } from '../../app/session';
import { useNow } from '../../app/useNow';
import { connectionStore, deriveConnection } from '../../api/state';
import type { Agent, AgentConfig, ModelId } from '../../contracts';
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

  const { data: agents, isLoading, error, refetch } = useAgents();
  const canTune = useCan('agent.tune');
  const canRun = useCan('agent.run');

  const now = useNow();
  const isOffline = deriveConnection(connectionStore.get(), now) === 'offline';

  const runMutation = useRunAgentMutation();
  const saveMutation = useSaveAgentConfigMutation();

  const [modelPreferences, setModelPreferences] = useState<Record<string, string>>({});
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [tuningAgent, setTuningAgent] = useState<Agent | null>(null);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);

  // Initialize model preferences from loaded agents
  useEffect(() => {
    if (agents && Object.keys(modelPreferences).length === 0) {
      const initial: Record<string, string> = {};
      for (const a of agents) {
        initial[a.id] = a.config.model.primary;
      }
      setModelPreferences(initial);
    }
  }, [agents, modelPreferences]);

  const leadAgent = useMemo(() => {
    if (!agents || agents.length === 0) return undefined;
    return agents.find((a) => a.id === 'architect-prime') ?? agents[0];
  }, [agents]);

  const specialists = useMemo(() => {
    if (!agents || agents.length === 0) return [];
    return agents.filter((a) => a.id !== leadAgent?.id);
  }, [agents, leadAgent]);

  // Compute if any primary models were modified compared to active config
  const unsavedCount = useMemo(() => {
    if (!agents) return 0;
    let count = 0;
    for (const a of agents) {
      const pref = modelPreferences[a.id];
      if (pref && pref !== a.config.model.primary) {
        count++;
      }
    }
    return count;
  }, [agents, modelPreferences]);

  const handleSelectModel = (agentId: string, modelId: string) => {
    setModelPreferences((prev) => ({
      ...prev,
      [agentId]: modelId,
    }));
  };

  const handleSavePreferences = async () => {
    if (!agents || !canTune.allowed || isOffline || unsavedCount === 0) return;
    setIsSavingPreferences(true);
    try {
      for (const a of agents) {
        const newPrimary = modelPreferences[a.id];
        if (newPrimary && newPrimary !== a.config.model.primary) {
          const updatedConfig: AgentConfig = {
            ...a.config,
            model: {
              ...a.config.model,
              primary: newPrimary as ModelId,
            },
          };
          await saveMutation.mutateAsync({
            agentId: a.id,
            config: updatedConfig,
            note: `Updated primary model routing to ${newPrimary}`,
            agentName: a.name,
          });
        }
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
  ) => {
    const targetAgent = agents?.find((a) => a.id === agentId);
    await saveMutation.mutateAsync({
      agentId,
      config: updatedConfig,
      note,
      agentName: targetAgent?.name,
    });
    setModelPreferences((prev) => ({
      ...prev,
      [agentId]: updatedConfig.model.primary,
    }));
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
        </div>

        <div className="flex items-center gap-2 text-[12px] text-on-surface-muted">
          <StatusDot tone="success" />
          <span>Architect-Prime directs 5 autonomous pipeline specialists</span>
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
        onClose={() => setTuningAgent(null)}
        onSaveConfig={handleSaveAgentConfig}
        isSaving={saveMutation.isPending}
        canTuneAllowed={canTune.allowed}
        isOffline={isOffline}
      />
    </Page>
  );
}
