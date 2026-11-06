import { useMemo, useState } from 'react';
import { useRepository, useIntegrations } from '../../../api/queries';
import { useCan, useSession } from '../../../app/session';
import { useGo } from '../../../app/nav';
import { useNow } from '../../../app/useNow';
import { connectionStore, deriveConnection } from '../../../api/state';
import { clearSelectedProject, setSelectedProject } from '../../../app/SelectOrConnectRepo';
import { Card, Skeleton, ErrorState } from '../../../components/ui';
import { ConnectGitHubModal } from './ConnectGitHubModal';
import { PauseGitHubConfirmDialog } from './PauseGitHubConfirmDialog';
import { DisconnectRepoConfirmDialog } from './DisconnectRepoConfirmDialog';
import { GitHubCardHeader } from './github/GitHubCardHeader';
import { ConnectedRepoOverview } from './github/ConnectedRepoOverview';
import { GitHubWebhookSection } from './github/GitHubWebhookSection';
import { GitHubFooterSections } from './github/GitHubFooterSections';
import { GitHubEmptyState } from './github/GitHubEmptyState';
import { useToggleIntegrationMutation } from '../mutations/useToggleIntegrationMutation';
import { useTestIntegrationMutation } from '../mutations/useTestIntegrationMutation';
import { useDisconnectProjectMutation } from '../mutations/useDisconnectProjectMutation';

const LOADING_SKELETON_CARD = (
  <Card className="p-5">
    <div className="flex items-center justify-between border-b border-fluent-border pb-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <Skeleton className="h-8 w-28 rounded-md" />
    </div>
    <div className="mt-5 space-y-4">
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-24 w-full rounded-md" />
    </div>
  </Card>
);

interface GitHubConnectionCardProps {
  onOpenConnectModal?: () => void;
  isConnectModalOpen?: boolean;
  onCloseConnectModal?: () => void;
}

export function GitHubConnectionCard({
  onOpenConnectModal,
  isConnectModalOpen,
  onCloseConnectModal,
}: GitHubConnectionCardProps) {
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

  const modalOpen = isConnectModalOpen ?? internalModalOpen;
  const openModal = onOpenConnectModal ?? (() => setInternalModalOpen(true));
  const closeModal = onCloseConnectModal ?? (() => setInternalModalOpen(false));

  const { data: repository, isLoading: repoLoading, error: repoError, refetch: refetchRepo } = useRepository();
  const { data: integrations, isLoading: intLoading, refetch: refetchIntegrations } = useIntegrations();
  const { projectId: currentProjectId, projects } = useSession();
  const go = useGo();

  const now = useNow();
  const isOffline = deriveConnection(connectionStore.get(), now) === 'offline';

  const canManage = useCan('integration.manage');
  const canConnect = useCan('project.connect');

  const toggleMutation = useToggleIntegrationMutation();
  const testMutation = useTestIntegrationMutation();
  const disconnectMutation = useDisconnectProjectMutation();

  const gitHubIntegration = useMemo(
    () => integrations?.find((i) => i.id === 'github'),
    [integrations],
  );
  const isPaused = gitHubIntegration?.enabled === false || gitHubIntegration?.status === 'paused';
  const isConnected = Boolean(repository);

  const handleConfirmDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(currentProjectId);
      setDisconnectConfirmOpen(false);
      clearSelectedProject();
      const remaining = projects.filter((p) => p.id !== currentProjectId);
      if (remaining.length > 0 && remaining[0]) {
        setSelectedProject(remaining[0].id);
        void go('overview', { project: remaining[0].id });
      } else {
        window.location.href = '/?switch=true';
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggle = (next: boolean) => {
    if (!canManage.allowed || isOffline) return;
    if (!next) {
      setPauseConfirmOpen(true);
    } else {
      void toggleMutation.mutateAsync({ id: 'github', enabled: true });
    }
  };

  const handleConfirmPause = async () => {
    try {
      await toggleMutation.mutateAsync({ id: 'github', enabled: false });
      setPauseConfirmOpen(false);
    } catch {
      // Error toasted by mutation
    }
  };

  const handleTestConnection = () => {
    if (isOffline) return;
    void testMutation.mutateAsync('github');
  };

  const handleWebhookVerified = async () => {
    await Promise.all([refetchRepo(), refetchIntegrations()]);
  };

  if (repoLoading || intLoading) {
    return LOADING_SKELETON_CARD;
  }

  if (repoError) {
    return (
      <Card className="p-5">
        <ErrorState
          error={repoError}
          title="Could not load GitHub integration details"
          onRetry={() => {
            void Promise.all([refetchRepo(), refetchIntegrations()]);
          }}
        />
      </Card>
    );
  }

  return (
    <>
      <Card className="transition-all duration-150">
        <GitHubCardHeader
          isConnected={isConnected}
          isPaused={isPaused}
          isOffline={isOffline}
          canManageAllowed={canManage.allowed}
          canManageReason={canManage.reason}
          canConnectAllowed={canConnect.allowed}
          canConnectReason={canConnect.reason}
          isTogglePending={toggleMutation.isPending}
          isDisconnectPending={disconnectMutation.isPending}
          onToggleSync={handleToggle}
          onOpenConnectModal={openModal}
          onOpenDisconnectConfirm={() => setDisconnectConfirmOpen(true)}
        />

        <div className="p-5">
          {isConnected && repository ? (
            <div className="space-y-5">
              <ConnectedRepoOverview
                repository={repository}
                now={now}
                isOffline={isOffline}
                isTestingConnection={testMutation.isPending}
                onTestConnection={handleTestConnection}
              />

              <GitHubWebhookSection
                repoFullName={repository.fullName}
                webhookActive={repository.webhookActive}
                isOffline={isOffline}
                onWebhookVerified={handleWebhookVerified}
              />

              <GitHubFooterSections defaultBranch={repository.defaultBranch} />
            </div>
          ) : (
            <GitHubEmptyState
              isOffline={isOffline}
              canConnectAllowed={canConnect.allowed}
              canConnectReason={canConnect.reason}
              onOpenConnectModal={openModal}
            />
          )}
        </div>
      </Card>

      <ConnectGitHubModal
        open={modalOpen}
        onClose={closeModal}
        initialRepo={repository?.fullName ?? ''}
      />

      <PauseGitHubConfirmDialog
        open={pauseConfirmOpen}
        onClose={() => setPauseConfirmOpen(false)}
        onConfirm={() => void handleConfirmPause()}
        loading={toggleMutation.isPending}
      />

      <DisconnectRepoConfirmDialog
        open={disconnectConfirmOpen}
        onClose={() => setDisconnectConfirmOpen(false)}
        onConfirm={() => void handleConfirmDisconnect()}
        repoName={repository?.fullName ?? currentProjectId}
        loading={disconnectMutation.isPending}
      />
    </>
  );
}
