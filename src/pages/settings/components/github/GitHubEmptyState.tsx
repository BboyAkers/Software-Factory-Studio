import { Button } from '../../../../components/ui';
import { GitHubIcon } from '../GitHubIcon';

const EMPTY_STATE_COPY = (
  <>
    <div className="flex size-14 items-center justify-center rounded-full border border-fluent-border bg-white/5 text-white">
      <GitHubIcon size={30} />
    </div>
    <div className="mt-4 max-w-md">
      <h3 className="text-[16px] font-semibold text-white">Connect a GitHub Repository</h3>
      <p className="mt-1.5 text-[13px] leading-5 text-on-surface-variant">
        Link your repository using a fine-grained Personal Access Token to enable autonomous swarm workflows, deterministic Quality Sandbox gates, and automatic issue intake.
      </p>
    </div>
  </>
);

interface GitHubEmptyStateProps {
  isOffline: boolean;
  canConnectAllowed: boolean;
  canConnectReason?: string;
  onOpenConnectModal: () => void;
}

export function GitHubEmptyState({
  isOffline,
  canConnectAllowed,
  canConnectReason,
  onOpenConnectModal,
}: GitHubEmptyStateProps) {
  const disabledReason = !canConnectAllowed
    ? (canConnectReason ?? 'Requires Admin role')
    : isOffline
      ? 'Needs a connection'
      : undefined;

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {EMPTY_STATE_COPY}
      <div className="mt-5">
        <Button
          variant="primary"
          icon="add_link"
          onClick={onOpenConnectModal}
          disabled={!canConnectAllowed || isOffline}
          disabledReason={disabledReason}
        >
          Connect GitHub Repository
        </Button>
      </div>
    </div>
  );
}

