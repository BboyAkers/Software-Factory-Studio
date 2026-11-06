import { Avatar, Badge, Button, Card, StatusDot, cx } from '../../../components/ui';
import type { Agent } from '../../../contracts';

export interface ModelOption {
  id: string;
  shortLabel: string;
  pinnedModel: string;
}

export const FLEET_MODELS: readonly ModelOption[] = [
  { id: 'anthropic/claude-opus', shortLabel: 'Opus', pinnedModel: 'claude-opus-4-1-20250805' },
  { id: 'anthropic/claude-sonnet', shortLabel: 'Sonnet', pinnedModel: 'claude-sonnet-4-20250514' },
  { id: 'anthropic/claude-haiku', shortLabel: 'Haiku', pinnedModel: 'claude-3-5-haiku-20241022' },
  { id: 'openai/gpt-4o', shortLabel: 'GPT-4o', pinnedModel: 'gpt-4o-2024-11-20' },
  { id: 'deepseek/deepseek-v3', shortLabel: 'DeepSeek', pinnedModel: 'deepseek-chat-v3-0324' },
];

const AGENT_ROLE_COLOR: Record<string, string> = {
  purple: 'text-fluent-purple-text',
  blue: 'text-fluent-blue-light',
  green: 'text-fluent-success',
  red: 'text-fluent-danger-text',
  amber: 'text-fluent-warning',
  sky: 'text-fluent-blue-light',
};

interface AgentCardProps {
  agent: Agent;
  isLead?: boolean;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  onRunNow: () => void;
  onEditPrompt: () => void;
  isRunning?: boolean;
  canRunAllowed?: boolean;
  canTuneAllowed?: boolean;
  isOffline?: boolean;
}

export function AgentCard({
  agent,
  isLead = false,
  selectedModelId,
  onSelectModel,
  onRunNow,
  onEditPrompt,
  isRunning = false,
  canRunAllowed = true,
  canTuneAllowed = true,
  isOffline = false,
}: AgentCardProps) {
  const roleColorClass = (agent.color && AGENT_ROLE_COLOR[agent.color]) ?? 'text-fluent-blue-light';
  const fallbackModel = FLEET_MODELS[1]!;
  const activeModelOption = FLEET_MODELS.find((m) => m.id === selectedModelId) ?? fallbackModel;

  const description =
    agent.responsibilities[0] ??
    agent.config.role ??
    'Autonomous specialist operating within the Software Factory.';

  const runDisabledReason = !agent.canRunNow
    ? 'Runs automatically within pipeline workpacks'
    : !canRunAllowed
      ? 'Requires Maintainer role'
      : isOffline
        ? 'Needs a connection'
        : undefined;

  return (
    <Card
      className={cx(
        'group flex flex-col justify-between p-4 transition-all duration-150',
        'hover:border-fluent-border-hover hover:shadow-fluent-elevation-4',
        isLead ? 'w-full max-w-md mx-auto border-fluent-purple/30' : 'w-full',
      )}
    >
      {/* Top Section: Avatar, Title, Role Subtitle, Description */}
      <div>
        {isLead ? (
          // Centered layout for Lead Architect
          <div className="flex flex-col items-center text-center">
            <Avatar initials={agent.initials} color={agent.color} size={42} title={agent.name} />
            <div className="mt-2.5 flex items-center gap-1.5">
              <h3 className="text-[15px] font-semibold text-white">{agent.name}</h3>
              <Badge tone="purple" mono className="text-[11px] h-4.5 px-1.5">
                v{agent.activeVersion}
              </Badge>
            </div>
            <div className={cx('text-[12px] font-medium tracking-wide mt-0.5', roleColorClass)}>
              {agent.role}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant max-w-sm mx-auto">
              {description}
            </p>
          </div>
        ) : (
          // Left-aligned header for Specialists
          <div>
            <div className="flex items-start gap-2.5">
              <Avatar initials={agent.initials} color={agent.color} size={36} title={agent.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-[14px] font-semibold text-white truncate">{agent.name}</h4>
                  <Badge tone="neutral" mono className="text-[10px] h-4 px-1.5">
                    v{agent.activeVersion}
                  </Badge>
                </div>
                <div className={cx('text-[11px] font-medium truncate mt-0.5', roleColorClass)}>
                  {agent.role}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant line-clamp-3 min-h-[48px]">
              {description}
            </p>
          </div>
        )}
      </div>

      {/* Middle Section: Status & Segmented Model Control */}
      <div className="mt-4 border-t border-fluent-border pt-3 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 font-mono text-on-surface-muted">
            <StatusDot
              tone={agent.status === 'working' ? 'warning' : 'success'}
              pulse={agent.status === 'working'}
            />
            <span className="capitalize">{agent.status}</span>
          </div>
          <span className="font-mono text-[10px] font-bold tracking-[0.14em] uppercase text-on-surface-muted">
            MODEL
          </span>
        </div>

        {/* Segmented Model Pills */}
        <div
          role="radiogroup"
          aria-label={`${agent.name} primary model`}
          className="grid grid-cols-5 gap-1 rounded-md border border-fluent-border bg-black/30 p-1"
        >
          {FLEET_MODELS.map((model) => {
            const isSelected = selectedModelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!canTuneAllowed || isOffline}
                onClick={() => onSelectModel(model.id)}
                className={cx(
                  'focus-ring flex items-center justify-center rounded py-1 px-0.5 text-[11px] font-medium transition-colors',
                  isSelected
                    ? 'bg-white/10 text-fluent-success font-semibold border border-fluent-success/30 shadow-xs'
                    : 'text-on-surface-variant hover:bg-white/[0.04] hover:text-white',
                )}
              >
                <span className="truncate">{model.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Pinned Release Tag */}
        <div className="text-center font-mono text-[10px] text-on-surface-muted truncate px-1">
          {activeModelOption.pinnedModel}
        </div>
      </div>

      {/* Action Buttons using standard Button primitive */}
      <div className="mt-3.5 space-y-1.5">
        <Button
          variant="secondary"
          size="sm"
          icon={isRunning ? undefined : 'play_arrow'}
          loading={isRunning}
          disabled={!canRunAllowed || !agent.canRunNow || isRunning || isOffline}
          disabledReason={runDisabledReason}
          onClick={onRunNow}
          className="w-full"
        >
          Run now
        </Button>

        <Button
          variant="ghost"
          size="sm"
          iconRight="open_in_new"
          onClick={onEditPrompt}
          className="w-full text-on-surface-variant hover:text-white"
        >
          Edit system prompt
        </Button>
      </div>
    </Card>
  );
}
