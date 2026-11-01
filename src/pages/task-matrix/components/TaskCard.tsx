import React from 'react';
import type { Workpack, TaskStatus } from '../../../types';

interface TaskCardProps {
  workpack: Workpack;
  onSelect: (id: string) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ workpack, onSelect, onStatusChange }) => {
  return (
    <div
      onClick={() => onSelect(workpack.id)}
      className="fluent-card rounded-lg p-3.5 flex flex-col gap-2.5 cursor-pointer hover:border-primary/50 transition-all hover:-translate-y-0.5 shadow-sm group select-none"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="text-primary font-semibold">{workpack.id}</span>
          <span className="text-on-surface-muted">•</span>
          <span className="text-on-surface-muted truncate max-w-[100px]">{workpack.branch}</span>
        </div>
        <span
          className={`text-[9.5px] px-2 py-0.5 rounded font-mono uppercase font-semibold ${
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

      <div className="text-[12.5px] font-medium text-white group-hover:text-primary transition-colors line-clamp-2 leading-snug">
        {workpack.title}
      </div>

      <div className="flex items-center justify-between text-[11px] text-on-surface-muted pt-2 border-t border-white/5 font-mono">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-white/10 text-primary flex items-center justify-center font-bold text-[10px]">
            {workpack.assignedAgentInitials}
          </div>
          <span className="truncate max-w-[110px] text-on-surface-variant">{workpack.assignedAgentName}</span>
        </div>
        <span>{workpack.tokensConsumed}</span>
      </div>

      {onStatusChange && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="pt-1 flex items-center justify-between text-[10px] text-on-surface-muted font-mono"
        >
          <span>Move:</span>
          <div className="flex items-center gap-1">
            {workpack.status !== 'in-progress' && (
              <button
                onClick={() => onStatusChange(workpack.id, 'in-progress')}
                className="hover:text-fluent-success hover:underline"
              >
                Exec
              </button>
            )}
            {workpack.status !== 'verification' && (
              <button
                onClick={() => onStatusChange(workpack.id, 'verification')}
                className="hover:text-[#00b7c3] hover:underline"
              >
                Gate
              </button>
            )}
            {workpack.status !== 'done' && (
              <button
                onClick={() => onStatusChange(workpack.id, 'done')}
                className="hover:text-fluent-success hover:underline"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
