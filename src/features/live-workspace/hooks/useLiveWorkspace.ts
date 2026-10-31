import { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import type { WorkspaceFileKey } from '../lib/workspaceStreamModel';
import { REASONING_STEPS } from '../lib/workspaceStreamModel';
import { getFileDiff } from '../queries/getWorkspaceCode';
import { useExecuteTerminalCommand } from '../mutations/useExecuteTerminalCommand';

export function useLiveWorkspace() {
  const {
    isPipelinePaused,
    togglePausePipeline,
    streamedTokens,
    injectSteeringHint,
    addToast
  } = useApp();

  const [activeFile, setActiveFile] = useState<WorkspaceFileKey>('session_store.ts');
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');
  const [cotExpanded, setCotExpanded] = useState<number[]>([1, 2, 3]);
  const [workspacePrompt, setWorkspacePrompt] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    '[kernel] Booted in 118ms via Firecracker v1.4.0',
    '[lsp] TypeScript Language Server v5.6 initialized (0 errors)',
    '[redis] Connected to cluster redis-primary:6379 (pool size: 32)',
    '[vitest] Running tests in tests/session.test.ts (14 passed in 240ms)'
  ]);

  const fileDiff = useMemo(() => getFileDiff(activeFile), [activeFile]);

  const { executeCommand } = useExecuteTerminalCommand((lines) => {
    setTerminalHistory((prev) => [...prev, ...lines]);
  });

  const toggleCot = (id: number) => {
    setCotExpanded((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspacePrompt.trim()) return;
    injectSteeringHint(workspacePrompt);
    setWorkspacePrompt('');
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    if (cmd === 'clear') {
      setTerminalHistory([]);
      return;
    }
    executeCommand(cmd);
  };

  return {
    activeFile,
    setActiveFile,
    diffMode,
    setDiffMode,
    fileDiff,
    cotExpanded,
    toggleCot,
    reasoningSteps: REASONING_STEPS,
    workspacePrompt,
    setWorkspacePrompt,
    handlePromptSubmit,
    terminalInput,
    setTerminalInput,
    terminalHistory,
    handleTerminalSubmit,
    isPipelinePaused,
    togglePausePipeline,
    streamedTokens,
    addToast
  };
}
