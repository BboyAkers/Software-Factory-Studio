import React from 'react';
import type { Workpack, TaskStatus } from '../../../types';

interface TaskMatrixStreamTableProps {
  workpacks: Workpack[];
  onSelectWorkpack: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}

export const TaskMatrixStreamTable: React.FC<TaskMatrixStreamTableProps> = ({
  workpacks,
  onSelectWorkpack,
  onStatusChange
}) => {
  return (
    <div className="acrylic-card rounded-xl border border-fluent-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-fluent-border bg-white/[0.03] text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider font-mono">
              <th className="py-3 px-4">Task ID</th>
              <th className="py-3 px-4">Title &amp; Workpack</th>
              <th className="py-3 px-4">Assigned Agent</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Branch</th>
              <th className="py-3 px-4 text-right">Tokens</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fluent-border/40 font-mono">
            {workpacks.map((wp) => (
              <tr
                key={wp.id}
                onClick={() => onSelectWorkpack(wp.id)}
                className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
              >
                <td className="py-3 px-4 text-primary font-semibold">{wp.id}</td>
                <td className="py-3 px-4 font-sans font-medium text-white group-hover:text-primary transition-colors max-w-xs truncate">
                  {wp.title}
                </td>
                <td className="py-3 px-4 text-on-surface-variant">{wp.assignedAgentName}</td>
                <td className="py-3 px-4">
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
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`text-[11px] font-medium capitalize ${
                      wp.status === 'in-progress'
                        ? 'text-fluent-success'
                        : wp.status === 'done'
                        ? 'text-fluent-success'
                        : wp.status === 'verification'
                        ? 'text-[#00b7c3]'
                        : wp.status === 'awaiting-review'
                        ? 'text-fluent-warning'
                        : 'text-on-surface-muted'
                    }`}
                  >
                    {wp.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-on-surface-muted text-[11px]">{wp.branch}</td>
                <td className="py-3 px-4 text-right text-on-surface-variant">{wp.tokensConsumed}</td>
                <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onStatusChange(wp.id, wp.status === 'done' ? 'in-progress' : 'done')}
                    className="text-[11px] font-sans px-2.5 py-1 rounded border border-fluent-border hover:bg-white/10 text-white"
                  >
                    {wp.status === 'done' ? 'Reopen' : 'Mark Done'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
