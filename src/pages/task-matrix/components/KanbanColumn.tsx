import React from 'react';
import type { Workpack, TaskStatus } from '../../../types';
import type { TaskColumnDef } from '../lib/taskMatrixModel';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  column: TaskColumnDef;
  workpacks: Workpack[];
  onSelectWorkpack: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  workpacks,
  onSelectWorkpack,
  onStatusChange
}) => {
  return (
    <div className="flex flex-col bg-[#212121] rounded-xl border border-fluent-border min-h-[500px] overflow-hidden">
      <div className="p-3 border-b border-fluent-border/60 flex items-center justify-between bg-[#262626]">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${column.dotColor}`} />
          <h2 className="text-[13px] font-semibold text-white tracking-tight">{column.label}</h2>
        </div>
        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-on-surface-variant font-medium">
          {workpacks.length}
        </span>
      </div>

      <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto max-h-[calc(100vh-320px)]">
        {workpacks.map((wp) => (
          <TaskCard
            key={wp.id}
            workpack={wp}
            onSelect={onSelectWorkpack}
            onStatusChange={onStatusChange}
          />
        ))}
        {workpacks.length === 0 && (
          <div className="text-center py-12 text-on-surface-muted text-[11.5px] border border-dashed border-white/5 rounded-lg m-1">
            No workpacks in this stage
          </div>
        )}
      </div>
    </div>
  );
};
