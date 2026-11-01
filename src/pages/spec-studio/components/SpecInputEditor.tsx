import React from 'react';

interface SpecInputEditorProps {
  promptText: string;
  onPromptTextChange: (text: string) => void;
}

export const SpecInputEditor: React.FC<SpecInputEditorProps> = ({
  promptText,
  onPromptTextChange
}) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between h-full">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
            <h2 className="text-[14px] font-semibold text-white tracking-tight">
              Natural Language Specification &amp; Invariants
            </h2>
          </div>
          <span className="text-[10.5px] font-mono text-on-surface-muted">
            Markdown Spec
          </span>
        </div>

        <textarea
          value={promptText}
          onChange={(e) => onPromptTextChange(e.target.value)}
          rows={14}
          className="w-full flex-1 bg-[#161616] border border-fluent-border rounded-lg p-3.5 text-[12.5px] text-white font-mono leading-relaxed focus:outline-none focus:border-primary resize-none"
        />

        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-on-surface-muted font-mono">
          <span>Target Architecture: Microservices / tRPC / Prisma</span>
          <span className="text-fluent-success">Schema valid</span>
        </div>
      </div>
    </div>
  );
};
