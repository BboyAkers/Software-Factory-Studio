import React from 'react';
import { useApp } from '../../context/AppContext';
import type { NavTab } from '../../types';

export const NavigationPane: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    agents,
    isPipelinePaused,
    togglePausePipeline,
    gpuMemory,
    contextHit,
    throughput
  } = useApp();

  const navItems: { id: NavTab; label: string; icon: string; badge?: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'grid_view' },
    { id: 'mission-control', label: 'Mission Control', icon: 'account_tree', badge: 'Live' },
    { id: 'task-matrix', label: 'Task Matrix', icon: 'view_kanban', badge: '15' },
    { id: 'live-workspace', label: 'Live Workspace', icon: 'terminal' },
    { id: 'quality-sandboxes', label: 'Quality & Sandboxes', icon: 'verified_user', badge: 'PR #418' },
    { id: 'spec-studio', label: 'Spec Studio', icon: 'prompt_suggestion' },
    { id: 'fleet-tuning', label: 'Fleet & Tuning', icon: 'tune', badge: '6' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];

  return (
    <aside className="w-64 flex-shrink-0 bg-[#1e1e1e] flex flex-col justify-between border-r border-fluent-border z-30 select-none h-full">
      <div className="flex flex-col">
        {/* Fluent App Header */}
        <div className="h-12 flex items-center justify-between px-3.5 border-b border-fluent-border/60 bg-[#232323]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#0078d4]/15 border border-[#0078d4]/30 flex items-center justify-center text-primary shadow-[0_0_10px_rgba(0,120,212,0.2)]">
              <span className="material-symbols-outlined text-[18px]">developer_board</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-white tracking-tight leading-none">
                Synthetix Swarm
              </span>
              <span className="text-[10px] text-on-surface-muted font-medium mt-1 leading-none tracking-wider uppercase font-mono">
                Factory OS • v4.2
              </span>
            </div>
          </div>
          <button
            className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors"
            title="App Architecture"
            onClick={() => setCurrentTab('overview')}
          >
            <span className="material-symbols-outlined text-[18px]">hub</span>
          </button>
        </div>

        {/* Agent Swarm Runtime Card */}
        <div className="mx-2.5 mt-2.5 p-2 rounded-md bg-[#252525] border border-fluent-border">
          <div className="flex items-center justify-between text-[11px] font-medium text-on-surface-variant mb-1">
            <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
              <span
                className={`w-2 h-2 rounded-full ${
                  isPipelinePaused ? 'bg-fluent-warning' : 'bg-fluent-success animate-pulse'
                }`}
              ></span>
              SWARM RUNTIME
            </span>
            <span className="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-white/5 text-primary font-semibold">
              v4.2 PROD
            </span>
          </div>
          <div className="text-[11.5px] text-white flex items-center justify-between">
            <span>{agents.length} Dedicated Agents</span>
            <span
              className={`font-semibold text-[11px] ${
                isPipelinePaused ? 'text-fluent-warning' : 'text-fluent-success'
              }`}
            >
              {isPipelinePaused ? 'Paused' : '100% Ready'}
            </span>
          </div>
        </div>

        {/* Navigation Category */}
        <div className="px-3.5 pt-3 pb-1">
          <span className="text-[10.5px] font-semibold text-on-surface-muted tracking-wider uppercase">
            Orchestration
          </span>
        </div>

        {/* Navigation List */}
        <nav className="flex flex-col px-2 gap-0.5">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[13px] transition-all text-left group ${
                  isActive
                    ? 'fluent-nav-active bg-white/10 text-white font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:bg-white/5 hover:text-white font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`material-symbols-outlined text-[18px] transition-colors ${
                      isActive ? 'text-primary' : 'text-on-surface-muted group-hover:text-white'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-medium ${
                      isActive
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-white/5 text-on-surface-muted group-hover:text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Cluster Hardware Telemetry & Pipeline Pause */}
      <div className="p-3 border-t border-fluent-border bg-[#191919] flex flex-col gap-2.5">
        <div className="p-2.5 rounded-md bg-[#222222] border border-fluent-border flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span className="font-medium uppercase tracking-wider text-[10px]">GPU MEMORY</span>
            <span className="font-mono text-primary font-semibold text-[11px]">{gpuMemory}%</span>
          </div>
          <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${gpuMemory}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-1 border-t border-white/5">
            <span className="font-medium text-[10.5px]">CONTEXT HIT</span>
            <span className="font-mono text-fluent-success text-[11px] font-semibold">
              {contextHit}%
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span className="font-medium text-[10.5px]">THROUGHPUT</span>
            <span className="font-mono text-white text-[11px]">
              {throughput.toLocaleString()} T/s
            </span>
          </div>
        </div>

        <button
          onClick={togglePausePipeline}
          className={`flex items-center justify-center gap-2 w-full py-1.5 px-3 rounded-md text-[12px] font-semibold border transition-all ${
            isPipelinePaused
              ? 'bg-fluent-success-subtle text-fluent-success border-fluent-success/40 hover:bg-fluent-success hover:text-white'
              : 'bg-fluent-error-subtle text-fluent-error border-fluent-error/40 hover:bg-fluent-error hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {isPipelinePaused ? 'play_arrow' : 'pause_circle'}
          </span>
          <span>{isPipelinePaused ? 'Resume Pipeline' : 'Pause Pipeline'}</span>
        </button>
      </div>
    </aside>
  );
};
