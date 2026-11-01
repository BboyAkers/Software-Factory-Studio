export interface FeatureRouteConfig {
  id: string;
  path: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
}

export const overviewRoute: FeatureRouteConfig = {
  id: 'overview',
  path: '/overview',
  title: 'Overview — Synthetix Swarm OS',
  description: 'Factory-wide autonomous telemetry, KPI metrics, and assembly pipeline',
  icon: 'grid_view'
};
