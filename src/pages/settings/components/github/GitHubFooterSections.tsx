import { Button, Icon } from '../../../../components/ui';

interface GitHubFooterSectionsProps {
  defaultBranch: string;
  repoFullName: string;
  isOffline: boolean;
  canConnectAllowed: boolean;
  canConnectReason?: string;
  isDisconnectPending: boolean;
  onOpenDisconnectConfirm: () => void;
}

export function GitHubFooterSections({
  defaultBranch,
  repoFullName,
  isOffline,
  canConnectAllowed,
  canConnectReason,
  isDisconnectPending,
  onOpenDisconnectConfirm,
}: GitHubFooterSectionsProps) {
  const disconnectDisabledReason = !canConnectAllowed
    ? (canConnectReason ?? 'Requires Admin role')
    : isOffline
      ? 'Needs a connection'
      : undefined;

  return (
    <>
      {/* Autonomous Isolation Note */}
      <div className="flex items-start gap-2.5 rounded-md border border-fluent-border bg-white/[0.01] p-3 text-[12px] text-on-surface-variant">
        <Icon name="shield" size={16} className="mt-0.5 text-fluent-blue-light" />
        <div className="leading-5">
          <strong className="text-white">Mainline Branch Protection:</strong> Factory agents never commit directly to the default branch (<code className="font-mono text-[11px] text-white">{defaultBranch}</code>). All synthesis takes place on isolated branches (<code className="font-mono text-[11px] text-white">factory/&lt;wp-id&gt;-&lt;slug&gt;</code>) and undergoes deterministic GateKeeper verification before PR creation.
        </div>
      </div>

      {/* Repository Removal / Danger Zone */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-fluent-danger/25 bg-fluent-danger/5 p-3.5">
        <div>
          <h4 className="text-[13px] font-semibold text-white flex items-center gap-2">
            <Icon name="link_off" size={16} className="text-fluent-danger-text" />
            Disconnect Repository
          </h4>
          <p className="mt-0.5 text-[12px] text-on-surface-variant">
            Unlink <span className="font-mono text-white">{repoFullName}</span> from Software Factory Studio. Halts active agent swarms and removes project routing.
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          icon="link_off"
          onClick={onOpenDisconnectConfirm}
          disabled={!canConnectAllowed || isOffline || isDisconnectPending}
          disabledReason={disconnectDisabledReason}
        >
          Disconnect Repository
        </Button>
      </div>
    </>
  );
}

