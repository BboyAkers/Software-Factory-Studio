import React from 'react';

export const ModelFallbackMatrix: React.FC = () => {
  const routes = [
    {
      domain: 'Code Synthesis & Refactoring',
      primary: 'Claude 3.7 Sonnet (Thinking: 8k)',
      fallback: 'DeepSeek-V3 (Self-hosted H100)',
      latency: '820ms',
      cost: '$3.00 / 1M'
    },
    {
      domain: 'Architecture & System Invariants',
      primary: 'Claude 3.5 Sonnet',
      fallback: 'GPT-4o (Snapshot 2024-11-20)',
      latency: '940ms',
      cost: '$3.00 / 1M'
    },
    {
      domain: 'Deterministic Gate & Security SAST',
      primary: 'DeepSeek-Coder-V2',
      fallback: 'Semgrep Engine + Claude 3.5 Haiku',
      latency: '240ms',
      cost: '$0.80 / 1M'
    }
  ];

  return (
    <div className="acrylic-card rounded-xl border border-fluent-border overflow-hidden">
      <div className="p-4 bg-[#222222] border-b border-fluent-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[17px] text-primary">route</span>
          <h3 className="text-[13.5px] font-semibold text-white">Dynamic Routing &amp; Fallback Matrix</h3>
        </div>
        <span className="text-[10.5px] font-mono text-fluent-success">Zero Down-Time Guard</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px] font-mono">
          <thead>
            <tr className="border-b border-white/5 bg-black/20 text-on-surface-muted text-[10.5px] uppercase">
              <th className="py-2.5 px-4 font-sans font-semibold">Specialization Domain</th>
              <th className="py-2.5 px-4 font-semibold">Primary Provider</th>
              <th className="py-2.5 px-4 font-semibold">Automatic Fallback</th>
              <th className="py-2.5 px-4 font-semibold">Avg Latency</th>
              <th className="py-2.5 px-4 text-right font-semibold">Blended Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {routes.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="py-2.5 px-4 font-sans text-white font-medium">{r.domain}</td>
                <td className="py-2.5 px-4 text-primary">{r.primary}</td>
                <td className="py-2.5 px-4 text-on-surface-variant">{r.fallback}</td>
                <td className="py-2.5 px-4 text-fluent-success">{r.latency}</td>
                <td className="py-2.5 px-4 text-right text-on-surface-muted">{r.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
