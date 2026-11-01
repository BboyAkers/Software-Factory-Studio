import React from 'react';
import { useMissionControlState } from './hooks/useMissionControlState';
import { PipelineStageColumn } from './components/PipelineStageColumn';
import { SteeringConsole } from './components/SteeringConsole';
import { LiveExecutionLogViewer } from './components/LiveExecutionLogViewer';

export const MissionControlPage: React.FC = () => {
  const {
    pipelineStages,
    isPipelinePaused,
    togglePausePipeline,
    streamedTokens,
    steerAgentPrompt,
    setSteerAgentPrompt,
    handleSteeringSubmit,
    steeringHintsHistory,
    logs,
    rawLogsCount,
    clearLogs,
    logFilter,
    setLogFilter,
    workpacks,
    openTaskDrawer
  } = useMissionControlState();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-5 max-w-[1560px] mx-auto pb-12">
        {/* Header Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
              <span className="text-primary font-mono">SYNTHETIX-CORE</span>
              <span className="text-on-surface-muted">/</span>
              <span>PIPELINE-ORCHESTRATOR</span>
              <span className="text-on-surface-muted">/</span>
              <span className="text-fluent-success flex items-center gap-1 font-semibold font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
                ACTIVE RUNTIME
              </span>
            </div>
            <h1 className="text-[24px] font-semibold tracking-tight text-white flex items-center gap-2.5">
              Mission Control &amp; Pipeline Orchestrator
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-on-surface-variant border border-fluent-border font-mono font-normal">
                v4.2-pipeline
              </span>
            </h1>
            <p className="text-[12.5px] text-on-surface-variant mt-0.5">
              Deterministic 4-stage assembly line with human-in-the-loop steering guardrails
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                alert('Pipeline forked into experimental branch: exp/agentic-billing-v2');
              }}
              className="fluent-btn-default flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium"
            >
              <span className="material-symbols-outlined text-[16px]">fork_right</span>
              <span>Fork Pipeline</span>
            </button>

            <button
              onClick={togglePausePipeline}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-semibold border transition-all ${
                isPipelinePaused
                  ? 'bg-fluent-success-subtle text-fluent-success border-fluent-success/40 hover:bg-fluent-success hover:text-white'
                  : 'bg-fluent-warning-subtle text-fluent-warning border-fluent-warning/40 hover:bg-fluent-warning hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isPipelinePaused ? 'play_arrow' : 'pause'}
              </span>
              <span>{isPipelinePaused ? 'Resume Assembly Line' : 'Pause Swarm'}</span>
            </button>
          </div>
        </div>

        {/* 4 Deterministic Pipeline Stages */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {pipelineStages.map((stage) => {
            const stageWorkpacks = workpacks.filter((w) => {
              if (stage.id === 1) return w.status === 'planning';
              if (stage.id === 2) return w.status === 'in-progress';
              if (stage.id === 3) return w.status === 'verification';
              if (stage.id === 4) return w.status === 'awaiting-review';
              return false;
            });
            return (
              <PipelineStageColumn
                key={stage.id}
                stage={stage}
                workpacks={stageWorkpacks}
                onSelectWorkpack={openTaskDrawer}
              />
            );
          })}
        </div>

        {/* Steering Intercept Console & Live Execution Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SteeringConsole
            prompt={steerAgentPrompt}
            onPromptChange={setSteerAgentPrompt}
            onSubmit={handleSteeringSubmit}
            history={steeringHintsHistory}
          />

          <LiveExecutionLogViewer
            logs={logs}
            totalLogsCount={rawLogsCount}
            activeFilter={logFilter}
            onFilterChange={setLogFilter}
            onClear={clearLogs}
            streamedTokens={streamedTokens}
          />
        </div>
      </div>
    </div>
  );
};

export default MissionControlPage;
