import type { Agent, ToastMessage } from '../../../types';

export function useUpdateAgentHyperparameters(
  updateAgent: (id: string, updates: Partial<Agent>) => void,
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
) {
  const saveTuning = (agentId: string, updates: Partial<Agent>) => {
    updateAgent(agentId, updates);
    addToast({
      type: 'success',
      title: 'Agent Parameters Saved',
      message: `Hyperparameters updated for ${agentId}. Container live reload triggered.`
    });
  };

  return { saveTuning };
}
