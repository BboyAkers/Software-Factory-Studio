import { useMemo } from 'react';
import { Badge, Icon } from '../../../../components/ui';
import { REQUIRED_PAT_PERMISSIONS, type Repository } from '../../../../contracts';

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'Contents: Read and write': 'Create workpack branches and push autonomous commits',
  'Pull requests: Read and write': 'Open, steer, and manage pull requests on mainline',
  'Checks: Read and write': 'Post deterministic GateKeeper validation check runs',
  'Issues: Read and write': 'Intake Epics from issues and post status comments',
  'Deployments: Read': 'Track staging deployment state after merging to trunk',
  'Metadata: Read': 'Inspect repository details and default branch configuration',
};

interface TokenPermissionsGridProps {
  permissions: Repository['permissions'];
}

export function TokenPermissionsGrid({ permissions }: TokenPermissionsGridProps) {
  const permissionsByName = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const perm of permissions) {
      map.set(perm.name, perm.granted);
    }
    return map;
  }, [permissions]);

  const grantedCount = useMemo(
    () =>
      REQUIRED_PAT_PERMISSIONS.reduce(
        (count, permName) => ((permissionsByName.get(permName) ?? true) ? count + 1 : count),
        0,
      ),
    [permissionsByName],
  );

  const totalCount = REQUIRED_PAT_PERMISSIONS.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-semibold text-white">Fine-Grained Token Permissions</h3>
          <p className="text-[12px] text-on-surface-variant">
            Scopes granted to the Personal Access Token for autonomous operations and check runs.
          </p>
        </div>
        <Badge
          tone={grantedCount === totalCount ? 'success' : 'warning'}
          icon={grantedCount === totalCount ? 'verified' : 'warning'}
        >
          {grantedCount} / {totalCount} Granted
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {REQUIRED_PAT_PERMISSIONS.map((permName) => {
          const granted = permissionsByName.get(permName) ?? true;
          const desc = PERMISSION_DESCRIPTIONS[permName] ?? 'Repository scope for swarm operations';

          return (
            <div
              key={permName}
              className="flex items-start gap-2.5 rounded-md border border-fluent-border bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
            >
              <Icon
                name={granted ? 'check_circle' : 'cancel'}
                size={17}
                className={granted ? 'mt-0.5 text-fluent-success' : 'mt-0.5 text-fluent-danger-text'}
              />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] font-semibold text-white truncate">
                  {permName}
                </div>
                <div className="mt-0.5 text-[12px] leading-4 text-on-surface-variant">
                  {desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

