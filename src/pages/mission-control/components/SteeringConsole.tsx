import React from 'react';

interface SteeringConsoleProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  history: string[];
}

export const SteeringConsole: React.FC<SteeringConsoleProps> = ({
  prompt,
  onPromptChange,
  onSubmit,
  history
}) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-primary">keyboard_command_key</span>
            <h3 className="text-[14px] font-semibold text-white tracking-tight">
              Human-in-the-Loop Steering Guardrail
            </h3>
          </div>
          <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            Realtime Intercept
          </span>
        </div>

        <p className="text-[12px] text-on-surface-variant mb-3">
          Inject authoritative constraints or architectural hints directly into the swarm reasoning context without killing container execution.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="e.g. Reject any mutation to schema.prisma unless a downgrade SQL migration is generated..."
              rows={3}
              className="w-full bg-[#1e1e1e] border border-fluent-border rounded-lg p-3 text-[12.5px] text-white focus:outline-none focus:border-primary resize-none font-sans"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[11px] text-on-surface-muted font-mono">
              Injected into next reasoning step (token delta: 0)
            </div>
            <button
              type="submit"
              disabled={!prompt.trim()}
              className="fluent-btn-primary px-3 py-1.5 rounded-md text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">send</span>
              <span>Inject Hint</span>
            </button>
          </div>
        </form>

        {/* History stream */}
        {history.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/5">
            <div className="text-[11px] font-medium text-on-surface-muted uppercase tracking-wider mb-2">
              Recent Steering Injections
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="text-[11.5px] text-on-surface-variant bg-black/20 p-2 rounded border border-white/5 font-mono flex items-start gap-2"
                >
                  <span className="material-symbols-outlined text-[13px] text-fluent-success mt-0.5">check</span>
                  <span className="line-clamp-2">{h}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
