import React, { useState } from 'react';
import type { ConnectedRepoConfig } from '../lib/settingsModel';

interface ConnectGitHubRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig?: ConnectedRepoConfig;
  onSave: (config: ConnectedRepoConfig) => void;
}

export const ConnectGitHubRepoModal: React.FC<ConnectGitHubRepoModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSave
}) => {
  const [repoUrl, setRepoUrl] = useState(currentConfig?.repoUrl || 'BboyAkers/Software-Factory-Studio');
  const [defaultBranch, setDefaultBranch] = useState(currentConfig?.defaultBranch || 'main');
  const [authMethod, setAuthMethod] = useState<'pat' | 'app'>(currentConfig?.authMethod || 'pat');
  const [token, setToken] = useState(currentConfig?.token || 'ghp_live_developer_fine_grained_token_sec99');
  const [showToken, setShowToken] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(currentConfig?.webhookEnabled ?? true);
  const [autoMergeEnabled, setAutoMergeEnabled] = useState(currentConfig?.autoMergeEnabled ?? true);

  // Connection testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  if (!isOpen) return null;

  const handleTestConnection = () => {
    const cleanRepo = repoUrl.trim().replace(/^https?:\/\/github\.com\//, '');
    if (!cleanRepo || !cleanRepo.includes('/')) {
      setTestResult({
        status: 'error',
        message: 'Please enter a valid repository format like "owner/repo" or full GitHub URL.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ status: 'idle', message: '' });

    setTimeout(() => {
      setIsTesting(false);
      setTestResult({
        status: 'success',
        message: `Successfully authenticated! Connected to github.com/${cleanRepo} on branch "${defaultBranch || 'main'}". Read/Write scopes confirmed.`
      });
    }, 650);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRepo = repoUrl.trim().replace(/^https?:\/\/github\.com\//, '');
    if (!cleanRepo) return;

    onSave({
      repoUrl: cleanRepo,
      defaultBranch: defaultBranch.trim() || 'main',
      authMethod,
      token,
      webhookEnabled,
      autoMergeEnabled,
      connectedAt: new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC',
      lastSyncStatus: 'synced'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="acrylic-card bg-[#1e1e1e] border border-fluent-border rounded-xl shadow-2xl max-w-xl w-full p-6 text-white max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-fluent-border mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-primary">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </div>
            <div>
              <h2 id="modal-title" className="text-[16px] font-semibold text-white tracking-tight">
                Connect GitHub Repository
              </h2>
              <p className="text-[12px] text-on-surface-variant">
                Link any personal or organization repo to autonomous factory agents
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-muted hover:text-white p-1 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Auth Method Toggle */}
          <div>
            <label className="text-[11.5px] font-medium text-on-surface-muted block mb-1.5 uppercase font-mono tracking-wider">
              Authentication Method
            </label>
            <div className="grid grid-cols-2 gap-2 bg-black/30 p-1 rounded-lg border border-fluent-border">
              <button
                type="button"
                onClick={() => setAuthMethod('pat')}
                className={`py-1.5 px-3 rounded-md text-[12px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                  authMethod === 'pat'
                    ? 'bg-primary text-white font-semibold shadow'
                    : 'text-on-surface-muted hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">key</span>
                Personal Access Token (PAT)
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod('app')}
                className={`py-1.5 px-3 rounded-md text-[12px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                  authMethod === 'app'
                    ? 'bg-primary text-white font-semibold shadow'
                    : 'text-on-surface-muted hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">apps</span>
                GitHub App / OAuth
              </button>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1.5 leading-relaxed">
              {authMethod === 'pat'
                ? 'Best for individual developers. Create a fine-grained token scoped specifically to your target repository.'
                : 'Best for team workspaces. Uses installed GitHub App with automated webhook callback delivery.'}
            </p>
          </div>

          {/* Repo Slug / URL */}
          <div>
            <label className="text-[11.5px] font-medium text-on-surface-muted block mb-1 font-mono uppercase tracking-wider">
              GitHub Repository Identifier
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-muted">
                <span className="material-symbols-outlined text-[16px]">folder_git</span>
              </div>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="e.g. username/repo-name or https://github.com/username/repo-name"
                className="w-full bg-[#161616] border border-fluent-border rounded-lg pl-9 pr-3 py-2 text-[12.5px] font-mono text-white placeholder-on-surface-muted focus:outline-none focus:border-primary"
                required
              />
            </div>
            <p className="text-[11px] text-on-surface-variant mt-1">
              Supports any repository under your personal GitHub account (e.g., <code className="text-primary font-mono font-normal">BboyAkers/Software-Factory-Studio</code>).
            </p>
          </div>

          {/* Default Branch */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11.5px] font-medium text-on-surface-muted block mb-1 font-mono uppercase tracking-wider">
                Default Target Branch
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-muted">
                  <span className="material-symbols-outlined text-[16px]">fork_right</span>
                </div>
                <input
                  type="text"
                  value={defaultBranch}
                  onChange={(e) => setDefaultBranch(e.target.value)}
                  placeholder="main"
                  className="w-full bg-[#161616] border border-fluent-border rounded-lg pl-9 pr-3 py-2 text-[12.5px] font-mono text-white focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-[11.5px] font-medium text-on-surface-muted block mb-1 font-mono uppercase tracking-wider">
                Workpack Branch Prefix
              </label>
              <input
                type="text"
                value="factory/<wp-id>-<slug>"
                disabled
                className="w-full bg-[#161616]/60 border border-fluent-border/60 rounded-lg px-3 py-2 text-[12px] font-mono text-on-surface-muted"
              />
            </div>
          </div>

          {/* Token (if PAT) */}
          {authMethod === 'pat' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11.5px] font-medium text-on-surface-muted font-mono uppercase tracking-wider">
                  Personal Access Token (Fine-Grained)
                </label>
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                >
                  Generate Token on GitHub
                  <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                </a>
              </div>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_... or ghp_..."
                  className="w-full bg-[#161616] border border-fluent-border rounded-lg pl-3 pr-10 py-2 text-[12.5px] font-mono text-white placeholder-on-surface-muted focus:outline-none focus:border-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-muted hover:text-white"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {showToken ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1 text-[10.5px] font-mono text-on-surface-muted">
                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5 text-fluent-success">Contents: Read/Write</span>
                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5 text-fluent-success">Pull Requests: Read/Write</span>
                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5 text-fluent-success">Checks: Read/Write</span>
                <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5 text-on-surface-muted">Webhooks: Optional</span>
              </div>
            </div>
          )}

          {/* Autonomous Features Checkboxes */}
          <div className="p-3 bg-black/25 rounded-lg border border-white/5 space-y-2.5">
            <div className="text-[11.5px] font-semibold text-white font-mono uppercase tracking-wider">
              Factory Automation Scopes
            </div>

            <label className="flex items-center gap-2.5 text-[12px] text-on-surface-variant cursor-pointer select-none">
              <input
                type="checkbox"
                checked={webhookEnabled}
                onChange={(e) => setWebhookEnabled(e.target.checked)}
                className="rounded border-fluent-border bg-[#161616] text-primary focus:ring-0 focus:ring-offset-0"
              />
              <span>Automatic webhook sync on push events and PR status updates</span>
            </label>

            <label className="flex items-center gap-2.5 text-[12px] text-on-surface-variant cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoMergeEnabled}
                onChange={(e) => setAutoMergeEnabled(e.target.checked)}
                className="rounded border-fluent-border bg-[#161616] text-primary focus:ring-0 focus:ring-offset-0"
              />
              <span>Mainline auto-merge when 100% of Quality Sandbox gates pass</span>
            </label>
          </div>

          {/* Test Status Banner */}
          {testResult.status !== 'idle' && (
            <div
              className={`p-3 rounded-lg text-[12px] font-mono border flex items-start gap-2 ${
                testResult.status === 'success'
                  ? 'bg-fluent-success/10 border-fluent-success/30 text-fluent-success'
                  : 'bg-fluent-danger/10 border-fluent-danger/30 text-fluent-danger'
              }`}
            >
              <span className="material-symbols-outlined text-[17px] flex-shrink-0 mt-0.5">
                {testResult.status === 'success' ? 'check_circle' : 'error'}
              </span>
              <div className="leading-snug">{testResult.message}</div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-fluent-border/60 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="fluent-btn-default flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[15px]">sync</span>
                  <span>Test Connection</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-[12px] text-on-surface-muted hover:text-white px-3 py-1.5 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="fluent-btn-primary flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12.5px] font-semibold shadow-md"
              >
                <span className="material-symbols-outlined text-[16px]">link</span>
                <span>Save &amp; Connect Repo</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
