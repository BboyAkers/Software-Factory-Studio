import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const BudgetModal: React.FC = () => {
  const { budget, updateBudget, isBudgetModalOpen, setIsBudgetModalOpen } = useApp();

  const [monthlyCap, setMonthlyCap] = useState(budget.monthlyCap);
  const [softPct, setSoftPct] = useState(budget.softLimitPercent);
  const [hardPct, setHardPct] = useState(budget.hardCapPercent);
  const [slackChannel, setSlackChannel] = useState(budget.slackChannel);
  const [autoThrottle, setAutoThrottle] = useState(budget.autoThrottle);

  if (!isBudgetModalOpen) return null;

  const softDollar = Math.round(monthlyCap * (softPct / 100));
  const hardDollar = Math.round(monthlyCap * (hardPct / 100));
  const currentPct = Math.min(100, Math.round((budget.currentSpend / monthlyCap) * 100));

  const handleSave = () => {
    updateBudget({
      monthlyCap,
      softLimitPercent: softPct,
      hardCapPercent: hardPct,
      slackChannel,
      autoThrottle
    });
    setIsBudgetModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#242424] rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 bg-[#282828] border-b border-white/10">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-[#118dff]/15 text-[#118dff] border border-[#118dff]/30 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
              <span className="material-symbols-outlined text-[19px]">account_balance_wallet</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-white tracking-tight leading-snug">
                  Pipeline Budget &amp; Spend Allocation
                </h3>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-fluent-success-subtle text-fluent-success border border-fluent-success/25 font-semibold uppercase">
                  Active Policy
                </span>
              </div>
              <p className="text-[12px] text-white/60 leading-relaxed">
                Configure monthly compute spend caps, token consumption quotas, and soft/hard alert
                limits for the AI agent fleet.
              </p>
            </div>
          </div>
          <button
            className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors ml-2 flex-shrink-0"
            onClick={() => setIsBudgetModalOpen(false)}
            title="Close Dialog"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[78vh] overflow-y-auto bg-[#202020]">
          {/* Monthly Spend Limit Card */}
          <div className="p-4 rounded-lg bg-[#272727] border border-white/10 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">
                Monthly Spend Limit
              </label>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-fluent-success-subtle text-fluent-success border border-fluent-success/30 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-fluent-success"></span> Runway ~
                {budget.runwayDays}d {budget.runwayHours}h
              </span>
            </div>

            <div className="relative flex items-center bg-[#1c1c1c] rounded border border-white/15 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary px-3 py-2">
              <span className="text-primary font-semibold text-[17px] mr-1">$</span>
              <input
                className="w-full bg-transparent font-mono text-[18px] text-white font-bold focus:outline-none tracking-tight"
                type="number"
                value={monthlyCap}
                onChange={(e) => setMonthlyCap(Number(e.target.value) || 1000)}
                step="500"
                min="1000"
                max="50000"
              />
              <span className="font-mono text-[12px] text-white/50 pl-2 whitespace-nowrap">
                / month
              </span>
            </div>

            <div className="flex flex-col gap-1.5 pt-0.5">
              <div className="flex items-center justify-between text-[11px] text-white/70 font-mono">
                <span>
                  Current Spend:{' '}
                  <strong className="text-white font-semibold">
                    ${budget.currentSpend.toLocaleString()}
                  </strong>{' '}
                  ({currentPct}%)
                </span>
                <span className="text-primary">
                  Est. End-of-Month: ${budget.projectedSpend.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden flex">
                <div
                  className="bg-fluent-blue h-full rounded-full transition-all duration-300"
                  style={{ width: `${currentPct}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Autonomy Safeguards & Alert Thresholds */}
          <div className="p-4 rounded-lg bg-[#272727] border border-white/10 flex flex-col gap-3.5 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">shield</span>
                Autonomy Safeguards &amp; Alert Thresholds
              </span>
              <span className="font-mono text-[10.5px] text-on-surface-variant">
                Synchronized Sliders
              </span>
            </div>

            {/* Soft Limit Alert */}
            <div className="p-3.5 rounded bg-[#222222] border border-white/10 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  <span className="text-[13px] font-semibold text-white">Soft Limit Alert</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[12px]">
                  <span className="text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded border border-primary/25">
                    ${softDollar.toLocaleString()}
                  </span>
                  <div className="relative flex items-center bg-[#1c1c1c] border border-white/15 rounded px-2 py-0.5 focus-within:border-primary">
                    <input
                      className="w-10 bg-transparent text-right pr-4 font-mono text-[12px] text-white font-semibold focus:outline-none"
                      type="number"
                      min="50"
                      max="100"
                      value={softPct}
                      onChange={(e) => setSoftPct(Math.min(100, Math.max(50, Number(e.target.value))))}
                    />
                    <span className="absolute right-1.5 text-white/50 text-[11px] pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-white/60 leading-relaxed">
                Sends instant webhook ping to{' '}
                <span className="font-mono text-white/80">{slackChannel}</span> and alerts team
                leads. Fleet remains autonomous.
              </p>

              <div className="flex flex-col gap-1 pt-1">
                <div className="flex items-center gap-3">
                  <input
                    className="w-full h-1.5 bg-[#333333] rounded-full appearance-none cursor-pointer accent-primary"
                    type="range"
                    min="50"
                    max="100"
                    value={softPct}
                    onChange={(e) => setSoftPct(Number(e.target.value))}
                  />
                  <span className="font-mono text-[11px] text-primary font-semibold w-9 text-right">
                    {softPct}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono text-white/40 px-0.5">
                  <span>50% (${Math.round(monthlyCap * 0.5).toLocaleString()})</span>
                  <span>75% (${Math.round(monthlyCap * 0.75).toLocaleString()})</span>
                  <span>100% (${monthlyCap.toLocaleString()})</span>
                </div>
              </div>
            </div>

            {/* Hard Cap Safeguard */}
            <div className="p-3.5 rounded bg-[#222222] border border-white/10 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-fluent-error"></span>
                  <span className="text-[13px] font-semibold text-white">Hard Cap Safeguard</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[12px]">
                  <span className="text-fluent-error font-semibold bg-fluent-error-subtle px-2 py-0.5 rounded border border-fluent-error/25">
                    ${hardDollar.toLocaleString()}
                  </span>
                  <div className="relative flex items-center bg-[#1c1c1c] border border-white/15 rounded px-2 py-0.5 focus-within:border-fluent-error">
                    <input
                      className="w-10 bg-transparent text-right pr-4 font-mono text-[12px] text-white font-semibold focus:outline-none"
                      type="number"
                      min="75"
                      max="120"
                      value={hardPct}
                      onChange={(e) => setHardPct(Math.min(120, Math.max(75, Number(e.target.value))))}
                    />
                    <span className="absolute right-1.5 text-white/50 text-[11px] pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-white/60 leading-relaxed">
                Immediately throttles model inferencing to lowest reasoning mode and requires
                Staff Architect manual authorization to resume synthesis.
              </p>

              <div className="flex flex-col gap-1 pt-1">
                <div className="flex items-center gap-3">
                  <input
                    className="w-full h-1.5 bg-[#333333] rounded-full appearance-none cursor-pointer accent-fluent-error"
                    type="range"
                    min="75"
                    max="120"
                    value={hardPct}
                    onChange={(e) => setHardPct(Number(e.target.value))}
                  />
                  <span className="font-mono text-[11px] text-fluent-error font-semibold w-9 text-right">
                    {hardPct}%
                  </span>
                </div>
              </div>
            </div>

            {/* Notification Channel & Auto-Throttle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-on-surface-variant font-medium">
                  Slack Webhook Target
                </label>
                <input
                  type="text"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                  className="bg-[#1c1c1c] border border-white/15 rounded px-2.5 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-[#222222] border border-white/10 mt-auto">
                <div className="flex flex-col">
                  <span className="text-[12px] text-white font-medium">Auto-Throttle on Breach</span>
                  <span className="text-[10px] text-on-surface-muted">Pause non-P0 tasks</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoThrottle}
                  onChange={(e) => setAutoThrottle(e.target.checked)}
                  className="w-4 h-4 rounded text-primary accent-primary"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#242424] border-t border-white/10 flex items-center justify-between">
          <button
            onClick={() => setIsBudgetModalOpen(false)}
            className="px-3.5 py-1.5 rounded-md text-[12.5px] font-medium text-on-surface-variant hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="fluent-btn-primary px-4 py-1.5 rounded-md text-[12.5px] font-semibold"
          >
            Deploy Safeguards
          </button>
        </div>
      </div>
    </div>
  );
};
