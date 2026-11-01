import { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { filterLogs } from '../lib/missionControlModel';
import { getPipelineTelemetry } from '../queries/getMissionControlData';

export function useMissionControlState() {
  const {
    pipelineStages,
    isPipelinePaused,
    togglePausePipeline,
    streamedTokens,
    steerAgentPrompt,
    setSteerAgentPrompt,
    injectSteeringHint,
    steeringHintsHistory,
    logs,
    clearLogs,
    workpacks,
    openTaskDrawer,
    setCurrentTab
  } = useApp();

  const [logFilter, setLogFilter] = useState<'all' | 'agent' | 'success' | 'warn'>('all');

  const filteredLogs = useMemo(() => filterLogs(logs, logFilter), [logs, logFilter]);
  const telemetry = useMemo(() => getPipelineTelemetry(), []);

  const handleSteeringSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!steerAgentPrompt.trim()) return;
    injectSteeringHint(steerAgentPrompt);
  };

  return {
    pipelineStages,
    isPipelinePaused,
    togglePausePipeline,
    streamedTokens,
    steerAgentPrompt,
    setSteerAgentPrompt,
    handleSteeringSubmit,
    steeringHintsHistory,
    logs: filteredLogs,
    rawLogsCount: logs.length,
    clearLogs,
    logFilter,
    setLogFilter,
    workpacks,
    openTaskDrawer,
    setCurrentTab,
    telemetry
  };
}
