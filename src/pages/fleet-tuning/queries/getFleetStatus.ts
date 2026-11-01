import type { FleetClusterStats } from '../lib/fleetTuningModel';

export function getFleetClusterStats(): FleetClusterStats {
  return {
    activeProviders: ['Anthropic', 'OpenAI', 'DeepSeek', 'Google Cloud'],
    nodeCount: 42,
    monthlyBurnTokens: '284.1M',
    monthlySpendUsd: '$568.20',
    gpuVramAllocated: '48.2 GB',
    gpuVramTotal: '64.0 GB',
    cacheHitRatio: 94.2
  };
}
