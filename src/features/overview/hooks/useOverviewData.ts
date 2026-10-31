import { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { getOverviewMetrics, getSystemHealth } from '../queries/getOverviewMetrics';
import { triggerFactoryBenchmark } from '../mutations/triggerFactoryBenchmark';

export type PipelineFilter = 'all' | 'in-progress' | 'queued' | 'planning' | 'verification' | 'awaiting-review';

export function useOverviewData() {
  const {
    agents,
    workpacks,
    openTaskDrawer,
    openAgentDrawer,
    setIsNewWorkpackModalOpen,
    setCurrentTab,
    addToast
  } = useApp();

  const [activePipelineFilter, setActivePipelineFilter] = useState<PipelineFilter>('in-progress');
  const [timeframe, setTimeframe] = useState('Last 24 Hours');
  const [showTimeframeMenu, setShowTimeframeMenu] = useState(false);
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  const metrics = useMemo(() => getOverviewMetrics(), []);
  const health = useMemo(() => getSystemHealth(), []);

  const filteredWorkpacks = useMemo(() => {
    return workpacks.filter((wp) => {
      if (activePipelineFilter === 'all') return true;
      return wp.status === activePipelineFilter;
    });
  }, [workpacks, activePipelineFilter]);

  const handleBenchmark = async () => {
    setIsBenchmarking(true);
    addToast({
      type: 'info',
      title: 'Benchmark Initiated',
      message: 'Running deterministic factory regression suites across 6 swarms...'
    });
    try {
      const result = await triggerFactoryBenchmark();
      addToast({
        type: 'success',
        title: 'Benchmark Complete',
        message: `Execution ${result.executionId}: ${result.passedGates}/${result.totalGates} gates verified.`
      });
    } finally {
      setIsBenchmarking(false);
    }
  };

  return {
    agents,
    workpacks,
    filteredWorkpacks,
    activePipelineFilter,
    setActivePipelineFilter,
    timeframe,
    setTimeframe,
    showTimeframeMenu,
    setShowTimeframeMenu,
    metrics,
    health,
    isBenchmarking,
    handleBenchmark,
    openTaskDrawer,
    openAgentDrawer,
    setIsNewWorkpackModalOpen,
    setCurrentTab
  };
}
