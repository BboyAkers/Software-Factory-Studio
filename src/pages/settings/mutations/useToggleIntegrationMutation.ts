import type { ToastMessage } from '../../../types';

export function useToggleIntegrationMutation(
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
) {
  const toggle = (_id: string, name: string, currentState: boolean) => {
    const nextState = !currentState;
    addToast({
      type: nextState ? 'success' : 'warning',
      title: nextState ? 'Integration Enabled' : 'Integration Paused',
      message: `${name} connectivity ${nextState ? 'restored' : 'temporarily suspended'}.`
    });
    return nextState;
  };

  return { toggle };
}
