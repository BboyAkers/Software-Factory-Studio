import { ROLES, type Role } from '../contracts';

/** Spec Appendix G. Every UI control and API call maps to exactly one capability. */
export const CAPABILITIES = {
  'steering.suggest': 'viewer',
  'audit.verify': 'viewer',

  'epic.preview': 'engineer',
  'epic.dispatch': 'engineer',
  'epic.pause': 'engineer',
  'workpack.create': 'engineer',
  'workpack.cancel': 'engineer',
  'workpack.requestChanges': 'engineer',
  'workpack.pause': 'engineer',
  'workpack.archive': 'engineer',
  'steering.inject': 'engineer',
  'steering.approve': 'engineer',
  'steering.reject': 'engineer',
  'editor.write': 'engineer',
  'terminal.exec': 'engineer',

  'steering.veto': 'maintainer',
  'workpack.fork': 'maintainer',
  'workpack.promote': 'maintainer',
  'workpack.rollback': 'maintainer',
  'workpack.holdForReview': 'maintainer',
  'contract.unlock': 'maintainer',
  'agent.tune': 'maintainer',
  'agent.run': 'maintainer',
  'vault.manage': 'maintainer',
  'pipeline.pause': 'maintainer',
  'benchmark.run': 'maintainer',
  'audit.export': 'maintainer',

  'budget.update': 'admin',
  'integration.manage': 'admin',
  'policy.update': 'admin',
  'token.rotate': 'admin',
  'slack.manage': 'admin',
  'project.connect': 'admin',
} as const satisfies Record<string, Role>;

export type Capability = keyof typeof CAPABILITIES;

export const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Viewer',
  engineer: 'Engineer',
  maintainer: 'Maintainer',
  admin: 'Admin',
};

export function roleRank(role: Role): number {
  return ROLES.indexOf(role);
}

export function requiredRole(capability: Capability): Role {
  return CAPABILITIES[capability];
}

export function can(role: Role, capability: Capability): boolean {
  return roleRank(role) >= roleRank(CAPABILITIES[capability]);
}

export function capabilitiesFor(role: Role): Capability[] {
  return (Object.keys(CAPABILITIES) as Capability[]).filter((c) => can(role, c));
}

/** Tooltip text for a control the role cannot use. */
export function requiresTooltip(capability: Capability): string {
  return `Requires ${ROLE_LABEL[requiredRole(capability)]}`;
}
