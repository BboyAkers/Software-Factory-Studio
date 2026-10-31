import type { Workpack } from '../../../types';

export interface TaskMatrixSummaryMetrics {
  totalTasks: number;
  inProgress: number;
  inReview: number;
  doneToday: number;
  blockedCount: number;
}

export function computeTaskMatrixSummary(workpacks: Workpack[]): TaskMatrixSummaryMetrics {
  return {
    totalTasks: workpacks.length,
    inProgress: workpacks.filter((w) => w.status === 'in-progress').length,
    inReview: workpacks.filter((w) => w.status === 'awaiting-review').length,
    doneToday: workpacks.filter((w) => w.status === 'done').length,
    blockedCount: workpacks.filter((w) => w.priority === 'P0 Blocker' && w.status !== 'done').length
  };
}
