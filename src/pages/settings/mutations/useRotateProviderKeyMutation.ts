import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';

export interface RotateProviderKeyVars {
  id: string;
  value: string;
  providerName?: string;
}

export function useRotateProviderKeyMutation() {
  return useApiMutation<RotateProviderKeyVars, undefined>({
    call: ({ id, value }) => write.integration.putKey(id, value),
    invalidate: (projectId) => [
      keys.integrations(projectId),
      keys.agents(projectId),
      keys.models(projectId),
      keys.fleetStats(projectId),
      keys.auditAll(projectId),
    ],
    success: (_data, vars) =>
      `Saved ${vars.providerName ?? vars.id} API key. Fleet agents now use ${vars.providerName ?? vars.id} models.`,
    subject: ({ providerName, id }) => `${providerName ?? id} API key`,
  });
}
