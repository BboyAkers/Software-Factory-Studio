import { useState, useEffect } from 'react';
import { Button, Drawer, Icon } from '../../../components/ui';
import type { Agent, AgentConfig, ReasoningEffort } from '../../../contracts';
import {
  PROVIDER_META,
  PROVIDER_MODELS,
  defaultModelForAgent,
  findProviderModelOption,
  type ModelProviderId,
  type ProviderModelOption,
} from '../../../domain/providerModels';

interface AgentTuningDrawerProps {
  agent: Agent | null;
  open: boolean;
  activeProvider?: ModelProviderId;
  availableModels?: readonly ProviderModelOption[];
  selectedModelOptionId?: string;
  onClose: () => void;
  onSaveConfig: (
    agentId: string,
    updatedConfig: AgentConfig,
    note?: string,
    selectedModelOptionId?: string,
  ) => Promise<void>;
  isSaving: boolean;
  canTuneAllowed: boolean;
  isOffline: boolean;
}

const REASONING_EFFORTS: readonly ReasoningEffort[] = ['Low', 'Medium', 'High', 'Max'];

export function AgentTuningDrawer({
  agent,
  open,
  activeProvider = 'anthropic',
  availableModels = PROVIDER_MODELS[activeProvider],
  selectedModelOptionId,
  onClose,
  onSaveConfig,
  isSaving,
  canTuneAllowed,
  isOffline,
}: AgentTuningDrawerProps) {
  const [promptText, setPromptText] = useState('');
  const [primaryModelId, setPrimaryModelId] = useState<string>('anthropic/claude-sonnet');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('High');
  const [temperature, setTemperature] = useState(0.2);
  const [saveNote, setSaveNote] = useState('');

  useEffect(() => {
    if (agent) {
      setPromptText(agent.config.systemPrompt);
      const initialModel =
        selectedModelOptionId ??
        defaultModelForAgent(agent.id, activeProvider).id;
      setPrimaryModelId(initialModel);
      setReasoningEffort(agent.config.model.reasoningEffort);
      setTemperature(agent.config.model.temperature);
      setSaveNote('');
    }
  }, [agent, activeProvider, selectedModelOptionId]);

  if (!agent) return null;

  const providerMeta = PROVIDER_META[activeProvider];

  const handleSave = async () => {
    const modelOption = findProviderModelOption(activeProvider, primaryModelId, agent.id);
    const fallbacks = agent.config.model.fallbacks.filter(
      (f) => f !== modelOption.catalogModelId,
    );

    const updatedConfig: AgentConfig = {
      ...agent.config,
      systemPrompt: promptText.trim(),
      model: {
        ...agent.config.model,
        primary: modelOption.catalogModelId,
        fallbacks,
        reasoningEffort,
        temperature,
      },
    };

    const noteText =
      saveNote.trim() ||
      `Updated ${agent.name} to ${modelOption.displayName} (${modelOption.pinnedModel})`;

    await onSaveConfig(agent.id, updatedConfig, noteText, modelOption.id);
    onClose();
  };

  const disabledReason = !canTuneAllowed
    ? 'Requires Maintainer role'
    : isOffline
      ? 'Needs a connection'
      : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          <Icon name="psychology" size={20} className="text-fluent-blue-light" />
          <span>{agent.name} — System Prompt &amp; Tuning</span>
        </div>
      }
      description={
        <span>
          {agent.role} · Active Version <code className="font-mono text-white">v{agent.activeVersion}</code> · Provider <code className="font-mono text-fluent-success">{providerMeta.name}</code>
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={isSaving}
            disabled={!canTuneAllowed || isOffline || isSaving}
            disabledReason={disabledReason}
            onClick={() => void handleSave()}
          >
            Save as New Version
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-[13px]">
        {/* System Prompt Editor */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="agent-system-prompt" className="font-semibold text-white">
              System Prompt
            </label>
            <span className="font-mono text-[11px] text-on-surface-muted">
              {promptText.length} characters
            </span>
          </div>
          <textarea
            id="agent-system-prompt"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            disabled={!canTuneAllowed || isOffline}
            rows={14}
            spellCheck={false}
            className="focus-ring w-full rounded-lg border border-fluent-border bg-black/40 p-3.5 font-mono text-[12px] leading-relaxed text-on-surface placeholder:text-on-surface-muted"
          />
          <p className="text-[11px] text-on-surface-variant">
            Governs the specialist’s reasoning, constraints, and tool invocation boundaries.
          </p>
        </div>

        {/* Model & Reasoning Settings */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-lg border border-fluent-border bg-white/[0.02] p-4">
          <div>
            <label className="block text-[12px] font-medium text-white mb-1.5">
              {providerMeta.name} Model
            </label>
            <select
              value={primaryModelId}
              onChange={(e) => setPrimaryModelId(e.target.value)}
              disabled={!canTuneAllowed || isOffline}
              className="focus-ring w-full rounded-md border border-fluent-border bg-black/40 px-2.5 py-1.5 font-mono text-[12px] text-white"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.pinnedModel})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-white mb-1.5">
              Reasoning Effort
            </label>
            <select
              value={reasoningEffort}
              onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}
              disabled={!canTuneAllowed || isOffline}
              className="focus-ring w-full rounded-md border border-fluent-border bg-black/40 px-2.5 py-1.5 text-[12px] text-white"
            >
              {REASONING_EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-white mb-1.5">
              Temperature ({temperature.toFixed(2)})
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              disabled={!canTuneAllowed || isOffline}
              className="w-full accent-primary"
            />
          </div>
        </div>

        {/* Version Note */}
        <div className="space-y-1.5">
          <label htmlFor="agent-version-note" className="font-semibold text-white">
            Change Note (Optional)
          </label>
          <input
            id="agent-version-note"
            type="text"
            value={saveNote}
            onChange={(e) => setSaveNote(e.target.value)}
            disabled={!canTuneAllowed || isOffline}
            placeholder="e.g. Optimize contract decomposition prompt guidelines"
            className="focus-ring w-full rounded-md border border-fluent-border bg-black/40 px-3 py-2 text-[12px] text-white placeholder:text-on-surface-muted"
          />
        </div>
      </div>
    </Drawer>
  );
}
