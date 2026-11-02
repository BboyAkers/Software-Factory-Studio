import { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import type { TaskPriority } from '../../../types';
import { filterWorkpacks, TASK_COLUMNS } from '../lib/taskMatrixModel';
import { computeTaskMatrixSummary } from '../queries/getTaskMatrixTasks';
import { useUpdateTaskStatusMutation } from '../mutations/useUpdateTaskStatusMutation';

export function useTaskMatrixFilters() {
  const {
    workpacks,
    openTaskDrawer,
    setIsNewWorkpackModalOpen,
    updateWorkpackStatus,
    addToast
  } = useApp();

  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<TaskPriority | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'matrix' | 'stream'>('matrix');

  const filteredWorkpacks = useMemo(() => {
    return filterWorkpacks(workpacks, selectedAgentFilter, selectedSeverityFilter, searchQuery);
  }, [workpacks, selectedAgentFilter, selectedSeverityFilter, searchQuery]);

  const summary = useMemo(() => computeTaskMatrixSummary(workpacks), [workpacks]);
  const { updateStatus } = useUpdateTaskStatusMutation(updateWorkpackStatus, addToast);

  return {
    workpacks: filteredWorkpacks,
    rawWorkpacks: workpacks,
    columns: TASK_COLUMNS,
    summary,
    selectedAgentFilter,
    setSelectedAgentFilter,
    selectedSeverityFilter,
    setSelectedSeverityFilter,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    openTaskDrawer,
    setIsNewWorkpackModalOpen,
    updateStatus
  };
}
