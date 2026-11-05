import { useState } from 'react';
import { useMe } from '../api/queries';
import { useGo } from './nav';
import { Badge, Button, Card, Icon } from '../components/ui';
import { GitHubIcon } from '../pages/settings/components/GitHubIcon';
import { ConnectGitHubModal } from '../pages/settings/components/ConnectGitHubModal';
import { DisconnectRepoConfirmDialog } from '../pages/settings/components/DisconnectRepoConfirmDialog';
import { useDisconnectProjectMutation } from '../pages/settings/mutations/useDisconnectProjectMutation';
import type { Project } from '../contracts';

export const SELECTED_PROJECT_KEY = 'factory.selected_project';

let cachedSelectedProject: string | null | undefined = undefined;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SELECTED_PROJECT_KEY || event.key === null) {
      cachedSelectedProject = undefined;
    }
  });
}

export function getSelectedProject(): string | null {
  if (cachedSelectedProject !== undefined) return cachedSelectedProject;
  try {
    cachedSelectedProject = globalThis.localStorage?.getItem(SELECTED_PROJECT_KEY) ?? null;
  } catch {
    cachedSelectedProject = null;
  }
  return cachedSelectedProject;
}

export function setSelectedProject(projectId: string): void {
  cachedSelectedProject = projectId;
  try {
    globalThis.localStorage?.setItem(SELECTED_PROJECT_KEY, projectId);
  } catch {
    // storage unavailable
  }
}

export function clearSelectedProject(): void {
  cachedSelectedProject = null;
  try {
    globalThis.localStorage?.removeItem(SELECTED_PROJECT_KEY);
  } catch {
    // storage unavailable
  }
}

const LOADING_VIEW = (
  <div className="mica-bg flex min-h-screen w-full flex-col items-center justify-center p-6 text-on-surface">
    <div className="w-full max-w-2xl space-y-6">
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 animate-pulse">
          <GitHubIcon size={30} className="text-white/40" />
        </div>
        <div className="mx-auto mt-4 h-6 w-64 rounded bg-white/10 animate-pulse" />
        <div className="mx-auto mt-2 h-4 w-96 rounded bg-white/5 animate-pulse" />
      </div>
      <Card className="p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-white/10 animate-pulse" />
        <div className="h-12 w-full rounded bg-white/5 animate-pulse" />
        <div className="h-12 w-full rounded bg-white/5 animate-pulse" />
      </Card>
    </div>
  </div>
);

const BRAND_HEADER = (
  <div className="text-center">
    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 shadow-fluent-elevation-8">
      <GitHubIcon size={30} className="text-white" />
    </div>
    <h1 className="mt-4 text-[22px] font-semibold text-white tracking-tight">
      Connect to GitHub &amp; Select Repository
    </h1>
    <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-5 text-on-surface-variant">
      Software Factory Studio needs a connected GitHub repository to coordinate autonomous swarm synthesis, deterministic gate verification, and pull request intake.
    </p>
  </div>
);

export function SelectOrConnectRepo() {
  const me = useMe();
  const go = useGo();
  const projects = me.data?.projects ?? [];

  const [manualConnectOpen, setManualConnectOpen] = useState(false);
  const [autoOpenDismissed, setAutoOpenDismissed] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<Project | null>(null);
  const disconnectMutation = useDisconnectProjectMutation();

  // Derive modal open state during render instead of triggering a cascading effect (rerender-derived-state-no-effect)
  const connectModalOpen =
    manualConnectOpen ||
    (!me.isLoading && me.isSuccess && projects.length === 0 && !autoOpenDismissed);

  const handleCloseConnectModal = () => {
    setManualConnectOpen(false);
    setAutoOpenDismissed(true);
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;
    try {
      await disconnectMutation.mutateAsync(disconnectTarget.id);
      if (getSelectedProject() === disconnectTarget.id) {
        clearSelectedProject();
      }
      setDisconnectTarget(null);
    } catch {
      // Toast handled by mutation
    }
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProject(projectId);
    void go('overview', { project: projectId });
  };

  const handleConnectSuccess = (newProjectId: string) => {
    setSelectedProject(newProjectId);
    void go('overview', { project: newProjectId });
  };

  if (me.isLoading) {
    return LOADING_VIEW;
  }

  return (
    <div className="mica-bg flex min-h-screen w-full flex-col items-center justify-center p-6 text-on-surface">
      <div className="w-full max-w-2xl space-y-6">
        {BRAND_HEADER}

        {/* Existing Connected Repositories */}
        {projects.length > 0 ? (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between border-b border-fluent-border pb-3">
                <div>
                  <h2 className="text-[14px] font-semibold text-white">Available Repositories</h2>
                  <p className="text-[12px] text-on-surface-variant">
                    Select an active repository to launch your workspace.
                  </p>
                </div>
                <Badge tone="info" icon="folder">
                  {projects.length} {projects.length === 1 ? 'Repository' : 'Repositories'}
                </Badge>
              </div>

              <div className="mt-3 divide-y divide-fluent-border">
                {projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-white/[0.02] px-2 rounded-md"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[14px] font-semibold text-white truncate">
                          {proj.repo || proj.name}
                        </span>
                        <Badge tone="neutral" mono>
                          {proj.defaultBranch}
                        </Badge>
                      </div>
                      <p className="text-[12px] text-on-surface-muted truncate">
                        Project ID: <span className="font-mono">{proj.id}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="link_off"
                        onClick={() => setDisconnectTarget(proj)}
                        disabled={disconnectMutation.isPending}
                      >
                        Disconnect
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        iconRight="arrow_forward"
                        onClick={() => handleSelectProject(proj.id)}
                      >
                        Select &amp; Launch
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Connect Another Repo Option */}
            <div className="rounded-lg border border-dashed border-fluent-border p-4 text-center">
              <p className="text-[12px] text-on-surface-variant">
                Want to link a different GitHub repository to the factory?
              </p>
              <div className="mt-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="add_link"
                  onClick={() => setManualConnectOpen(true)}
                >
                  Connect New GitHub Repository
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Empty State: Prompt directly to connect */
          <Card className="p-8 text-center space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-fluent-border bg-white/5 text-on-surface-variant">
              <Icon name="link_off" size={24} />
            </div>
            <div className="space-y-1">
              <h2 className="text-[16px] font-semibold text-white">No GitHub Repositories Connected Yet</h2>
              <p className="mx-auto max-w-md text-[13px] leading-5 text-on-surface-variant">
                Connect your personal or organization repository using a fine-grained Personal Access Token to get started.
              </p>
            </div>
            <div>
              <Button
                variant="primary"
                icon="add_link"
                onClick={() => setManualConnectOpen(true)}
              >
                Connect to GitHub
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Connect GitHub Modal Wizard */}
      <ConnectGitHubModal
        open={connectModalOpen}
        onClose={handleCloseConnectModal}
        onSuccess={handleConnectSuccess}
      />

      {/* Confirm Disconnect Dialog */}
      <DisconnectRepoConfirmDialog
        open={disconnectTarget !== null}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={() => void handleConfirmDisconnect()}
        repoName={disconnectTarget?.repo || disconnectTarget?.name || ''}
        loading={disconnectMutation.isPending}
      />
    </div>
  );
}
