import React from 'react';
import type { GovernancePolicyConfig } from '../lib/settingsModel';

interface GovernancePoliciesCardProps {
  policies: GovernancePolicyConfig;
  onTogglePolicy: (key: keyof GovernancePolicyConfig) => void;
}

export const GovernancePoliciesCard: React.FC<GovernancePoliciesCardProps> = ({
  policies,
  onTogglePolicy
}) => {
  const policyList: { key: keyof GovernancePolicyConfig; title: string; desc: string }[] = [
    {
      key: 'autoMergeVerifiedPRs',
      title: 'Autonomous Mainline Auto-Merge',
      desc: 'Allow swarm to fast-forward merge PRs when 100% of deterministic verification gates pass.'
    },
    {
      key: 'hardBudgetTripwire',
      title: 'Hard Budget Tripwire ($5,000 / mo)',
      desc: 'Halt all non-critical swarm execution instantly if monthly API burn crosses $5,000 threshold.'
    },
    {
      key: 'humanInTheLoopSignoff',
      title: 'Human-in-the-Loop Signoff on P0/P1',
      desc: 'Require explicit staff engineer approval before deploying database schema mutations.'
    },
    {
      key: 'strictSastScan',
      title: 'Strict AST Security & License Audit',
      desc: 'Reject code that introduces GPL or AGPL licensed packages into proprietary repos.'
    }
  ];

  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-primary">policy</span>
            <h2 className="text-[14px] font-semibold text-white tracking-tight">
              Enterprise Autonomy Guardrails &amp; Policies
            </h2>
          </div>
          <span className="text-[11px] font-mono text-fluent-success">Enforced by Core</span>
        </div>

        <div className="space-y-3">
          {policyList.map((p) => {
            const enabled = policies[p.key];
            return (
              <div
                key={p.key}
                className="p-3 rounded-lg bg-black/20 border border-white/5 flex items-start justify-between gap-3"
              >
                <div>
                  <div className="text-[13px] font-medium text-white">{p.title}</div>
                  <div className="text-[11.5px] text-on-surface-muted mt-0.5 leading-snug">
                    {p.desc}
                  </div>
                </div>

                <button
                  onClick={() => onTogglePolicy(p.key)}
                  className={`w-10 h-5 rounded-full transition-colors relative flex items-center px-1 flex-shrink-0 mt-0.5 ${
                    enabled ? 'bg-primary' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
