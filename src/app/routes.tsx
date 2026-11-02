import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, notFound, redirect, stripSearchParams } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import type { z } from 'zod';
import { q } from '../api/queries';
import { sessionStore, setCurrentProject, useStore } from '../api/state';
import { AppShell } from '../components/shell/AppShell';
import * as audit from '../pages/audit/routes';
import * as fleet from '../pages/fleet-tuning/routes';
import * as workspace from '../pages/live-workspace/routes';
import * as mission from '../pages/mission-control/routes';
import * as overview from '../pages/overview/routes';
import * as quality from '../pages/quality-sandboxes/routes';
import * as settings from '../pages/settings/routes';
import * as spec from '../pages/spec-studio/routes';
import * as matrix from '../pages/task-matrix/routes';
import { useExtensions } from './extensions';
import { NoProjects, NotFoundPage, PageNotFound, RouteError, RoutePending, SignedOut } from './Fallbacks';
import { selectOfflineProject } from './offline';
import { parseSearch, stringifySearch } from './search';
import { ToastHost } from './ToastHost';

interface RouterContext {
  queryClient: QueryClient;
}

/** The app root: the routed page, or the signed-out screen when there is no session; toasts and mock tooling on top. */
function Root() {
  const { token } = useStore(sessionStore);
  const { roots } = useExtensions();
  return (
    <>
      {token ? <Outlet /> : <SignedOut />}
      <ToastHost />
      {roots.map((Component, index) => (
        <Component key={index} />
      ))}
    </>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Root });

/** `/` goes to the first project's overview. */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(q.me());
    const first = me.projects[0];
    if (first) throw redirect({ to: '/p/$project/overview', params: { project: first.id }, replace: true });
  },
  component: NoProjects,
});

/** `/p/:project`: checks the project exists, tells the API client which one it is, and mounts the shell. */
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'p/$project',
  beforeLoad: async ({ params, context }) => {
    const me = await context.queryClient.ensureQueryData(q.me());
    if (!me.projects.some((project) => project.id === params.project)) throw notFound({ data: { project: params.project } });
    setCurrentProject(params.project);
    selectOfflineProject(params.project);
  },
  component: AppShell,
  notFoundComponent: PageNotFound,
});

const projectIndexRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/p/$project/overview', params: { project: params.project }, replace: true });
  },
});

interface PageModule {
  /** Path below `/p/$project`, with optional params such as `matrix/{-$wpId}`. */
  path: string;
  SearchSchema: z.ZodType<Record<string, unknown>>;
}

/**
 * One page of the project. Its search schema validates the URL (every field has a fallback), and a value
 * equal to its default is dropped from the URL so links stay short. The page's code loads on demand.
 */
function pageRoute(module: PageModule, load: () => Promise<{ default: ComponentType }>) {
  const defaults = module.SearchSchema.parse({});
  return createRoute({
    getParentRoute: () => projectRoute,
    path: module.path,
    validateSearch: (search: Record<string, unknown>) => module.SearchSchema.parse(search),
    search: { middlewares: [stripSearchParams(defaults)] },
    component: lazyRouteComponent(load),
  });
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute.addChildren([
    projectIndexRoute,
    pageRoute(overview, () => import('../pages/overview')),
    pageRoute(mission, () => import('../pages/mission-control')),
    pageRoute(matrix, () => import('../pages/task-matrix')),
    pageRoute(workspace, () => import('../pages/live-workspace')),
    pageRoute(quality, () => import('../pages/quality-sandboxes')),
    pageRoute(spec, () => import('../pages/spec-studio')),
    pageRoute(fleet, () => import('../pages/fleet-tuning')),
    pageRoute(settings, () => import('../pages/settings')),
    pageRoute(audit, () => import('../pages/audit')),
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    parseSearch,
    stringifySearch,
    defaultPreload: 'intent',
    defaultPendingMs: 300,
    defaultPendingMinMs: 0,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFoundPage,
    // Pages scroll inside their own containers, never the document.
    scrollRestoration: false,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
