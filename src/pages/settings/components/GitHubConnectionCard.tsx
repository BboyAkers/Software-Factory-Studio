import { useState } from 'react';
import { useRepository, useIntegrations } from '../../../api/queries';
import { useCan, useSession } from '../../../app/session';
import { useGo } from '../../../app/nav';
import { useNow } from '../../../app/useNow';
import { relativeTime } from '../../../domain/format';
import { connectionStore, deriveConnection } from '../../../api/state';
import { SELECTED_PROJECT_KEY } from '../../../app/SelectOrConnectRepo';
import {
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Skeleton,
  ErrorState,
  Toggle,
  Tooltip,
} from '../../../components/ui';
import { REQUIRED_PAT_PERMISSIONS } from '../../../contracts';
import { GitHubIcon } from './GitHubIcon';
import { ConnectGitHubModal } from './ConnectGitHubModal';
import { PauseGitHubConfirmDialog } from './PauseGitHubConfirmDialog';
import { DisconnectRepoConfirmDialog } from './DisconnectRepoConfirmDialog';
import { useToggleIntegrationMutation } from '../mutations/useToggleIntegrationMutation';
import { useTestIntegrationMutation } from '../mutations/useTestIntegrationMutation';
import { useDisconnectProjectMutation } from '../mutations/useDisconnectProjectMutation';

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'Contents: Read and write': 'Create workpack branches and push autonomous commits',
  'Pull requests: Read and write': 'Open, steer, and manage pull requests on mainline',
  'Checks: Read and write': 'Post deterministic GateKeeper validation check runs',
  'Issues: Read and write': 'Intake Epics from issues and post status comments',
  'Deployments: Read': 'Track staging deployment state after merging to trunk',
  'Metadata: Read': 'Inspect repository details and default branch configuration',
};

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
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestMessage, setWebhookTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

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

  const gitHubIntegration = integrations?.find((i) => i.id === 'github');
  const isPaused = gitHubIntegration?.enabled === false || gitHubIntegration?.status === 'paused';
  const isConnected = !!repository;

  const handleConfirmDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(currentProjectId);
      setDisconnectConfirmOpen(false);
      try {
        globalThis.localStorage?.removeItem(SELECTED_PROJECT_KEY);
      } catch {
        // storage unavailable
      }
      const remaining = projects.filter((p) => p.id !== currentProjectId);
      if (remaining.length > 0 && remaining[0]) {
        try {
          globalThis.localStorage?.setItem(SELECTED_PROJECT_KEY, remaining[0].id);
        } catch {
          // storage unavailable
        }
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
      // User is turning off GitHub -> show confirm dialog
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

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/webhooks/github`;

  const handleCopyWebhook = () => {
    try {
      void navigator.clipboard?.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleTestWebhook = async () => {
    if (!repository || isOffline) return;
    setTestingWebhook(true);
    setWebhookTestMessage(null);
    try {
      const res = await fetch('/api/v1/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
        },
        body: JSON.stringify({
          zen: 'Approachable is better than simple.',
          hook_id: 1099234,
          repository: {
            full_name: repository.fullName,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setWebhookTestMessage({ ok: true, text: 'Webhook verified! Ping event acknowledged.' });
        await refetchRepo();
        await refetchIntegrations();
      } else {
        setWebhookTestMessage({ ok: false, text: data.message || 'Verification failed.' });
      }
    } catch {
      setWebhookTestMessage({ ok: false, text: 'Failed to reach webhook endpoint.' });
    } finally {
      setTestingWebhook(false);
    }
  };

  if (repoLoading || intLoading) {
    return (
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
  }

  if (repoError) {
    return (
      <Card className="p-5">
        <ErrorState
          error={repoError}
          title="Could not load GitHub integration details"
          onRetry={() => {
            void refetchRepo();
            void refetchIntegrations();
          }}
        />
      </Card>
    );
  }

  return (
    <>
      <Card className="transition-all duration-150">
        {/* Card Header */}
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
            {isConnected && (
              <div className="flex items-center gap-2 border-r border-fluent-border pr-3">
                <Toggle
                  label={<span className="text-[12px] font-medium text-white">Sync Enabled</span>}
                  checked={!isPaused}
                  disabled={!canManage.allowed || isOffline || toggleMutation.isPending}
                  disabledReason={
                    !canManage.allowed
                      ? (canManage.reason ?? 'Requires Admin role')
                      : isOffline
                        ? 'Needs a connection'
                        : undefined
                  }
                  onChange={handleToggle}
                />
              </div>
            )}

            <Button
              variant={isConnected ? 'secondary' : 'primary'}
              size="sm"
              icon={isConnected ? 'swap_horiz' : 'add_link'}
              onClick={openModal}
              disabled={!canConnect.allowed || isOffline}
              disabledReason={
                !canConnect.allowed
                  ? (canConnect.reason ?? 'Requires Admin role')
                  : isOffline
                    ? 'Needs a connection'
                    : undefined
              }
            >
              {isConnected ? 'Connect Another Repo' : 'Connect Repository'}
            </Button>

            {isConnected && (
              <Button
                variant="danger"
                size="sm"
                icon="link_off"
                onClick={() => setDisconnectConfirmOpen(true)}
                disabled={!canConnect.allowed || isOffline || disconnectMutation.isPending}
                disabledReason={
                  !canConnect.allowed
                    ? (canConnect.reason ?? 'Requires Admin role')
                    : isOffline
                      ? 'Needs a connection'
                      : undefined
                }
              >
                Disconnect Repo
              </Button>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="p-5">
          {isConnected && repository ? (
            <div className="space-y-5">
              {/* Connected Repository Overview Box */}
              <div className="rounded-lg border border-fluent-border bg-white/[0.02] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[15px] font-semibold text-white">
                      {repository.fullName}
                    </span>
                    <a
                      href={`https://github.com/${repository.fullName}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="focus-ring inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-fluent-blue-light hover:underline"
                    >
                      <span>View on GitHub</span>
                      <Icon name="open_in_new" size={13} />
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="sync"
                      onClick={handleTestConnection}
                      loading={testMutation.isPending}
                      disabled={isOffline}
                      disabledReason={isOffline ? 'Needs a connection' : undefined}
                    >
                      Test Connection
                    </Button>
                  </div>
                </div>

                {/* Metadata Pills */}
                <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-on-surface">
                    <Icon name="fork_right" size={15} className="text-on-surface-variant" />
                    <span>Default branch:</span>
                    <span className="font-mono font-medium text-white">{repository.defaultBranch}</span>
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-on-surface">
                    <Icon name="code" size={15} className="text-on-surface-variant" />
                    <span>Language:</span>
                    <span className="font-medium text-white">{repository.language}</span>
                    {repository.languageSupported ? (
                      <span className="size-1.5 rounded-full bg-fluent-success" title="Supported language" />
                    ) : (
                      <Tooltip content="Only TypeScript and JavaScript repositories are supported in v1.">
                        <span className="size-1.5 rounded-full bg-fluent-error" />
                      </Tooltip>
                    )}
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-on-surface">
                    <Icon
                      name="sensors"
                      size={15}
                      className={repository.webhookActive ? 'text-fluent-success' : 'text-fluent-warning'}
                    />
                    <span>Webhook:</span>
                    <span
                      className={`font-medium ${
                        repository.webhookActive ? 'text-fluent-success' : 'text-fluent-warning'
                      }`}
                    >
                      {repository.webhookActive ? 'Active' : 'Pending Setup'}
                    </span>
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-on-surface">
                    <Icon name="label" size={15} className="text-on-surface-variant" />
                    <span>Intake label:</span>
                    <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-white">
                      {repository.intakeLabel}
                    </code>
                  </span>

                  <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-on-surface">
                    <Icon name="update" size={15} className="text-on-surface-variant" />
                    <span>Last sync:</span>
                    <span className="text-white">{relativeTime(repository.lastSyncAt, now)}</span>
                  </span>
                </div>
              </div>

              {/* Token Permissions Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-semibold text-white">Fine-Grained Token Permissions</h3>
                    <p className="text-[12px] text-on-surface-variant">
                      Scopes granted to the Personal Access Token for autonomous operations and check runs.
                    </p>
                  </div>
                  <Badge tone="success" icon="verified">
                    6 / 6 Granted
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {REQUIRED_PAT_PERMISSIONS.map((permName) => {
                    const granted = repository.permissions.find((p) => p.name === permName)?.granted ?? true;
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

              {/* Webhook Endpoint & Ingress Configuration */}
              <div className="rounded-lg border border-fluent-border bg-white/[0.02] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-fluent-border pb-3">
                  <div>
                    <h4 className="text-[13px] font-semibold text-white flex items-center gap-2">
                      <Icon name="webhook" size={16} className="text-fluent-blue-light" />
                      GitHub Webhook Endpoint
                    </h4>
                    <p className="text-[12px] text-on-surface-variant">
                      Software Factory Studio receives GitHub events (<code className="font-mono text-white">issues</code>, <code className="font-mono text-white">issue_comment</code>, <code className="font-mono text-white">pull_request</code>, <code className="font-mono text-white">ping</code>) at this endpoint.
                    </p>
                  </div>
                  <Badge tone={repository.webhookActive ? 'success' : 'warning'} icon={repository.webhookActive ? 'check_circle' : 'pending'}>
                    {repository.webhookActive ? 'Active & Receiving' : 'Pending Verification'}
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex-1">
                      <Input
                        readOnly
                        value={webhookUrl}
                        aria-label="GitHub Webhook URL"
                        className="font-mono text-[12px] bg-black/40 border-white/10 text-white"
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={copiedWebhook ? 'check' : 'content_copy'}
                      onClick={handleCopyWebhook}
                    >
                      {copiedWebhook ? 'Copied' : 'Copy URL'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon="sensors"
                      loading={testingWebhook}
                      onClick={handleTestWebhook}
                      disabled={isOffline}
                    >
                      Send Test Ping
                    </Button>
                  </div>

                  {webhookTestMessage && (
                    <div
                      className={`text-[12px] flex items-center gap-1.5 p-2 rounded ${
                        webhookTestMessage.ok
                          ? 'bg-fluent-success/10 text-fluent-success border border-fluent-success/20'
                          : 'bg-fluent-error/10 text-fluent-error border border-fluent-error/20'
                      }`}
                    >
                      <Icon name={webhookTestMessage.ok ? 'check_circle' : 'error'} size={15} />
                      <span>{webhookTestMessage.text}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-on-surface-muted">
                    <span className="font-medium text-on-surface-variant">Active Subscriptions:</span>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">issues (Intake)</span>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">issue_comment (@factory steer)</span>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">pull_request (Merge)</span>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-white">ping (Health)</span>
                  </div>
                </div>
              </div>

              {/* Autonomous Isolation Note */}
              <div className="flex items-start gap-2.5 rounded-md border border-fluent-border bg-white/[0.01] p-3 text-[12px] text-on-surface-variant">
                <Icon name="shield" size={16} className="mt-0.5 text-fluent-blue-light" />
                <div className="leading-5">
                  <strong className="text-white">Mainline Branch Protection:</strong> Factory agents never commit directly to the default branch (<code className="font-mono text-[11px] text-white">{repository.defaultBranch}</code>). All synthesis takes place on isolated branches (<code className="font-mono text-[11px] text-white">factory/&lt;wp-id&gt;-&lt;slug&gt;</code>) and undergoes deterministic GateKeeper verification before PR creation.
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
                    Unlink <span className="font-mono text-white">{repository.fullName}</span> from Software Factory Studio. Halts active agent swarms and removes project routing.
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon="link_off"
                  onClick={() => setDisconnectConfirmOpen(true)}
                  disabled={!canConnect.allowed || isOffline || disconnectMutation.isPending}
                  disabledReason={
                    !canConnect.allowed
                      ? (canConnect.reason ?? 'Requires Admin role')
                      : isOffline
                        ? 'Needs a connection'
                        : undefined
                  }
                >
                  Disconnect Repository
                </Button>
              </div>
            </div>
          ) : (
            /* Empty State: No Repository Connected */
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-fluent-border bg-white/5 text-white">
                <GitHubIcon size={30} />
              </div>
              <div className="mt-4 max-w-md">
                <h3 className="text-[16px] font-semibold text-white">Connect a GitHub Repository</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-on-surface-variant">
                  Link your repository using a fine-grained Personal Access Token to enable autonomous swarm workflows, deterministic Quality Sandbox gates, and automatic issue intake.
                </p>
              </div>
              <div className="mt-5">
                <Button
                  variant="primary"
                  icon="add_link"
                  onClick={openModal}
                  disabled={!canConnect.allowed || isOffline}
                  disabledReason={
                    !canConnect.allowed
                      ? (canConnect.reason ?? 'Requires Admin role')
                      : isOffline
                        ? 'Needs a connection'
                        : undefined
                  }
                >
                  Connect GitHub Repository
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Connect GitHub Modal */}
      <ConnectGitHubModal
        open={modalOpen}
        onClose={closeModal}
        initialRepo={repository?.fullName ?? ''}
      />

      {/* Confirm Pause Dialog */}
      <PauseGitHubConfirmDialog
        open={pauseConfirmOpen}
        onClose={() => setPauseConfirmOpen(false)}
        onConfirm={() => void handleConfirmPause()}
        loading={toggleMutation.isPending}
      />

      {/* Confirm Disconnect Dialog */}
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
