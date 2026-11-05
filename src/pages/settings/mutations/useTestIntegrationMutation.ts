import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import type { ConnectivityResult } from '../../../contracts';

export function useTestIntegrationMutation() {
  return useApiMutation<string, ConnectivityResult>({
    call: (id) => write.integration.test(id),
    success: (result) =>
      result.ok
        ? `Connection verified in ${result.latencyMs}ms: ${result.message}`
        : `Connection test failed: ${result.message}`,
    subject: (id) => id,
  });
}
