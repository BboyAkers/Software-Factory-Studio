import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';
import type { Integration } from '../../../contracts';

export function useToggleIntegrationMutation() {
  return useApiMutation<{ id: string; enabled: boolean }, Integration>({
    call: ({ id, enabled }) => write.integration.setEnabled(id, enabled),
    invalidate: (projectId) => [
      keys.integrations(projectId),
      keys.pipelineStatus(projectId),
      keys.workpackLists(projectId),
      keys.repository(projectId),
    ],
    success: (data) =>
      data.enabled
        ? `Enabled ${data.name}. Active workpacks resumed.`
        : `Paused ${data.name}. Active workpacks paused.`,
    subject: ({ id }) => id,
  });
}
