import React from 'react';
import { useTaskMatrixFilters } from './hooks/useTaskMatrixFilters';
import { TaskSummaryStats } from './components/TaskSummaryStats';
import { TaskFilterBar } from './components/TaskFilterBar';
import { KanbanColumn } from './components/KanbanColumn';
import { TaskMatrixStreamTable } from './components/TaskMatrixStreamTable';

export const TaskMatrixPage: React.FC = () => {
  const {
    workpacks,
    columns,
    summary,
    selectedAgentFilter,
    setSelectedAgentFilter,
    selectedSeverityFilter,
    setSelectedSeverityFilter,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    openTaskDrawer,
    setIsNewWorkpackModalOpen,
    updateStatus
  } = useTaskMatrixFilters();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-5 max-w-[1680px] mx-auto pb-12">
        {/* Header Block */}
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                <span className="text-primary font-mono">SYNTHETIX-CORE</span>
                <span className="text-on-surface-muted">/</span>
                <span>PIPELINE-CLUSTER-OMEGA</span>
                <span className="text-on-surface-muted">/</span>
                <span className="text-fluent-success flex items-center gap-1 font-semibold font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
                  LIVE AUTONOMY
                </span>
              </div>
              <h1 className="text-[22px] text-white tracking-tight font-semibold flex items-center gap-2.5">
                Task Matrix &amp; Swarm Kanban
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-on-surface-variant border border-fluent-border font-mono font-normal">
                  v4.2-pipeline
                </span>
              </h1>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                Autonomous Workpack Distribution across Dedicated Specialist Agents
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <TaskSummaryStats summary={summary} />

          {/* Controls & Filter Bar */}
          <TaskFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            agentFilter={selectedAgentFilter}
            onAgentFilterChange={setSelectedAgentFilter}
            priorityFilter={selectedSeverityFilter}
            onPriorityFilterChange={setSelectedSeverityFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onNewWorkpack={() => setIsNewWorkpackModalOpen(true)}
          />
        </header>

        {/* Views */}
        {viewMode === 'matrix' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            {columns.map((col) => {
              const colWorkpacks = workpacks.filter((w) => w.status === col.status);
              return (
                <KanbanColumn
                  key={col.status}
                  column={col}
                  workpacks={colWorkpacks}
                  onSelectWorkpack={openTaskDrawer}
                  onStatusChange={updateStatus}
                />
              );
            })}
          </div>
        ) : (
          <TaskMatrixStreamTable
            workpacks={workpacks}
            onSelectWorkpack={openTaskDrawer}
            onStatusChange={updateStatus}
          />
        )}
      </div>
    </div>
  );
};

export default TaskMatrixPage;
