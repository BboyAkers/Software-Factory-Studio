import React from 'react';
import { useLiveWorkspace } from './hooks/useLiveWorkspace';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { WorkspaceFileTabs } from './components/WorkspaceFileTabs';
import { CodeDiffEditor } from './components/CodeDiffEditor';
import { TerminalSession } from './components/TerminalSession';
import { ReasoningTraceViewer } from './components/ReasoningTraceViewer';

export const LiveWorkspacePage: React.FC = () => {
  const {
    activeFile,
    setActiveFile,
    diffMode,
    setDiffMode,
    fileDiff,
    cotExpanded,
    toggleCot,
    reasoningSteps,
    workspacePrompt,
    setWorkspacePrompt,
    handlePromptSubmit,
    terminalInput,
    setTerminalInput,
    terminalHistory,
    handleTerminalSubmit,
    isPipelinePaused,
    togglePausePipeline,
    streamedTokens
  } = useLiveWorkspace();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-5 max-w-[1600px] mx-auto pb-12">
        {/* Top Header & Directive Injection */}
        <WorkspaceToolbar
          isPaused={isPipelinePaused}
          onTogglePause={togglePausePipeline}
          streamedTokens={streamedTokens}
          prompt={workspacePrompt}
          onPromptChange={setWorkspacePrompt}
          onSubmitPrompt={handlePromptSubmit}
        />

        {/* Main Diff Editor Frame */}
        <div className="acrylic-card rounded-xl border border-fluent-border overflow-hidden">
          <WorkspaceFileTabs
            activeFile={activeFile}
            onSelectFile={setActiveFile}
            diffMode={diffMode}
            onDiffModeChange={setDiffMode}
          />

          <CodeDiffEditor diff={fileDiff} diffMode={diffMode} />
        </div>

        {/* Lower Row: Firecracker Terminal & CoT Reasoning Trace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <TerminalSession
            history={terminalHistory}
            input={terminalInput}
            onInputChange={setTerminalInput}
            onSubmit={handleTerminalSubmit}
          />

          <ReasoningTraceViewer
            steps={reasoningSteps}
            expanded={cotExpanded}
            onToggle={toggleCot}
          />
        </div>
      </div>
    </div>
  );
};

export default LiveWorkspacePage;
