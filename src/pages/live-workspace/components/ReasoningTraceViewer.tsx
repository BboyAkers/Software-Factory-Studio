import React from 'react';
import type { ReasoningStep } from '../lib/workspaceStreamModel';

interface ReasoningTraceViewerProps {
  steps: ReasoningStep[];
  expanded: number[];
  onToggle: (id: number) => void;
}

export const ReasoningTraceViewer: React.FC<ReasoningTraceViewerProps> = ({
  steps,
  expanded,
  onToggle
}) => {
  return (
    <div className="acrylic-card rounded-xl p-4 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-fluent-purple">neurology</span>
            <h3 className="text-[13px] font-semibold text-white tracking-tight">
              Chain-of-Thought Reasoning Trace
            </h3>
          </div>
          <span className="text-[10.5px] font-mono text-on-surface-muted">
            Deterministic Plan
          </span>
        </div>

        <div className="space-y-2.5">
          {steps.map((step) => {
            const isExp = expanded.includes(step.id);
            return (
              <div
                key={step.id}
                className="rounded-lg border border-fluent-border bg-white/[0.02] overflow-hidden"
              >
                <button
                  onClick={() => onToggle(step.id)}
                  className="w-full p-2.5 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        step.status === 'done'
                          ? 'bg-fluent-success'
                          : step.status === 'active'
                          ? 'bg-primary animate-pulse'
                          : 'bg-on-surface-muted'
                      }`}
                    />
                    <span className="text-[12px] font-semibold text-white font-mono">
                      Step {step.id}: {step.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-on-surface-muted">
                      {step.duration}
                    </span>
                    <span className="material-symbols-outlined text-[15px] text-on-surface-muted">
                      {isExp ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                </button>

                {isExp && (
                  <div className="px-3 pb-3 pt-1 text-[11.5px] text-on-surface-variant font-mono border-t border-white/5 bg-black/20">
                    {step.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
