import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setCurrentTab,
    agents,
    workpacks,
    openAgentDrawer,
    openTaskDrawer,
    togglePausePipeline,
    setIsBudgetModalOpen,
    setIsNewWorkpackModalOpen,
    clearLogs
  } = useApp();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  interface CommandItem {
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    category: 'Navigation' | 'Specialist Agent' | 'Workpack' | 'Action';
    action: () => void;
  }

  const allItems: CommandItem[] = [
    // Navigation
    {
      id: 'nav-overview',
      title: 'Factory Overview',
      subtitle: 'Executive telemetry, KPIs, and active pipeline',
      icon: 'grid_view',
      category: 'Navigation',
      action: () => setCurrentTab('overview')
    },
    {
      id: 'nav-mission-control',
      title: 'Mission Control',
      subtitle: '4-stage pipeline orchestrator and steering',
      icon: 'account_tree',
      category: 'Navigation',
      action: () => setCurrentTab('mission-control')
    },
    {
      id: 'nav-task-matrix',
      title: 'Task Matrix & Swarm Kanban',
      subtitle: 'Workpack distribution board and team filters',
      icon: 'view_kanban',
      category: 'Navigation',
      action: () => setCurrentTab('task-matrix')
    },
    {
      id: 'nav-live-workspace',
      title: 'Live Workspace IDE',
      subtitle: 'Real-time diff streams, CAS locks, and CoT reasoning',
      icon: 'terminal',
      category: 'Navigation',
      action: () => setCurrentTab('live-workspace')
    },
    {
      id: 'nav-quality',
      title: 'Quality & Sandboxes',
      subtitle: 'Automated verification gates and live MicroVM preview',
      icon: 'verified_user',
      category: 'Navigation',
      action: () => setCurrentTab('quality-sandboxes')
    },
    {
      id: 'nav-spec-studio',
      title: 'Spec & Prompt Studio',
      subtitle: 'Prompt-to-PR architectural studio and DAG breakdown',
      icon: 'prompt_suggestion',
      category: 'Navigation',
      action: () => setCurrentTab('spec-studio')
    },
    {
      id: 'nav-fleet',
      title: 'Fleet Operations & Model Tuning',
      subtitle: 'Model selection, reasoning effort, and agent tree',
      icon: 'tune',
      category: 'Navigation',
      action: () => setCurrentTab('fleet-tuning')
    },
    {
      id: 'nav-settings',
      title: 'Factory Settings & Integrations',
      subtitle: 'Git, LLM gateways, and telemetry config',
      icon: 'settings',
      category: 'Navigation',
      action: () => setCurrentTab('settings')
    },

    // Actions
    {
      id: 'act-new-workpack',
      title: 'Create New Workpack Spec',
      subtitle: 'Dispatch an engineering requirement to the swarm',
      icon: 'add_circle',
      category: 'Action',
      action: () => setIsNewWorkpackModalOpen(true)
    },
    {
      id: 'act-budget',
      title: 'Configure Compute Budget & Runway',
      subtitle: 'Edit monthly spend limits, soft limit alerts, and hard caps',
      icon: 'account_balance_wallet',
      category: 'Action',
      action: () => setIsBudgetModalOpen(true)
    },
    {
      id: 'act-pause',
      title: 'Toggle Pipeline Pause / Resume',
      subtitle: 'Immediately halt or resume swarm synthesis across all agents',
      icon: 'pause_circle',
      category: 'Action',
      action: () => togglePausePipeline()
    },
    {
      id: 'act-clear-logs',
      title: 'Clear Curated Telemetry Event Stream',
      subtitle: 'Reset the terminal event log buffer',
      icon: 'cleaning_services',
      category: 'Action',
      action: () => clearLogs()
    },

    // Agents
    ...agents.map((agent) => ({
      id: `agent-${agent.id}`,
      title: `${agent.name} (${agent.initials})`,
      subtitle: `${agent.role} • ${agent.model}`,
      icon: 'smart_toy',
      category: 'Specialist Agent' as const,
      action: () => openAgentDrawer(agent.id)
    })),

    // Tasks
    ...workpacks.slice(0, 8).map((wp) => ({
      id: `wp-${wp.id}`,
      title: `${wp.id}: ${wp.title}`,
      subtitle: `Assigned: ${wp.assignedAgentName} • Status: ${wp.status}`,
      icon: 'task',
      category: 'Workpack' as const,
      action: () => openTaskDrawer(wp.id)
    }))
  ];

  const filteredItems = allItems.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? Math.max(0, filteredItems.length - 1) : prev - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        setIsCommandPaletteOpen(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-[#242424] rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Search input */}
        <div className="flex items-center px-4 py-3 bg-[#202020] border-b border-fluent-border">
          <span className="material-symbols-outlined text-[20px] text-primary mr-3">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, specialists, tasks, or jump to view..."
            className="w-full bg-transparent text-[14px] text-white placeholder:text-on-surface-muted focus:outline-none"
          />
          <kbd className="text-[10px] bg-white/[0.08] px-2 py-0.5 rounded text-on-surface-muted font-mono border border-fluent-border">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 flex flex-col gap-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-on-surface-muted text-[13px]">
              No matching commands, agents, or workpacks found for "{query}".
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    setIsCommandPaletteOpen(false);
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/20 text-white' : 'text-on-surface-variant hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        isSelected ? 'text-primary' : 'text-on-surface-muted'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-medium text-white truncate">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-on-surface-muted truncate">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-on-surface-muted shrink-0 ml-2">
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2 bg-[#1e1e1e] border-t border-fluent-border/60 flex items-center justify-between text-[11px] text-on-surface-muted font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Dismiss</span>
          </div>
          <span>Synthetix Swarm v4.2</span>
        </div>
      </div>
    </div>
  );
};
