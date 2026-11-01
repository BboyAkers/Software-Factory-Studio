import type { OverviewMetricItem, SystemHealthSummary } from '../lib/overviewModel';

export function getOverviewMetrics(): OverviewMetricItem[] {
  return [
    {
      id: 'active-runs',
      label: 'Active Autonomous Runs',
      value: '18 Runs',
      subValue: '6 Swarms across 3 Repos',
      delta: '+3 in last hour',
      trend: 'up',
      icon: 'precision_manufacturing',
      color: '#0078d4',
      sparkline: [8, 11, 14, 12, 16, 18]
    },
    {
      id: 'velocity',
      label: 'Autonomous Velocity',
      value: '94.8%',
      subValue: 'Zero-human-touch gate pass',
      delta: '+2.4% vs sprint avg',
      trend: 'up',
      icon: 'speed',
      color: '#107c41',
      sparkline: [88, 90, 92, 91, 93, 95]
    },
    {
      id: 'token-burn',
      label: 'Daily Token Burn & Cost',
      value: '14.2M tok',
      subValue: '$28.40 / 84 PRs produced',
      delta: '-18% cost / PR generated',
      trend: 'down',
      icon: 'receipt_long',
      color: '#b146c2',
      sparkline: [22, 19, 18, 16, 15, 14]
    },
    {
      id: 'verification-pass',
      label: 'Verification Gate Rate',
      value: '99.4%',
      subValue: '172 of 173 test suites green',
      delta: '+0.6% deterministic',
      trend: 'up',
      icon: 'verified',
      color: '#00b7c3',
      sparkline: [98, 98, 99, 99, 99, 100]
    }
  ];
}

export function getSystemHealth(): SystemHealthSummary {
  return {
    status: 'optimal',
    activeSpecialists: 6,
    totalSpecialists: 6,
    autonomousVelocity: 94.8,
    uptimePercent: 99.98,
    tokensProcessedToday: '14.2M'
  };
}
