import React from 'react';
import type { Agent } from '../../../types';

interface AgentActivityFeedProps {
  agents: Agent[];
  onOpenAgent: (agentId: string) => void;
  onViewFleet: () => void;
}

export const AgentActivityFeed: React.FC<AgentActivityFeedProps> = ({
  agents,
  onOpenAgent,
  onViewFleet
}) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-fluent-border/60 pb-3 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-[19px] text-fluent-purple">smart_toy</span>
              Autonomous Specialist Swarm
            </h2>
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              6 dedicated agents with deterministic role bindings and quota isolation
            </p>
          </div>

          <button
            onClick={onViewFleet}
            className="text-[12px] text-primary hover:underline font-medium flex items-center gap-1"
          >
            Tune Fleet
            <span className="material-symbols-outlined text-[14px]">tune</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => onOpenAgent(agent.id)}
              className="p-3.5 rounded-lg bg-white/[0.02] border border-fluent-border/50 hover:border-fluent-border-hover hover:bg-white/[0.04] cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center font-mono font-bold text-[12px] text-primary">
                      {agent.initials}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-white group-hover:text-primary transition-colors">
                        {agent.name}
                      </div>
                      <div className="text-[11px] text-on-surface-muted truncate">
                        {agent.role}
                      </div>
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

                <div className="text-[11.5px] text-on-surface-variant bg-black/20 p-2 rounded border border-white/5 font-mono truncate">
                  {agent.stage}: {agent.responsibilities[0] || 'Active processing'}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-on-surface-muted">
                <span>Model: {agent.model.split(' ')[0]}</span>
                <span className="text-primary font-medium">{agent.tokensConsumed24h.toLocaleString()} tok</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
