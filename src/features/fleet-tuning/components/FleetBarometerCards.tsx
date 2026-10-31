import React from 'react';
import type { FleetClusterStats } from '../lib/fleetTuningModel';

interface FleetBarometerCardsProps {
  stats: FleetClusterStats;
}

export const FleetBarometerCards: React.FC<FleetBarometerCardsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Active Providers */}
      <div className="acrylic-card rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
              Active Providers
            </span>
            <span className="flex items-center gap-1 font-mono text-[10.5px] text-fluent-success">
              <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
              4 / 4 ONLINE
            </span>
          </div>
          <div className="text-[24px] font-bold text-white flex items-baseline gap-2">
            4 Pipelines{' '}
            <span className="font-mono text-[12px] text-on-surface-muted font-normal">
              {stats.nodeCount} Nodes
            </span>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-1 text-white">
            <span className="text-primary font-medium">Anthropic</span>
            <span>•</span>
            <span className="text-fluent-purple font-medium">OAI</span>
            <span>•</span>
            <span className="text-fluent-success font-medium">DeepSeek</span>
          </div>
          <span className="text-primary">0 Failover</span>
        </div>
      </div>

      {/* Token Burn */}
      <div className="acrylic-card rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
              Monthly Token Burn
            </span>
            <span className="font-mono text-[11px] text-primary">{stats.monthlySpendUsd}</span>
          </div>
          <div className="text-[24px] font-bold text-white flex items-baseline gap-2">
            {stats.monthlyBurnTokens} <span className="font-mono text-[12px] text-on-surface-muted font-normal">Tokens</span>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
          <span className="text-on-surface-muted">Budget Pool: $5,000</span>
          <span className="text-fluent-success">11.4% Burn Rate</span>
        </div>
      </div>

      {/* VRAM Allocation */}
      <div className="acrylic-card rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
              GPU VRAM Allocation
            </span>
            <span className="font-mono text-[11px] text-fluent-warning">75%</span>
          </div>
          <div className="text-[24px] font-bold text-white flex items-baseline gap-2">
            {stats.gpuVramAllocated}{' '}
            <span className="font-mono text-[12px] text-on-surface-muted font-normal">
              / {stats.gpuVramTotal}
            </span>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
          <span className="text-on-surface-muted">4x NVIDIA H100</span>
          <span className="text-fluent-success">Normal Temp 42°C</span>
        </div>
      </div>

      {/* KV Cache Hit */}
      <div className="acrylic-card rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
              KV Cache Hit Rate
            </span>
            <span className="font-mono text-[11px] text-fluent-success">+1.8%</span>
          </div>
          <div className="text-[24px] font-bold text-fluent-success flex items-baseline gap-2">
            {stats.cacheHitRatio}% <span className="font-mono text-[12px] text-on-surface-muted font-normal">Cached</span>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
          <span className="text-on-surface-muted">Latency Reduction</span>
          <span className="text-primary">-620ms / turn</span>
        </div>
      </div>
    </div>
  );
};
