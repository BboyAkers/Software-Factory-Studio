import React from 'react';
import type { TaskPriority } from '../../../types';

interface TaskFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  agentFilter: string;
  onAgentFilterChange: (agent: string) => void;
  priorityFilter: TaskPriority | 'all';
  onPriorityFilterChange: (p: TaskPriority | 'all') => void;
  viewMode: 'matrix' | 'stream';
  onViewModeChange: (mode: 'matrix' | 'stream') => void;
  onNewWorkpack: () => void;
}

export const TaskFilterBar: React.FC<TaskFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  agentFilter,
  onAgentFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  viewMode,
  onViewModeChange,
  onNewWorkpack
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-[#242424] p-3 rounded-xl border border-fluent-border">
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-muted">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search workpack id, title, agent..."
            className="w-full bg-[#1b1b1b] border border-fluent-border rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-primary font-sans"
          />
        </div>

        {/* Agent Filter */}
        <select
          value={agentFilter}
          onChange={(e) => onAgentFilterChange(e.target.value)}
          className="bg-[#1b1b1b] border border-fluent-border rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-primary font-sans"
        >
          <option value="all">All Agents</option>
          <option value="Architect-Prime">Architect-Prime</option>
          <option value="SWE-Autopilot">SWE-Autopilot</option>
          <option value="QA-Sentinel">QA-Sentinel</option>
          <option value="Security-Auditor">Security-Auditor</option>
          <option value="Doc-Synthesizer">Doc-Synthesizer</option>
          <option value="DevOps-Runner">DevOps-Runner</option>
        </select>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => onPriorityFilterChange(e.target.value as TaskPriority | 'all')}
          className="bg-[#1b1b1b] border border-fluent-border rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-primary font-sans"
        >
          <option value="all">All Priorities</option>
          <option value="P0 Blocker">P0 Blocker</option>
          <option value="P1 High">P1 High</option>
          <option value="P2 Normal">P2 Normal</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        {/* Toggle Mode */}
        <div className="flex items-center bg-[#1b1b1b] p-0.5 rounded-lg border border-fluent-border">
          <button
            onClick={() => onViewModeChange('matrix')}
            className={`px-2.5 py-1 rounded text-[12px] font-medium flex items-center gap-1 transition-all ${
              viewMode === 'matrix' ? 'bg-primary text-white' : 'text-on-surface-variant hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">view_kanban</span>
            <span className="hidden sm:inline">Matrix</span>
          </button>
          <button
            onClick={() => onViewModeChange('stream')}
            className={`px-2.5 py-1 rounded text-[12px] font-medium flex items-center gap-1 transition-all ${
              viewMode === 'stream' ? 'bg-primary text-white' : 'text-on-surface-variant hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">table_rows</span>
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>

        <button
          onClick={onNewWorkpack}
          className="fluent-btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>New Workpack</span>
        </button>
      </div>
    </div>
  );
};
