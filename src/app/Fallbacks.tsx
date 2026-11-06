import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useMe, useProjectId } from '../api/queries';
import { EmptyState, ErrorState, Icon, Skeleton, buttonClass } from '../components/ui';
import { useExtensions } from './extensions';
import { AppLink } from './nav';

/** Shown while a page's code loads. Shaped like a typical page: a title, a row of cards, a table. */
export function RoutePending() {
  return (
    <div className="p-6" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64" />
    </div>
  );
}

/** A route failed to load (`/me` unreachable, a page threw). Retrying reruns the route's loading. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="grid h-full w-full place-items-center p-6">
      <ErrorState
        error={error}
        title="This page could not load"
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </div>
  );
}

function ProjectLinks() {
  const me = useMe();
  if (me.isPending) return <Skeleton className="mt-4 h-12 w-full" />;
  const projects = me.data?.projects ?? [];
  if (projects.length === 0) return null;
  return (
    <ul className="mt-4 flex flex-col gap-1.5 text-left">
      {projects.map((project) => (
        <li key={project.id}>
          <AppLink
            project={project.id}
            to="overview"
            className="focus-ring flex items-center gap-3 rounded-md border border-fluent-border bg-surface-card px-3 py-2 transition-colors duration-150 hover:bg-white/6"
          >
            <Icon name="folder" size={18} className="text-on-surface-variant" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-on-surface">{project.name}</span>
              <span className="block truncate text-[12px] text-on-surface-variant">{project.repo}</span>
            </span>
            <Icon name="chevron_right" size={18} className="text-on-surface-variant" />
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

/** The root-level not-found: an address that matches nothing, or a project the person cannot see. */
export function NotFoundPage({ data }: { data?: unknown }) {
  const project = typeof data === 'object' && data !== null && 'project' in data ? String((data as { project: unknown }).project) : null;
  return (
    <div className="grid h-full w-full place-items-center overflow-y-auto p-6">
      <div className="w-full max-w-md">
        <EmptyState
          icon="search_off"
          title={project ? `Project “${project}” was not found` : 'This page does not exist'}
          description={project ? 'It may have been disconnected, or you may not have access to it. Pick one of your projects.' : 'Check the address, or go to one of your projects.'}
        />
        <ProjectLinks />
      </div>
    </div>
  );
}

/** An unknown page inside a project: the shell stays, so the person can navigate away. */
export function PageNotFound() {
  const current = useProjectId();
  return (
    <div className="grid h-full place-items-center p-6">
      <EmptyState
        icon="search_off"
        title="This page does not exist"
        description="Use the navigation to go somewhere else, or return to the overview."
        action={
          <div className="flex items-center gap-2">
            {current ? (
              <AppLink to="overview" className={buttonClass('secondary')}>
                Go to Overview
              </AppLink>
            ) : null}
            <a href="/?switch=true" className={buttonClass(current ? 'ghost' : 'secondary')}>
              {current ? 'Switch Project' : 'Select or Connect Repository'}
            </a>
          </div>
        }
      />
    </div>
  );
}

/** `/` for a person who belongs to no project yet. */
export function NoProjects() {
  return (
    <div className="grid h-full w-full place-items-center p-6">
      <EmptyState icon="folder_off" title="You are not in any project yet" description="Ask an Admin to add you to a project, or connect a repository if you are one." />
    </div>
  );
}

const LOGIN_URL: string = import.meta.env.VITE_LOGIN_URL ?? '/auth/login';

/**
 * Shown when there is no session, or the server answered 401. A real deployment sends the person to its
 * identity provider; mock mode replaces the link with a persona picker (see `src/app/extensions.ts`).
 */
export function SignedOut() {
  const { signIn: SignIn } = useExtensions();
  const router = useRouter();
  const client = useQueryClient();
  return (
    <div className="grid h-full w-full place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full border border-fluent-border bg-white/5 text-on-surface-variant">
          <Icon name="lock" size={20} />
        </span>
        <h1 className="mt-3 text-[18px] leading-6 font-semibold text-on-surface">You are signed out</h1>
        <p className="mt-1 text-[13px] leading-5 text-on-surface-variant">Sign in to see your projects.</p>
        <div className="mt-4">
          {SignIn ? (
            <SignIn
              onSignedIn={() => {
                void client.invalidateQueries();
                void router.invalidate();
              }}
            />
          ) : (
            <a href={LOGIN_URL} className={buttonClass('primary')}>
              Sign in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
