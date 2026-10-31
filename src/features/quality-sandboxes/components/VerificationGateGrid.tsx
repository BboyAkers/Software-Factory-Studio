import React from 'react';
import type { VerificationGate } from '../../../types';

interface VerificationGateGridProps {
  gates: VerificationGate[];
}

export const VerificationGateGrid: React.FC<VerificationGateGridProps> = ({ gates }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {gates.map((gate) => (
        <div
          key={gate.id}
          className="acrylic-card rounded-xl p-4 border border-fluent-border flex flex-col justify-between group hover:border-fluent-border-hover transition-all"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-white tracking-tight">{gate.title}</span>
              <span
                className={`flex items-center gap-1 font-mono text-[10.5px] font-bold uppercase px-2 py-0.5 rounded ${
                  gate.status === 'passed'
                    ? 'bg-fluent-success-subtle text-fluent-success'
                    : 'bg-fluent-warning-subtle text-fluent-warning'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">
                  {gate.status === 'passed' ? 'check_circle' : 'pending'}
                </span>
                {gate.status}
              </span>
            </div>

            <p className="text-[11.5px] text-on-surface-muted leading-relaxed mb-3">
              {gate.description}
            </p>
          </div>

          <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
            <span className="text-white font-medium">{gate.metrics[0]?.value || gate.badge}</span>
            <span className="text-on-surface-muted">{gate.metrics[0]?.label || 'Deterministic'}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
