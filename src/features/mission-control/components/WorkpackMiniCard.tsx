import React from 'react';
import type { Workpack } from '../../../types';

interface WorkpackMiniCardProps {
  workpack: Workpack;
  onSelect: (id: string) => void;
}

export const WorkpackMiniCard: React.FC<WorkpackMiniCardProps> = ({ workpack, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(workpack.id)}
      className="p-3 rounded-lg bg-[#2b2b2b] border border-fluent-border hover:border-primary/50 cursor-pointer transition-all hover:translate-y-[-1px] shadow-sm flex flex-col gap-2 group"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-primary font-semibold">
          {workpack.id}
        </span>
        <span
          className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
            workpack.priority === 'P0 Blocker'
              ? 'bg-fluent-danger-subtle text-fluent-danger'
              : workpack.priority === 'P1 High'
              ? 'bg-fluent-warning-subtle text-fluent-warning'
              : 'bg-white/10 text-on-surface-variant'
          }`}
        >
          {workpack.priority}
        </span>
      </div>

      <div className="text-[12px] font-medium text-white group-hover:text-primary transition-colors line-clamp-2">
        {workpack.title}
      </div>

      <div className="flex items-center justify-between text-[10.5px] text-on-surface-muted pt-1 border-t border-white/5 font-mono">
        <span className="truncate max-w-[120px] text-on-surface-variant">
          {workpack.assignedAgentName}
        </span>
        <span>{workpack.tokensConsumed}</span>
      </div>
    </div>
  );
};
