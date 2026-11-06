import { useApiMutation } from '../../../api/mutations';
import { write } from '../../../api/endpoints';
import { keys } from '../../../domain/queryKeys';
import type { AgentCycleResult } from '../../../contracts';

export function useRunAgentMutation() {
  return useApiMutation<string, AgentCycleResult>({
    call: (agentId) => write.agent.run(agentId),
    invalidate: (projectId) => [
      keys.agents(projectId),
      keys.intake(projectId),
      keys.epics(projectId),
    ],
    success: (result) =>
      `Cycle completed: evaluated ${result.processed} items, filed ${result.filed} new issues.`,
    subject: (agentId) => `Agent ${agentId}`,
  });
}

