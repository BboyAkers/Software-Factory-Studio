import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';
import type { Integration } from '../../../contracts';

export function useToggleIntegrationMutation() {
  return useApiMutation<{ id: string; enabled: boolean }, Integration>({
    call: ({ id, enabled }) => write.integration.setEnabled(id, enabled),
    invalidate: (projectId) => [
      keys.integrations(projectId),
      keys.fleetStats(projectId),
      keys.pipelineStatus(projectId),
      keys.workpackLists(projectId),
      keys.repository(projectId),
    ],
    success: (data) => {
      if (data.id === 'github') {
        return data.enabled
          ? `Enabled ${data.name}. Active workpacks resumed.`
          : `Paused ${data.name}. Active workpacks paused.`;
      }
      if (data.category === 'Model provider') {
        return data.enabled
          ? `Enabled ${data.name} provider gateway for the agent fleet.`
          : `Paused ${data.name} provider gateway. Agents will use configured fallback models.`;
      }
      return data.enabled ? `Enabled ${data.name}.` : `Paused ${data.name}.`;
    },
    subject: ({ id }) => id,
  });
}
