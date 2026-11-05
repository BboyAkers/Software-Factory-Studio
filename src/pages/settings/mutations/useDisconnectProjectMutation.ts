import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';
import type { DisconnectProjectResponse } from '../../../contracts';

export function useDisconnectProjectMutation() {
  return useApiMutation<string, DisconnectProjectResponse>({
    call: (projectId) => write.project.disconnect(projectId),
    invalidate: (_projectId) => [
      keys.projects(),
      ['me'],
    ],
    success: () => 'Repository disconnected from Software Factory Studio.',
    subject: () => 'Repository',
  });
}
