import React from 'react';
import { useApp } from '../../context/AppContext';
import type { TaskStatus } from '../../types';

export const TaskDrawer: React.FC = () => {
  const {
    isTaskDrawerOpen,
    closeTaskDrawer,
    selectedWorkpack,
    updateWorkpackStatus,
    setCurrentTab
  } = useApp();

  if (!isTaskDrawerOpen || !selectedWorkpack) return null;

  const getNextStatus = (current: TaskStatus): TaskStatus | null => {
    switch (current) {
      case 'queued':
        return 'planning';
      case 'planning':
        return 'in-progress';
      case 'in-progress':
        return 'verification';
      case 'verification':
        return 'awaiting-review';
      case 'awaiting-review':
        return 'done';
      default:
        return null;
    }
  };

  const nextStatus = getNextStatus(selectedWorkpack.status);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={closeTaskDrawer}
      ></div>

      {/* Drawer Body */}
      <aside className="relative w-full max-w-md bg-[#252525] border-l border-fluent-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-12 px-4 flex items-center justify-between bg-[#202020] border-b border-fluent-border shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-primary font-bold">
              {selectedWorkpack.id}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                selectedWorkpack.priority === 'P0 Blocker'
                  ? 'bg-fluent-error-subtle text-fluent-error border border-fluent-error/30'
                  : 'bg-white/10 text-on-surface-variant'
              }`}
            >
              {selectedWorkpack.priority}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-mono uppercase">
              {selectedWorkpack.status}
            </span>
          </div>

          <button
            onClick={closeTaskDrawer}
            className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div>
            <h2 className="text-[16px] text-white font-semibold mb-1 leading-snug">
              {selectedWorkpack.title}
            </h2>
            <p className="text-[12px] text-on-surface-variant leading-relaxed">
              {selectedWorkpack.description}
            </p>
          </div>

          {/* Agent Assignment */}
          <div className="p-3 rounded-lg bg-white/[0.03] border border-fluent-border flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
              Assigned Specialist
            </span>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-mono font-bold text-[12px]">
                  {selectedWorkpack.assignedAgentInitials}
                </div>
                <div className="flex flex-col">
                  <span className="text-[12.5px] text-white font-semibold leading-tight">
                    {selectedWorkpack.assignedAgentName}
                  </span>
                  <span className="font-mono text-on-surface-muted text-[10.5px]">
                    Branch: {selectedWorkpack.branch}
                  </span>
                </div>
              </div>

              <span className="flex items-center gap-1.5 text-[10.5px] text-fluent-success font-semibold px-2 py-0.5 rounded bg-fluent-success-subtle border border-fluent-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
                ACTIVE
              </span>
            </div>
          </div>

          {/* Progress & Completeness */}
          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/[0.03] border border-fluent-border">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-on-surface-variant font-medium">Pipeline Completeness</span>
              <span className="font-mono text-primary font-semibold">
                {selectedWorkpack.completeness}%
              </span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${selectedWorkpack.completeness}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-[10.5px] font-mono text-on-surface-muted pt-1">
              <span>Consumed: {selectedWorkpack.tokensConsumed}</span>
              <span>{selectedWorkpack.timeActive || 'Queued'}</span>
            </div>
          </div>

          {/* Active Diff Stream & Scope */}
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#1c1c1c] border border-fluent-border font-mono text-[11px]">
            <div className="flex items-center justify-between text-on-surface-muted border-b border-white/5 pb-1.5">
              <span className="text-[10px] uppercase font-semibold text-primary">
                Synthesis Metrics
              </span>
              <div className="flex items-center gap-2">
                <span className="text-fluent-success">+{selectedWorkpack.linesAdded}</span>
                <span className="text-fluent-error">-{selectedWorkpack.linesRemoved}</span>
              </div>
            </div>

            {selectedWorkpack.activeDiffStream && (
              <div className="text-white text-[11.5px] py-1">
                <span className="text-primary font-semibold">&gt; Active Diff:</span>{' '}
                {selectedWorkpack.activeDiffStream}
              </div>
            )}

            <div className="flex flex-col gap-1 pt-1 text-[11px]">
              <span className="text-[10px] text-on-surface-muted uppercase">Target Source Files:</span>
              {selectedWorkpack.targetFiles.map((file) => (
                <div key={file} className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[13px] text-primary">
                    description
                  </span>
                  <span className="truncate">{file}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick jump to live workspace */}
          <button
            onClick={() => {
              closeTaskDrawer();
              setCurrentTab('live-workspace');
            }}
            className="fluent-btn-default w-full py-2 px-3 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">terminal</span>
            <span>Open in Live Workspace IDE</span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-[#202020] border-t border-fluent-border flex items-center justify-between gap-2">
          {nextStatus && (
            <button
              onClick={() => {
                updateWorkpackStatus(selectedWorkpack.id, nextStatus);
                closeTaskDrawer();
              }}
              className="fluent-btn-primary flex-1 py-1.5 px-3 rounded-md text-[12.5px] font-semibold flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">fast_forward</span>
              <span>Advance to {nextStatus}</span>
            </button>
          )}

          <button
            onClick={closeTaskDrawer}
            className="px-3 py-1.5 rounded-md text-[12.5px] text-on-surface-variant hover:text-white hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
};
