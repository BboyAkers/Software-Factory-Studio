import React from 'react';

interface DeterministicAuditLogsProps {
  logs: string[];
}

export const DeterministicAuditLogs: React.FC<DeterministicAuditLogsProps> = ({ logs }) => {
  return (
    <div className="acrylic-card rounded-xl p-4 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[17px] text-primary">policy</span>
            <h3 className="text-[13px] font-semibold text-white tracking-tight">
              Deterministic Verification Log
            </h3>
          </div>
          <span className="text-[10.5px] font-mono text-fluent-success">0 Vulnerabilities</span>
        </div>

        <div className="space-y-2 font-mono text-[11.5px] text-on-surface-variant bg-black/20 p-3 rounded-lg border border-white/5">
          {logs.map((log, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[13px] text-fluent-success mt-0.5">check</span>
              <span className="text-white/80">{log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
