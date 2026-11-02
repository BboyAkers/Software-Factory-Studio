export interface OverviewMetricItem {
  id: string;
  label: string;
  value: string;
  subValue: string;
  delta: string;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
  color: string;
  sparkline: number[];
}

export interface SystemHealthSummary {
  status: 'optimal' | 'degraded' | 'critical';
  activeSpecialists: number;
  totalSpecialists: number;
  autonomousVelocity: number; // percentage 0-100
  uptimePercent: number;
  tokensProcessedToday: string;
}

export function calculateAutonomousRatio(doneTasks: number, totalTasks: number): number {
  if (totalTasks === 0) return 100;
  return Math.round((doneTasks / totalTasks) * 100);
}

export function formatTokenVolume(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M tok`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k tok`;
  }
  return `${tokens} tok`;
}
