import type { PipelineStage, TelemetryLog } from '../../../types';

export interface StageStat {
  stageId: number;
  name: string;
  activeAgents: number;
  slaHealth: 'normal' | 'warning' | 'breach';
}

export function filterLogs(logs: TelemetryLog[], filter: 'all' | 'agent' | 'success' | 'warn'): TelemetryLog[] {
  if (filter === 'all') return logs;
  return logs.filter((log) => log.level === filter);
}

export function calculatePipelineThroughput(stages: PipelineStage[]): number {
  return stages.reduce((acc, stage) => acc + (stage.status === 'completed' ? 1 : 0), 0);
}
