import React from 'react';
import type { FileDiffData } from '../lib/workspaceStreamModel';

interface CodeDiffEditorProps {
  diff: FileDiffData;
  diffMode: 'unified' | 'split';
}

export const CodeDiffEditor: React.FC<CodeDiffEditorProps> = ({ diff, diffMode }) => {
  return (
    <div className="bg-[#181818] rounded-b-xl overflow-hidden font-mono text-[12px] leading-relaxed border-t border-white/5">
      <div className="px-4 py-2 bg-black/40 border-b border-white/5 flex items-center justify-between text-[11px] text-on-surface-muted">
        <span className="text-white font-medium flex items-center gap-2">
          {diff.filename}
          <span className="px-1.5 py-0.5 rounded bg-white/5 font-mono text-[10px] uppercase text-on-surface-muted">
            {diffMode}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-fluent-success">+{diff.additions} lines</span>
          <span className="text-fluent-danger">-{diff.deletions} lines</span>
        </div>
      </div>

      <div className="p-4 overflow-x-auto max-h-[460px] overflow-y-auto space-y-1">
        {diff.modifiedLines.map((line, idx) => (
          <div
            key={idx}
            className={`flex items-start px-2 py-0.5 rounded ${
              line.type === 'added'
                ? 'bg-fluent-success/10 text-emerald-300 border-l-2 border-fluent-success'
                : line.type === 'removed'
                ? 'bg-fluent-danger/10 text-rose-300 border-l-2 border-fluent-danger line-through opacity-70'
                : 'text-white/80'
            }`}
          >
            <span className="w-8 select-none text-right pr-4 text-on-surface-muted/60 text-[11px]">
              {idx + 1}
            </span>
            <span className="w-5 select-none font-bold text-center">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="flex-1 whitespace-pre">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
