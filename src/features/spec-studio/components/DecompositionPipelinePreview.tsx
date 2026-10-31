import React from 'react';
import type { SpecDecomposedTask } from '../lib/specParserModel';

interface DecompositionPipelinePreviewProps {
  tasks: SpecDecomposedTask[];
}

export const DecompositionPipelinePreview: React.FC<DecompositionPipelinePreviewProps> = ({ tasks }) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border">
      <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-fluent-success">account_tree</span>
          <h3 className="text-[14px] font-semibold text-white tracking-tight">
            Decomposed Swarm Workpack Graph
          </h3>
        </div>
        <span className="text-[11px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
          3 Epics Generated
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="p-3.5 rounded-lg bg-black/20 border border-white/5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5 font-mono text-[10.5px]">
                <span className="text-primary font-bold">{task.id}</span>
                <span className="text-on-surface-muted">{task.complexity} Complexity</span>
              </div>
              <div className="text-[12.5px] font-medium text-white mb-2 leading-snug">
                {task.title}
              </div>
              <div className="text-[11px] text-on-surface-variant font-mono bg-white/[0.03] p-1.5 rounded truncate">
                {task.targetFile}
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-on-surface-muted">
              <span>{task.agentRole}</span>
              <span className="text-primary">{task.estimatedTokens}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
