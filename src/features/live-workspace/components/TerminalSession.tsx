import React from 'react';

interface TerminalSessionProps {
  history: string[];
  input: string;
  onInputChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const TerminalSession: React.FC<TerminalSessionProps> = ({
  history,
  input,
  onInputChange,
  onSubmit
}) => {
  return (
    <div className="acrylic-card rounded-xl border border-fluent-border overflow-hidden flex flex-col justify-between">
      <div className="px-4 py-2.5 bg-[#202020] border-b border-fluent-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-fluent-success">terminal</span>
          <span className="text-[12px] font-semibold text-white font-mono">
            Firecracker MicroVM #284 (TTY1)
          </span>
        </div>
        <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-fluent-success-subtle text-fluent-success border border-fluent-success/20">
          Sandbox Attached
        </span>
      </div>

      <div className="p-3.5 bg-[#121212] font-mono text-[11.5px] min-h-[220px] max-h-[300px] overflow-y-auto space-y-1.5">
        {history.map((line, idx) => (
          <div key={idx} className="text-white/80 leading-relaxed break-all">
            {line}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="p-2.5 bg-[#1c1c1c] border-t border-fluent-border flex items-center gap-2">
        <span className="text-fluent-success font-mono text-[12px] pl-1 font-bold">
          agent@synthetix:~$
        </span>
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Execute sandbox command (e.g. vitest, git diff, clear)..."
          className="flex-1 bg-transparent text-[12px] text-white focus:outline-none font-mono"
        />
        <button
          type="submit"
          className="px-2.5 py-1 text-[11px] font-mono bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
        >
          Run
        </button>
      </form>
    </div>
  );
};
