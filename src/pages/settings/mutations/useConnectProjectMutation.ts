import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation, isQueued } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';
import type { ConnectRequest, Me, Project } from '../../../contracts';

export function useConnectProjectMutation() {
  const queryClient = useQueryClient();
  const mutation = useApiMutation<ConnectRequest, Project>({
    call: (params) => write.project.connect(params),
    invalidate: (_projectId, _vars, data) => [
      keys.projects(),
      keys.me(),
      keys.all(data.id),
      keys.repository(data.id),
      keys.integrations(data.id),
      keys.pipelineStatus(data.id),
    ],
    success: (proj) => `Successfully connected ${proj.repo} as project "${proj.name}".`,
    subject: (req) => req.repo,
  });

  return {
    ...mutation,
    mutateAsync: async (vars: ConnectRequest) => {
      const result = await mutation.mutateAsync(vars);
      if (!isQueued(result)) {
        // Immediately sync the /me query cache with the newly connected project
        // so route transitions and projectRoute.beforeLoad find it without throwing notFound
        queryClient.setQueryData<Me>(keys.me(), (old) => {
          if (!old) return old;
          return {
            ...old,
            projects: [...old.projects.filter((p) => p.id !== result.id), result],
          };
        });
        await queryClient.invalidateQueries({ queryKey: keys.me() });
      }
      return result;
    },
  };
}
