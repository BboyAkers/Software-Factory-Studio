import React from 'react';
import type { PipelineStage, Workpack } from '../../../types';
import { WorkpackMiniCard } from './WorkpackMiniCard';

interface PipelineStageColumnProps {
  stage: PipelineStage;
  workpacks: Workpack[];
  onSelectWorkpack: (id: string) => void;
}

export const PipelineStageColumn: React.FC<PipelineStageColumnProps> = ({
  stage,
  workpacks,
  onSelectWorkpack
}) => {
  return (
    <div className="acrylic-card rounded-xl p-4 flex flex-col justify-between border border-fluent-border">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <h3 className="text-[13px] font-semibold text-white tracking-tight">{stage.title}</h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-on-surface-variant font-medium">
            {stage.metrics || 'Active'}
          </span>
        </div>

        <div className="space-y-2 mb-3">
          <div className="text-[11px] text-on-surface-muted flex items-center justify-between">
            <span>Specialist:</span>
            <span className="font-mono text-primary font-medium">{stage.agentName}</span>
          </div>
          <div className="text-[11px] text-on-surface-muted flex items-center justify-between">
            <span>Role:</span>
            <span className="font-mono text-white">{stage.agentRole}</span>
          </div>
        </div>

        {/* Assigned workpack preview */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {workpacks.map((wp) => (
            <WorkpackMiniCard key={wp.id} workpack={wp} onSelect={onSelectWorkpack} />
          ))}
          {workpacks.length === 0 && (
            <div className="text-center py-6 text-on-surface-muted text-[11.5px] border border-dashed border-white/10 rounded-lg">
              No active workpacks
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10.5px] text-on-surface-muted font-mono">
        <span>Deterministic Rate: 100%</span>
        <span className="text-fluent-success">0 SLA Violations</span>
      </div>
    </div>
  );
};
