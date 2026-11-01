import React from 'react';
import type { SpecMode } from '../lib/specParserModel';

interface SpecStudioToolbarProps {
  mode: SpecMode;
  onModeChange: (m: SpecMode) => void;
  ticketId: string;
  onTicketIdChange: (val: string) => void;
  onDispatch: () => void;
}

export const SpecStudioToolbar: React.FC<SpecStudioToolbarProps> = ({
  mode,
  onModeChange,
  ticketId,
  onTicketIdChange,
  onDispatch
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            <span className="text-primary font-mono">SPEC-STUDIO</span>
            <span className="text-on-surface-muted">/</span>
            <span>PRD-SYNTHESIZER</span>
            <span className="text-on-surface-muted">/</span>
            <span className="text-fluent-success flex items-center gap-1 font-semibold font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
              REASONING ENGINE READY
            </span>
          </div>
          <h1 className="text-[22px] text-white tracking-tight font-semibold flex items-center gap-2.5">
            Spec Studio &amp; Architecture Engine
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-on-surface-variant border border-fluent-border font-mono font-normal">
              gemini-1.5-pro-arch
            </span>
          </h1>
        </div>

        <button
          onClick={onDispatch}
          className="fluent-btn-primary flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold shadow-md"
        >
          <span className="material-symbols-outlined text-[17px]">rocket_launch</span>
          <span>Decompose &amp; Dispatch to Swarm</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-[#242424] p-3 rounded-xl border border-fluent-border">
        {/* Mode Selector */}
        <div className="flex items-center gap-1 bg-[#1a1a1a] p-0.5 rounded-lg border border-fluent-border text-[11.5px] font-mono">
          {(['feature', 'refactor', 'bug', 'security'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-3 py-1 rounded capitalize transition-all ${
                mode === m ? 'bg-primary text-white font-semibold' : 'text-on-surface-variant hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Ticket input */}
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            value={ticketId}
            onChange={(e) => onTicketIdChange(e.target.value)}
            placeholder="Issue or requirement key..."
            className="w-full bg-[#1a1a1a] border border-fluent-border rounded-lg px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-primary font-mono"
          />
        </div>
      </div>
    </div>
  );
};
