import React from 'react';
import type { SystemHealthSummary } from '../lib/overviewModel';

interface SystemHealthGaugeProps {
  health: SystemHealthSummary;
  isBenchmarking: boolean;
  onBenchmark: () => void;
}

export const SystemHealthGauge: React.FC<SystemHealthGaugeProps> = ({
  health,
  isBenchmarking,
  onBenchmark
}) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-fluent-border/60 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-fluent-success">health_and_safety</span>
            <h3 className="text-[14px] font-semibold text-white tracking-tight">Factory Core Health</h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-fluent-success-subtle text-fluent-success border border-fluent-success/20 font-semibold uppercase">
            {health.status}
          </span>
        </div>

        <div className="space-y-3 text-[12px]">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span>Specialists Online:</span>
            <span className="font-mono text-white font-medium">
              {health.activeSpecialists} / {health.totalSpecialists} active
            </span>
          </div>

          <div className="flex items-center justify-between text-on-surface-variant">
            <span>Autonomous Gate Velocity:</span>
            <span className="font-mono text-fluent-success font-medium">
              {health.autonomousVelocity}%
            </span>
          </div>

          <div className="flex items-center justify-between text-on-surface-variant">
            <span>Cluster SLA Uptime:</span>
            <span className="font-mono text-white font-medium">
              {health.uptimePercent}%
            </span>
          </div>

          <div className="flex items-center justify-between text-on-surface-variant">
            <span>Tokens Synthesized Today:</span>
            <span className="font-mono text-primary font-medium">
              {health.tokensProcessedToday}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-3 border-t border-white/5">
        <button
          onClick={onBenchmark}
          disabled={isBenchmarking}
          className="fluent-btn-default w-full py-2 rounded-md text-[12px] font-semibold flex items-center justify-center gap-2"
        >
          <span className={`material-symbols-outlined text-[16px] ${isBenchmarking ? 'animate-spin' : ''}`}>
            {isBenchmarking ? 'sync' : 'network_check'}
          </span>
          <span>{isBenchmarking ? 'Verifying 173 Gates...' : 'Run Diagnostics Benchmark'}</span>
        </button>
      </div>
    </div>
  );
};
