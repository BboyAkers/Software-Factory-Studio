import { useQueryClient } from '@tanstack/react-query';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { useMe, useProjectId } from '../api/queries';
import { setSessionToken } from '../api/state';
import type { Project, Role } from '../contracts';
import { can, requiredRole, requiresTooltip, type Capability } from '../domain/rbac';

export interface Session {
  user: { id: string; name: string; email: string } | null;
  /** Viewer until `/me` answers: an unknown person gets the least access, never the most. */
  role: Role;
  projectId: string;
  project: Project | undefined;
  projects: Project[];
}

/** Who is signed in, their role, and which project they are looking at (spec §16.1). */
export function useSession(): Session {
  const me = useMe();
  const projectId = useProjectId();
  const projects = me.data?.projects ?? [];
  return {
    user: me.data ? { id: me.data.id, name: me.data.name, email: me.data.email } : null,
    role: me.data?.role ?? 'viewer',
    projectId,
    project: projects.find((p) => p.id === projectId),
    projects,
  };
}

export interface CanResult {
  allowed: boolean;
  requiredRole: Role;
  /** "Requires Maintainer" when the role falls short, otherwise `undefined`. Pass it as `disabledReason`. */
  reason: string | undefined;
}

/** Whether the signed-in role may do something (spec Appendix G), and what to tell them when it may not. */
export function useCan(capability: Capability): CanResult {
  const { role } = useSession();
  const allowed = can(role, capability);
  return { allowed, requiredRole: requiredRole(capability), reason: allowed ? undefined : requiresTooltip(capability) };
}

type Gated = { disabled?: boolean; disabledReason?: ReactNode };

/**
 * Gate a control by capability. A control the role cannot use stays on screen, disabled, with the role in
 * its tooltip. Pass a Button/IconButton and it is cloned with `disabled` and `disabledReason`, or pass a
 * render function for anything else:
 *
 *     <Can capability="workpack.cancel"><Button>Cancel</Button></Can>
 *     <Can capability="budget.update">{(can) => <Input disabled={!can.allowed} title={can.reason} />}</Can>
 *
 * `mode="hide"` removes the control instead. Use it only where showing it would teach nothing.
 */
export function Can({ capability, mode = 'disable', children }: { capability: Capability; mode?: 'disable' | 'hide'; children: ReactElement<Gated> | ((can: CanResult) => ReactNode) }) {
  const result = useCan(capability);
  if (typeof children === 'function') return <>{mode === 'hide' && !result.allowed ? null : children(result)}</>;
  if (result.allowed) return children;
  if (mode === 'hide') return null;
  if (!isValidElement<Gated>(children)) return children;
  return cloneElement(children, { disabled: true, disabledReason: result.reason });
}

/** Ends the session: forgets the token and everything cached under it. The root shows the signed-out screen. */
export function useSignOut(): () => void {
  const client = useQueryClient();
  return () => {
    setSessionToken(null);
    client.clear();
  };
}
