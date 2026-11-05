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
      keys.fleetStats(projectId),
      keys.auditAll(projectId),
    ],
    success: (_data, vars) =>
      `Imported API key for ${vars.providerName ?? vars.id}. Stored write-only and verified.`,
    subject: ({ providerName, id }) => `${providerName ?? id} API key`,
  });
}

