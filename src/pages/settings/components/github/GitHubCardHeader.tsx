import { Badge, Button, Toggle } from '../../../../components/ui';
import { GitHubIcon } from '../GitHubIcon';

interface GitHubCardHeaderProps {
  isConnected: boolean;
  isPaused: boolean;
  isOffline: boolean;
  canManageAllowed: boolean;
  canManageReason?: string;
  canConnectAllowed: boolean;
  canConnectReason?: string;
  isTogglePending: boolean;
  isDisconnectPending: boolean;
  onToggleSync: (next: boolean) => void;
  onOpenConnectModal: () => void;
  onOpenDisconnectConfirm: () => void;
}

export function GitHubCardHeader({
  isConnected,
  isPaused,
  isOffline,
  canManageAllowed,
  canManageReason,
  canConnectAllowed,
  canConnectReason,
  isTogglePending,
  isDisconnectPending,
  onToggleSync,
  onOpenConnectModal,
  onOpenDisconnectConfirm,
}: GitHubCardHeaderProps) {
  const manageDisabledReason = !canManageAllowed
    ? (canManageReason ?? 'Requires Admin role')
    : isOffline
      ? 'Needs a connection'
      : undefined;

  const connectDisabledReason = !canConnectAllowed
    ? (canConnectReason ?? 'Requires Admin role')
    : isOffline
      ? 'Needs a connection'
      : undefined;

  return (
    <div className="flex flex-col gap-3 border-b border-fluent-border p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">
          <GitHubIcon size={22} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-white">GitHub Repository &amp; Source Sync</h2>
            {isConnected ? (
              isPaused ? (
                <Badge tone="warning" icon="pause_circle">
                  Integration Paused
                </Badge>
              ) : (
                <Badge tone="success" icon="check_circle">
                  Connected
                </Badge>
              )
            ) : (
              <Badge tone="neutral" icon="link_off">
                Not Connected
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-on-surface-variant">
            Synchronize repository trunk, automated pull requests, issue intake, and fine-grained access tokens.
          </p>
        </div>
      </div>

      {/* Top Right Header Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {isConnected ? (
          <div className="flex items-center gap-2 border-r border-fluent-border pr-3">
            <Toggle
              label={<span className="text-[12px] font-medium text-white">Sync Enabled</span>}
              checked={!isPaused}
              disabled={!canManageAllowed || isOffline || isTogglePending}
              disabledReason={manageDisabledReason}
              onChange={onToggleSync}
            />
          </div>
        ) : null}

        <Button
          variant={isConnected ? 'secondary' : 'primary'}
          size="sm"
          icon={isConnected ? 'swap_horiz' : 'add_link'}
          onClick={onOpenConnectModal}
          disabled={!canConnectAllowed || isOffline}
          disabledReason={connectDisabledReason}
        >
          {isConnected ? 'Connect Another Repo' : 'Connect Repository'}
        </Button>

        {isConnected ? (
          <Button
            variant="danger"
            size="sm"
            icon="link_off"
            onClick={onOpenDisconnectConfirm}
            disabled={!canConnectAllowed || isOffline || isDisconnectPending}
            disabledReason={connectDisabledReason}
          >
            Disconnect Repo
          </Button>
        ) : null}
      </div>
    </div>
  );
}

