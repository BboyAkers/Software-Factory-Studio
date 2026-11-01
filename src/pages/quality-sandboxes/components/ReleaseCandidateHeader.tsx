import React from 'react';

interface ReleaseCandidateHeaderProps {
  isPromoted: boolean;
  isPromoting: boolean;
  onPromote: () => void;
  onRollback: () => void;
}

export const ReleaseCandidateHeader: React.FC<ReleaseCandidateHeaderProps> = ({
  isPromoted,
  isPromoting,
  onPromote,
  onRollback
}) => {
  return (
    <div className="relative bg-[#242424] rounded-xl p-5 border border-fluent-border shadow-md overflow-hidden">
      <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white/[0.08] text-primary tracking-wider uppercase font-semibold">
              PR #418
            </span>
            <span className="text-on-surface-muted">•</span>
            <span className="font-mono text-[11.5px] text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-primary">commit</span>
              sha:8df3a1b
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-fluent-success-subtle text-fluent-success text-[11px] font-medium border border-fluent-success/30 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
              Ready for mainline deploy
            </span>
          </div>

          <h1 className="text-[22px] text-white font-semibold tracking-tight mt-1">
            Enterprise RBAC Subscription Tiering &amp; Ledger Safeguards
          </h1>
          <p className="text-[12.5px] text-on-surface-variant">
            Autonomous multi-variant evaluation across PostgreSQL migrations, tRPC procedures, and Playwright viewports.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-center">
          {isPromoted ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-fluent-success-subtle text-fluent-success border border-fluent-success/30 text-[12px] font-semibold font-mono">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                PROMOTED TO MAIN
              </span>
              <button
                onClick={onRollback}
                className="fluent-btn-default px-3 py-1.5 rounded-md text-[12px] font-medium text-fluent-danger border border-fluent-danger/30 hover:bg-fluent-danger hover:text-white transition-all"
              >
                Rollback
              </button>
            </div>
          ) : (
            <button
              onClick={onPromote}
              disabled={isPromoting}
              className="fluent-btn-primary flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold shadow-md disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[17px] ${isPromoting ? 'animate-spin' : ''}`}>
                {isPromoting ? 'sync' : 'rocket_launch'}
              </span>
              <span>{isPromoting ? 'Merging & Deploying...' : 'Promote to Mainline'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
