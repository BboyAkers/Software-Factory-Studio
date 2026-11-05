import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';
import type { ConnectRequest, Project } from '../../../contracts';

export function useConnectProjectMutation() {
  return useApiMutation<ConnectRequest, Project>({
    call: (params) => write.project.connect(params),
    invalidate: (projectId) => [
      keys.projects(),
      keys.repository(projectId),
      keys.integrations(projectId),
      keys.pipelineStatus(projectId),
    ],
    success: (proj) => `Successfully connected ${proj.repo} as project "${proj.name}".`,
    subject: (req) => req.repo,
  });
}
