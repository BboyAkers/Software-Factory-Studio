import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const HeaderBar: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    budget,
    setIsBudgetModalOpen,
    setIsNewWorkpackModalOpen,
    setIsCommandPaletteOpen,
    logs
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);

  const getBreadcrumb = (tab: string) => {
    switch (tab) {
      case 'overview':
        return 'overview';
      case 'mission-control':
        return 'mission-control';
      case 'task-matrix':
        return 'task-matrix';
      case 'live-workspace':
        return 'live-workspace';
      case 'quality-sandboxes':
        return 'quality-and-sandboxes';
      case 'spec-studio':
        return 'spec-prompt-studio';
      case 'fleet-tuning':
        return 'fleet-and-tuning';
      case 'settings':
        return 'factory-settings';
      default:
        return tab;
    }
  };

  return (
    <header className="h-12 bg-[#202020]/95 backdrop-blur-xl border-b border-fluent-border z-20 flex items-center justify-between px-5 select-none shrink-0">
      {/* Breadcrumbs & Live Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[12px] font-mono text-on-surface-variant">
          <span
            className="text-primary font-semibold hover:underline cursor-pointer"
            onClick={() => setCurrentTab('overview')}
          >
            synthetix
          </span>
          <span className="text-on-surface-muted">/</span>
          <span className="text-white hover:underline cursor-pointer">pipeline-prod</span>
          <span className="text-on-surface-muted">/</span>
          <span className="text-primary font-medium">{getBreadcrumb(currentTab)}</span>
        </div>

        <span className="h-3.5 w-px bg-white/10 hidden md:block"></span>

        <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-fluent-success-subtle text-fluent-success border border-fluent-success/30 text-[11px] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-fluent-success"></span>
          <span>99.8% Test Pass</span>
        </div>

        <div className="hidden xl:flex items-center gap-1 text-[11px] font-mono text-on-surface-muted">
          <span>•</span>
          <span className="text-fluent-blue-light font-medium">24.1ms P99 Latency</span>
        </div>
      </div>

      {/* Right Action Tools: Search, Budget, Notifications, Profile */}
      <div className="flex items-center gap-2.5">
        {/* Budget Pill Button (Click to configure budget) */}
        <button
          onClick={() => setIsBudgetModalOpen(true)}
          className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-fluent-border text-[11.5px] transition-all group"
          title="Configure compute budget & runway safeguards"
        >
          <span className="material-symbols-outlined text-[15px] text-primary group-hover:scale-110 transition-transform">
            account_balance_wallet
          </span>
          <span className="text-on-surface-variant font-mono">
            ${budget.currentSpend.toLocaleString()} /{' '}
            <strong className="text-white">${budget.monthlyCap.toLocaleString()}</strong>
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-fluent-success-subtle text-fluent-success border border-fluent-success/25 font-semibold">
            {budget.runwayDays}d runway
          </span>
        </button>

        {/* Global Search Button (Ctrl+K) */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="fluent-input flex items-center gap-2 px-2.5 py-1 rounded-md text-on-surface-variant hover:text-white cursor-pointer w-44 md:w-52"
        >
          <span className="material-symbols-outlined text-[16px] text-on-surface-muted">search</span>
          <span className="text-[12px] text-on-surface-muted truncate">Search swarm...</span>
          <kbd className="ml-auto text-[10px] bg-white/[0.08] px-1.5 py-0.5 rounded text-on-surface-variant font-mono border border-fluent-border">
            ⌘K
          </kbd>
        </button>

        {/* Quick New Workpack Button */}
        <button
          onClick={() => setIsNewWorkpackModalOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0078d4] hover:bg-[#118dff] text-white text-[12px] font-semibold transition-all shadow-sm border border-[#118dff]/30"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>New Spec</span>
        </button>

        {/* Notification Bell Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Telemetry alerts"
          >
            <span className="material-symbols-outlined text-[19px]">notifications</span>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary ring-2 ring-[#202020]"></span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg bg-[#272727] border border-fluent-border shadow-2xl p-3 z-50 flex flex-col gap-2">
              <div className="flex items-center justify-between pb-2 border-b border-fluent-border">
                <span className="text-[12px] font-semibold text-white">Live Swarm Alerts</span>
                <span className="text-[10px] font-mono text-primary font-medium">3 New</span>
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {logs.slice(0, 4).map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded bg-white/[0.025] border border-white/5 flex flex-col gap-1 text-[11px]"
                  >
                    <div className="flex items-center justify-between text-[10px] text-on-surface-muted">
                      <span className="text-primary font-mono">{log.tag}</span>
                      <span>{log.timestamp}</span>
                    </div>
                    <p className="text-white leading-snug">{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Staff Architect Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-fluent-border/60">
          <div className="relative cursor-pointer" onClick={() => setCurrentTab('fleet-tuning')}>
            <img
              alt="Alex Vance"
              className="w-7 h-7 rounded-full object-cover ring-1 ring-white/20"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTpp2t-3QU9PijHmWRR1vDBFTFkC_RWwxu2U7nmPgv830gHnTsrReY7vdGKjuAj-v9mnRh_gx2aw4AAigc-3y65jUaEEN6vZiney16WQ317hoQvQWcmy24WAE1FhoIjisfpJOLltR6E1gbyvaa5hXNadOvBasiBnRGRmUiLDYyZji1_fWgzeN91yyxzZv1X-IAyXVc6fszR5ceeblSKCLihlZYjedhTy2QyLXiUWUa08BfuWOwSdiF"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-fluent-success ring-2 ring-[#202020]"></span>
          </div>
          <div className="hidden sm:flex flex-col text-left leading-none">
            <span className="text-[12px] font-semibold text-white">Alex Vance</span>
            <span className="text-[10px] text-on-surface-muted mt-0.5">Staff Architect</span>
          </div>
        </div>
      </div>
    </header>
  );
};
