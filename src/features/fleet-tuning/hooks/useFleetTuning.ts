import { useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { getFleetClusterStats } from '../queries/getFleetStatus';
import { useUpdateAgentHyperparameters } from '../mutations/useUpdateAgentHyperparameters';

export function useFleetTuning() {
  const { agents, openAgentDrawer, updateAgent, addToast } = useApp();

  const clusterStats = useMemo(() => getFleetClusterStats(), []);
  const architect = useMemo(() => agents.find((a) => a.id === 'agent-1') || agents[0], [agents]);
  const specialists = useMemo(() => agents.filter((a) => a.id !== 'agent-1'), [agents]);

  const { saveTuning } = useUpdateAgentHyperparameters(updateAgent, addToast);

  const handleRunNow = (agentName: string) => {
    addToast({
      type: 'info',
      title: 'Manual Run Triggered',
      message: `${agentName} dispatched immediate intake cycle.`
    });
  };

  return {
    agents,
    architect,
    specialists,
    clusterStats,
    openAgentDrawer,
    saveTuning,
    handleRunNow
  };
}
