import { useExtensions } from '../../app/extensions';
import { useSession, useSignOut } from '../../app/session';
import { ROLE_LABEL } from '../../domain/rbac';
import { Avatar, Badge, Button, Popover, Skeleton } from '../ui';

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

/**
 * Who you are, your role, and Sign out. Mock mode adds a "Viewing as" switch through the extension slot,
 * so the shell itself never knows about the mock backend.
 */
export function UserMenu() {
  const { user, role } = useSession();
  const { userMenu } = useExtensions();
  const signOut = useSignOut();
  if (!user) return <Skeleton className="size-7 rounded-full" />;

  return (
    <Popover
      label="Account"
      align="end"
      className="w-72"
      trigger={(props) => (
        <button {...props} aria-label={`Account menu for ${user.name}`} className="focus-ring rounded-full">
          <Avatar initials={initialsOf(user.name)} size={28} />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar initials={initialsOf(user.name)} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-on-surface">{user.name}</p>
              <p className="truncate text-[12px] text-on-surface-variant">{user.email}</p>
            </div>
            <Badge tone="info">{ROLE_LABEL[role]}</Badge>
          </div>
          {userMenu.map((Item, index) => (
            <Item key={index} close={close} />
          ))}
          <div className="border-t border-fluent-border p-1.5">
            <Button
              variant="ghost"
              icon="logout"
              className="w-full justify-start"
              onClick={() => {
                close();
                signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
