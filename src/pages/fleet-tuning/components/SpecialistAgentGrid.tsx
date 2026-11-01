import React from 'react';
import type { Agent } from '../../../types';

interface SpecialistAgentGridProps {
  specialists: Agent[];
  onOpenDrawer: (id: string) => void;
  onRunNow: (name: string) => void;
}

export const SpecialistAgentGrid: React.FC<SpecialistAgentGridProps> = ({
  specialists,
  onOpenDrawer,
  onRunNow
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {specialists.map((agent) => (
        <div
          key={agent.id}
          className="acrylic-card rounded-xl p-4 border border-fluent-border hover:border-fluent-border-hover transition-all flex flex-col justify-between group"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-mono font-bold text-[13px] text-primary">
                  {agent.initials}
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-white group-hover:text-primary transition-colors">
                    {agent.name}
                  </div>
                  <div className="text-[11px] text-on-surface-muted">{agent.role}</div>
                </div>
              </div>

              <span
                className={`w-2 h-2 rounded-full ${
                  agent.status === 'synthesizing' || agent.status === 'testing'
                    ? 'bg-fluent-success animate-pulse'
                    : agent.status === 'online'
                    ? 'bg-fluent-success'
                    : agent.status === 'reviewing'
                    ? 'bg-fluent-warning'
                    : 'bg-on-surface-muted'
                }`}
              />
            </div>

            <div className="text-[12px] text-on-surface-variant bg-black/20 p-2.5 rounded-lg border border-white/5 font-mono mb-3 truncate">
              {agent.stage}: {agent.responsibilities[0] || 'Active processing'}
            </div>

            <div className="space-y-1.5 text-[11px] font-mono text-on-surface-muted">
              <div className="flex justify-between">
                <span>Model Engine:</span>
                <span className="text-white">{agent.model.split(' ')[0]}</span>
              </div>
              <div className="flex justify-between">
                <span>Temperature / Effort:</span>
                <span className="text-primary">{agent.temperature} / {agent.reasoningEffort}</span>
              </div>
              <div className="flex justify-between">
                <span>Tokens (24h) / Cost:</span>
                <span className="text-white">{agent.tokensConsumed24h.toLocaleString()} / ${agent.cost24h.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
            <button
              onClick={() => onRunNow(agent.name)}
              className="text-[11.5px] text-on-surface-muted hover:text-white px-2.5 py-1 rounded bg-white/[0.04] border border-fluent-border"
            >
              Run Now
            </button>
            <button
              onClick={() => onOpenDrawer(agent.id)}
              className="fluent-btn-default flex items-center gap-1 text-[11.5px] px-3 py-1 rounded-md font-medium"
            >
              <span className="material-symbols-outlined text-[14px]">tune</span>
              <span>Tuning</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
