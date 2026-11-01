import React from 'react';
import type { WorkspaceFileKey } from '../lib/workspaceStreamModel';

interface WorkspaceFileTabsProps {
  activeFile: WorkspaceFileKey;
  onSelectFile: (file: WorkspaceFileKey) => void;
  diffMode: 'unified' | 'split';
  onDiffModeChange: (mode: 'unified' | 'split') => void;
}

export const WorkspaceFileTabs: React.FC<WorkspaceFileTabsProps> = ({
  activeFile,
  onSelectFile,
  diffMode,
  onDiffModeChange
}) => {
  const files: { key: WorkspaceFileKey; label: string; tag: string }[] = [
    { key: 'session_store.ts', label: 'session_store.ts', tag: '+12 -4' },
    { key: 'redis_cache.ts', label: 'redis_cache.ts', tag: '+8 -2' },
    { key: 'auth.ts', label: 'auth.ts', tag: '+6 -1' },
    { key: 'schema.prisma', label: 'schema.prisma', tag: '+14 -0' }
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-fluent-border/60 bg-[#1e1e1e]">
      <div className="flex items-center gap-1 overflow-x-auto">
        {files.map((f) => (
          <button
            key={f.key}
            onClick={() => onSelectFile(f.key)}
            className={`px-3 py-1.5 rounded text-[12px] font-mono flex items-center gap-2 border transition-all ${
              activeFile === f.key
                ? 'bg-[#262626] border-fluent-border text-white shadow-sm'
                : 'border-transparent text-on-surface-muted hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <span>{f.label}</span>
            <span className="text-[10px] text-fluent-success font-semibold">{f.tag}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-[#262626] p-0.5 rounded border border-fluent-border text-[11px] font-mono">
        <button
          onClick={() => onDiffModeChange('unified')}
          className={`px-2 py-0.5 rounded ${
            diffMode === 'unified' ? 'bg-primary text-white font-medium' : 'text-on-surface-muted hover:text-white'
          }`}
        >
          Unified
        </button>
        <button
          onClick={() => onDiffModeChange('split')}
          className={`px-2 py-0.5 rounded ${
            diffMode === 'split' ? 'bg-primary text-white font-medium' : 'text-on-surface-muted hover:text-white'
          }`}
        >
          Side-by-Side
        </button>
      </div>
    </div>
  );
};
