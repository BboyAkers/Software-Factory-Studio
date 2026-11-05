import { Button, Icon, Tooltip } from '../../../../components/ui';
import type { Repository } from '../../../../contracts';
import { relativeTime } from '../../../../domain/format';

interface ConnectedRepoOverviewProps {
  repository: Repository;
  now: number;
  isOffline: boolean;
  isTestingConnection: boolean;
  onTestConnection: () => void;
}

export function ConnectedRepoOverview({
  repository,
  now,
  isOffline,
  isTestingConnection,
  onTestConnection,
}: ConnectedRepoOverviewProps) {
  return (
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
            onClick={onTestConnection}
            loading={isTestingConnection}
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
  );
}

