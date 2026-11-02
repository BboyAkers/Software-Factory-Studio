import React from 'react';
import type { TaskMatrixSummaryMetrics } from '../queries/getTaskMatrixTasks';

interface TaskSummaryStatsProps {
  summary: TaskMatrixSummaryMetrics;
}

export const TaskSummaryStats: React.FC<TaskSummaryStatsProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="acrylic-card rounded-lg p-3 border border-fluent-border flex items-center justify-between">
        <div>
          <div className="text-[11px] text-on-surface-muted uppercase font-mono">Total Epics</div>
          <div className="text-[20px] font-bold text-white font-mono">{summary.totalTasks}</div>
        </div>
        <span className="material-symbols-outlined text-primary text-[24px]">task</span>
      </div>

      <div className="acrylic-card rounded-lg p-3 border border-fluent-border flex items-center justify-between">
        <div>
          <div className="text-[11px] text-on-surface-muted uppercase font-mono">In Execution</div>
          <div className="text-[20px] font-bold text-fluent-success font-mono">{summary.inProgress}</div>
        </div>
        <span className="material-symbols-outlined text-fluent-success text-[24px]">autorenew</span>
      </div>

      <div className="acrylic-card rounded-lg p-3 border border-fluent-border flex items-center justify-between">
        <div>
          <div className="text-[11px] text-on-surface-muted uppercase font-mono">Gate Verification</div>
          <div className="text-[20px] font-bold text-fluent-warning font-mono">{summary.inReview}</div>
        </div>
        <span className="material-symbols-outlined text-fluent-warning text-[24px]">verified</span>
      </div>

      <div className="acrylic-card rounded-lg p-3 border border-fluent-border flex items-center justify-between">
        <div>
          <div className="text-[11px] text-on-surface-muted uppercase font-mono">Delivered Today</div>
          <div className="text-[20px] font-bold text-fluent-success font-mono">{summary.doneToday}</div>
        </div>
        <span className="material-symbols-outlined text-fluent-success text-[24px]">check_circle</span>
      </div>
    </div>
  );
};
