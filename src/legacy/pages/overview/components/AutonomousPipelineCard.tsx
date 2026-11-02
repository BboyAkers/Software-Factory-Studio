import React from 'react';
import type { Workpack } from '../../../types';
import type { PipelineFilter } from '../hooks/useOverviewData';

interface AutonomousPipelineCardProps {
  workpacks: Workpack[];
  activeFilter: PipelineFilter;
  onFilterChange: (filter: PipelineFilter) => void;
  onSelectWorkpack: (id: string) => void;
  onViewAll: () => void;
}

export const AutonomousPipelineCard: React.FC<AutonomousPipelineCardProps> = ({
  workpacks,
  activeFilter,
  onFilterChange,
  onSelectWorkpack,
  onViewAll
}) => {
  const filterTabs: { id: PipelineFilter; label: string }[] = [
    { id: 'all', label: 'All Active' },
    { id: 'in-progress', label: 'In Execution' },
    { id: 'verification', label: 'Verification Gates' },
    { id: 'awaiting-review', label: 'Awaiting Signoff' },
    { id: 'planning', label: 'Spec Decomposition' }
  ];

  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-fluent-border/60 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-[19px] text-primary">account_tree</span>
              Autonomous Assembly Line &amp; Workpacks
            </h2>
            <p className="text-[12px] text-on-surface-variant mt-0.5">
              Live swarm progress through spec synthesis, multi-file code synthesis, and gate verification
            </p>
          </div>

          <button
            onClick={onViewAll}
            className="text-[12px] text-primary hover:underline font-medium flex items-center gap-1"
          >
            Open Task Matrix
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onFilterChange(tab.id)}
              className={`px-3 py-1 rounded-full text-[11.5px] font-medium transition-all ${
                activeFilter === tab.id
                  ? 'bg-primary text-white font-semibold shadow-sm'
                  : 'bg-white/[0.04] text-on-surface-variant hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Workpack Row Items */}
        <div className="divide-y divide-fluent-border/40 mt-1">
          {workpacks.slice(0, 5).map((wp) => (
            <div
              key={wp.id}
              onClick={() => onSelectWorkpack(wp.id)}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg cursor-pointer transition-colors group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    wp.status === 'in-progress'
                      ? 'bg-fluent-success animate-pulse'
                      : wp.status === 'verification'
                      ? 'bg-[#00b7c3]'
                      : wp.status === 'awaiting-review'
                      ? 'bg-fluent-warning'
                      : 'bg-on-surface-muted'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] text-primary font-medium">{wp.id}</span>
                    <span className="text-on-surface-muted text-[11px]">•</span>
                    <span className="text-[13px] font-medium text-white group-hover:text-primary transition-colors truncate">
                      {wp.title}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-semibold ${
                        wp.priority === 'P0 Blocker'
                          ? 'bg-fluent-danger-subtle text-fluent-danger'
                          : wp.priority === 'P1 High'
                          ? 'bg-fluent-warning-subtle text-fluent-warning'
                          : 'bg-white/10 text-on-surface-variant'
                      }`}
                    >
                      {wp.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-on-surface-muted mt-1 font-mono">
                    <span className="text-on-surface-variant">{wp.branch}</span>
                    <span>•</span>
                    <span className="text-primary font-medium">{wp.assignedAgentName}</span>
                    <span>•</span>
                    <span>{wp.tokensConsumed}</span>
                  </div>
                </div>
              </div>

              {/* Progress and Gate state */}
              <div className="flex items-center gap-4 flex-shrink-0 self-end sm:self-center">
                <div className="w-28 flex flex-col gap-1 text-right">
                  <div className="text-[11px] font-mono text-on-surface-variant">
                    {wp.status === 'done' ? '100% Done' : wp.status === 'verification' ? 'Gate 3/4' : 'In Flight'}
                  </div>
                  <div className="w-full bg-white/[0.08] h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        wp.status === 'done'
                          ? 'bg-fluent-success'
                          : wp.status === 'verification'
                          ? 'bg-[#00b7c3]'
                          : 'bg-primary'
                      }`}
                      style={{
                        width:
                          wp.status === 'done'
                            ? '100%'
                            : wp.status === 'verification'
                            ? '85%'
                            : wp.status === 'awaiting-review'
                            ? '95%'
                            : '60%'
                      }}
                    />
                  </div>
                </div>

                <span className="material-symbols-outlined text-[16px] text-on-surface-muted group-hover:text-white transition-colors">
                  chevron_right
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
