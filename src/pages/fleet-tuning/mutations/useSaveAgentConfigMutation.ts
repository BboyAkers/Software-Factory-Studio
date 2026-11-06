import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';
import type { AgentConfig, AgentConfigVersion } from '../../../contracts';

export interface SaveAgentConfigVars {
  agentId: string;
  config: AgentConfig;
  note?: string;
  agentName?: string;
}

export function useSaveAgentConfigMutation() {
  return useApiMutation<SaveAgentConfigVars, AgentConfigVersion>({
    call: ({ agentId, config, note }) => write.agent.saveVersion(agentId, config, note),
    invalidate: (projectId, { agentId }) => [
      keys.agents(projectId),
      keys.agent(projectId, agentId),
    ],
    success: (version, vars) =>
      `Saved ${vars.agentName ?? vars.agentId} as version v${version.version}${version.evalRun ? ' (eval started)' : ''}.`,
    subject: ({ agentName, agentId }) => `${agentName ?? agentId} configuration`,
  });
}

