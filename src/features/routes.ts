import { overviewRoute } from './overview/routes';
import { missionControlRoute } from './mission-control/routes';
import { taskMatrixRoute } from './task-matrix/routes';
import { liveWorkspaceRoute } from './live-workspace/routes';
import { qualitySandboxesRoute } from './quality-sandboxes/routes';
import { specStudioRoute } from './spec-studio/routes';
import { fleetTuningRoute } from './fleet-tuning/routes';
import { settingsRoute } from './settings/routes';

export const allFeatureRoutes = [
  overviewRoute,
  missionControlRoute,
  taskMatrixRoute,
  liveWorkspaceRoute,
  qualitySandboxesRoute,
  specStudioRoute,
  fleetTuningRoute,
  settingsRoute
];

export {
  overviewRoute,
  missionControlRoute,
  taskMatrixRoute,
  liveWorkspaceRoute,
  qualitySandboxesRoute,
  specStudioRoute,
  fleetTuningRoute,
  settingsRoute
};
