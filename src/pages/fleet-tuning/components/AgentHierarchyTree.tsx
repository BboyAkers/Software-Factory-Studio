import type { Agent } from '../../../contracts';
import {
  defaultModelForAgent,
  type ModelProviderId,
  type ProviderModelOption,
} from '../../../domain/providerModels';
import { AgentCard } from './AgentCard';

interface AgentHierarchyTreeProps {
  leadAgent?: Agent;
  specialists: Agent[];
  activeProvider: ModelProviderId;
  availableModels: readonly ProviderModelOption[];
  modelPreferences: Record<string, string>;
  onSelectModel: (agentId: string, modelId: string) => void;
  onRunAgent: (agentId: string) => void;
  onEditPrompt: (agent: Agent) => void;
  runningAgentId: string | null;
  canRunAllowed: boolean;
  canTuneAllowed: boolean;
  isOffline: boolean;
}

export function AgentHierarchyTree({
  leadAgent,
  specialists,
  activeProvider,
  availableModels,
  modelPreferences,
  onSelectModel,
  onRunAgent,
  onEditPrompt,
  runningAgentId,
  canRunAllowed,
  canTuneAllowed,
  isOffline,
}: AgentHierarchyTreeProps) {
  return (
    <div className="space-y-4">
      {/* 1. Root / Lead Agent (Architect-Prime) */}
      {leadAgent && (
        <div className="flex justify-center">
          <AgentCard
            agent={leadAgent}
            isLead
            activeProvider={activeProvider}
            availableModels={availableModels}
            selectedModelId={
              modelPreferences[leadAgent.id] ??
              defaultModelForAgent(leadAgent.id, activeProvider).id
            }
            onSelectModel={(modelId) => onSelectModel(leadAgent.id, modelId)}
            onRunNow={() => onRunAgent(leadAgent.id)}
            onEditPrompt={() => onEditPrompt(leadAgent)}
            isRunning={runningAgentId === leadAgent.id}
            canRunAllowed={canRunAllowed}
            canTuneAllowed={canTuneAllowed}
            isOffline={isOffline}
          />
        </div>
      )}

      {/* 2. Visual Hierarchy Connector Lines (Large screens) */}
      <div className="hidden lg:flex flex-col items-center select-none pointer-events-none py-1" aria-hidden="true">
        {/* Vertical trunk line from lead */}
        <div className="w-px h-6 bg-fluent-border-high" />

        {/* Horizontal crossbar spanning the specialist columns */}
        <div className="relative h-px w-[82%] max-w-6xl bg-fluent-border-high">
          {/* Vertical drops into each of the 5 specialist cards */}
          <div className="absolute left-[10%] top-0 h-6 w-px bg-fluent-border-high" />
          <div className="absolute left-[30%] top-0 h-6 w-px bg-fluent-border-high" />
          <div className="absolute left-[50%] top-0 h-6 w-px bg-fluent-border-high" />
          <div className="absolute left-[70%] top-0 h-6 w-px bg-fluent-border-high" />
          <div className="absolute left-[90%] top-0 h-6 w-px bg-fluent-border-high" />
        </div>

        {/* Spacer matching drop line height */}
        <div className="h-6" />
      </div>

      {/* 3. Specialists Grid (Row underneath) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {specialists.map((specialist) => (
          <AgentCard
            key={specialist.id}
            agent={specialist}
            activeProvider={activeProvider}
            availableModels={availableModels}
            selectedModelId={
              modelPreferences[specialist.id] ??
              defaultModelForAgent(specialist.id, activeProvider).id
            }
            onSelectModel={(modelId) => onSelectModel(specialist.id, modelId)}
            onRunNow={() => onRunAgent(specialist.id)}
            onEditPrompt={() => onEditPrompt(specialist)}
            isRunning={runningAgentId === specialist.id}
            canRunAllowed={canRunAllowed}
            canTuneAllowed={canTuneAllowed}
            isOffline={isOffline}
          />
        ))}
      </div>
    </div>
  );
}
