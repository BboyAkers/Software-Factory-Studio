import type { TaskStatus, ToastMessage } from '../../../types';

export function useUpdateTaskStatusMutation(
  updateWorkpackStatus: (id: string, status: TaskStatus) => void,
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
) {
  const updateStatus = (id: string, newStatus: TaskStatus) => {
    updateWorkpackStatus(id, newStatus);
    addToast({
      type: 'success',
      title: 'Status Updated',
      message: `Workpack ${id} moved to ${newStatus}.`
    });
  };

  return {
    updateStatus
  };
}
