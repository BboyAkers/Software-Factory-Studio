import React from 'react';
import type { Agent } from '../../../types';

interface LeadArchitectCardProps {
  architect: Agent;
  onOpenDrawer: (id: string) => void;
  onRunNow: (name: string) => void;
}

export const LeadArchitectCard: React.FC<LeadArchitectCardProps> = ({
  architect,
  onOpenDrawer,
  onRunNow
}) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-primary/30 relative overflow-hidden bg-gradient-to-r from-primary/10 via-transparent to-transparent">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center font-mono font-bold text-[18px] text-primary">
            {architect.initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-bold text-white">{architect.name}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-mono font-semibold uppercase">
                LEAD ARCHITECT
              </span>
            </div>
            <p className="text-[12.5px] text-on-surface-variant mt-0.5 max-w-xl">
              Synthesizes requirements into system architecture, defines formal interface contracts, and dynamically routes sub-epics across the specialist fleet.
            </p>
            <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-on-surface-muted">
              <span>Model: <span className="text-white">{architect.model}</span></span>
              <span>•</span>
              <span>Temp: <span className="text-white">{architect.temperature}</span></span>
              <span>•</span>
              <span>Reasoning: <span className="text-primary">{architect.reasoningEffort}</span></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            onClick={() => onRunNow(architect.name)}
            className="fluent-btn-default px-3 py-1.5 rounded-md text-[12px] font-medium"
          >
            Run Intake Cycle
          </button>
          <button
            onClick={() => onOpenDrawer(architect.id)}
            className="fluent-btn-primary flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Tune Hyperparameters</span>
          </button>
        </div>
      </div>
    </div>
  );
};
