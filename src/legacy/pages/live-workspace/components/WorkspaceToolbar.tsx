import React from 'react';

interface WorkspaceToolbarProps {
  isPaused: boolean;
  onTogglePause: () => void;
  streamedTokens: number;
  prompt: string;
  onPromptChange: (val: string) => void;
  onSubmitPrompt: (e: React.FormEvent) => void;
}

export const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  isPaused,
  onTogglePause,
  streamedTokens,
  prompt,
  onPromptChange,
  onSubmitPrompt
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            <span className="text-primary font-mono">AUTONOMOUS-IDE</span>
            <span className="text-on-surface-muted">/</span>
            <span>EPHEMERAL-SANDBOX</span>
            <span className="text-on-surface-muted">/</span>
            <span className="text-fluent-success flex items-center gap-1 font-semibold font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
              LSP ONLINE (0 ERRORS)
            </span>
          </div>
          <h1 className="text-[22px] text-white tracking-tight font-semibold flex items-center gap-2.5">
            Live Workspace &amp; Autonomous IDE
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-on-surface-variant border border-fluent-border font-mono font-normal">
              vm-firecracker-284
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="font-mono text-[11.5px] px-2.5 py-1 rounded bg-[#262626] border border-fluent-border text-on-surface-variant">
            Tokens: <span className="text-primary font-bold">{streamedTokens.toLocaleString()}</span>
          </div>

          <button
            onClick={onTogglePause}
            className={`fluent-btn-default flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border ${
              isPaused ? 'border-fluent-success text-fluent-success' : 'border-fluent-warning text-fluent-warning'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isPaused ? 'play_arrow' : 'pause'}
            </span>
            <span>{isPaused ? 'Resume Container' : 'Pause Swarm'}</span>
          </button>
        </div>
      </div>

      {/* Steering intercept input */}
      <form
        onSubmit={onSubmitPrompt}
        className="flex items-center gap-2 bg-[#222222] p-1.5 rounded-lg border border-fluent-border"
      >
        <span className="material-symbols-outlined text-[18px] text-primary pl-2">prompt_suggestion</span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Inject live directive into active agent AST session..."
          className="flex-1 bg-transparent text-[12.5px] text-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          className="fluent-btn-primary px-3 py-1 rounded text-[11.5px] font-semibold disabled:opacity-50"
        >
          Inject
        </button>
      </form>
    </div>
  );
};
