import type { Workpack, TaskPriority, TaskStatus } from '../../../types';

export interface TaskColumnDef {
  status: TaskStatus;
  label: string;
  dotColor: string;
}

export const TASK_COLUMNS: TaskColumnDef[] = [
  { status: 'queued', label: 'Queued Tasks', dotColor: 'bg-on-surface-muted' },
  { status: 'planning', label: 'Spec & Planning', dotColor: 'bg-primary' },
  { status: 'in-progress', label: 'In Progress', dotColor: 'bg-fluent-success' },
  { status: 'verification', label: 'Verification Gates', dotColor: 'bg-[#00b7c3]' },
  { status: 'awaiting-review', label: 'Awaiting Review', dotColor: 'bg-fluent-warning' },
  { status: 'done', label: 'Done Today', dotColor: 'bg-fluent-success' }
];

export function filterWorkpacks(
  workpacks: Workpack[],
  agentFilter: string,
  priorityFilter: TaskPriority | 'all',
  searchQuery: string
): Workpack[] {
  return workpacks.filter((wp) => {
    if (agentFilter !== 'all' && wp.assignedAgentName !== agentFilter) return false;
    if (priorityFilter !== 'all' && wp.priority !== priorityFilter) return false;
    if (
      searchQuery &&
      !wp.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !wp.id.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !wp.assignedAgentName.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });
}
