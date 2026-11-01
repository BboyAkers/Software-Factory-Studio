export interface FleetClusterStats {
  activeProviders: string[];
  nodeCount: number;
  monthlyBurnTokens: string;
  monthlySpendUsd: string;
  gpuVramAllocated: string;
  gpuVramTotal: string;
  cacheHitRatio: number;
}

export function calculateFleetEfficiency(cacheHit: number): string {
  if (cacheHit > 90) return 'Optimal KV Cache';
  if (cacheHit > 75) return 'Good Hit Rate';
  return 'Cache Cold Start';
}
