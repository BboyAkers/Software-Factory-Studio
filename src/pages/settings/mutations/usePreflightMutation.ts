import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import type { PreflightResult } from '../../../contracts';

export interface PreflightParams {
  repo: string;
  token: string;
  defaultBranch?: string;
}

export function usePreflightMutation() {
  return useApiMutation<PreflightParams, PreflightResult>({
    call: (params) => write.project.preflight(params),
    errorToast: false, // Handled inline in the preflight results panel
    subject: () => 'preflight',
  });
}
