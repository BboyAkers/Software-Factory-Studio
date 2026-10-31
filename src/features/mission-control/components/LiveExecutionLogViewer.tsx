import React from 'react';
import type { TelemetryLog } from '../../../types';

interface LiveExecutionLogViewerProps {
  logs: TelemetryLog[];
  totalLogsCount: number;
  activeFilter: 'all' | 'agent' | 'success' | 'warn';
  onFilterChange: (filter: 'all' | 'agent' | 'success' | 'warn') => void;
  onClear: () => void;
  streamedTokens: number;
}

export const LiveExecutionLogViewer: React.FC<LiveExecutionLogViewerProps> = ({
  logs,
  activeFilter,
  onFilterChange,
  onClear,
  streamedTokens
}) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-fluent-border/60 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-fluent-success">terminal</span>
            <h3 className="text-[14px] font-semibold text-white tracking-tight">
              Swarm Execution Stream
            </h3>
            <span className="font-mono text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              {streamedTokens.toLocaleString()} tok stream
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/[0.04] p-0.5 rounded border border-fluent-border">
              {(['all', 'agent', 'success', 'warn'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => onFilterChange(filter)}
                  className={`px-2 py-0.5 text-[11px] font-mono rounded capitalize transition-all ${
                    activeFilter === filter
                      ? 'bg-primary text-white font-semibold'
                      : 'text-on-surface-variant hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <button
              onClick={onClear}
              className="text-[11px] text-on-surface-muted hover:text-white px-2 py-1 rounded bg-white/[0.04] border border-fluent-border"
              title="Clear terminal stream"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Console output buffer */}
        <div className="bg-[#121212] rounded-lg p-3.5 border border-white/5 font-mono text-[11.5px] max-h-80 overflow-y-auto space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-on-surface-muted select-none text-[10px] w-14 flex-shrink-0">
                {log.timestamp}
              </span>
              <span
                className={`font-semibold select-none text-[10px] uppercase w-14 flex-shrink-0 ${
                  log.level === 'warn'
                    ? 'text-fluent-warning'
                    : log.level === 'success'
                    ? 'text-fluent-success'
                    : 'text-primary'
                }`}
              >
                [{log.level}]
              </span>
              <span className="text-white/80 break-words flex-1">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-center py-8 text-on-surface-muted text-[11px]">
              No log messages matching filter
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
