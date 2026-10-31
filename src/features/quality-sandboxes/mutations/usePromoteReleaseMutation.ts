import type { ToastMessage } from '../../../types';

export function usePromoteReleaseMutation(
  promoteReleaseCandidate: () => void,
  rollbackReleaseCandidate: () => void,
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
) {
  const promote = async (onSuccess?: () => void) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    promoteReleaseCandidate();
    addToast({
      type: 'success',
      title: 'Release Promoted to Mainline',
      message: 'PR #418 fast-forward merged and artifact pushed to registry.'
    });
    if (onSuccess) onSuccess();
  };

  const rollback = () => {
    rollbackReleaseCandidate();
    addToast({
      type: 'warning',
      title: 'Release Rolled Back',
      message: 'Mainline deployment paused. Container reverted to safe baseline.'
    });
  };

  return { promote, rollback };
}
