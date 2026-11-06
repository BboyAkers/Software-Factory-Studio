import { useMemo } from 'react';
import { useEpic, useWorkpacks } from '../../../api/queries';
import { usePauseEpic, useResumeEpic } from '../../../api/mutations';
import { useCan } from '../../../app/session';
import { usd } from '../../../domain/format';
import {
  Badge,
  Button,
  Drawer,
  Icon,
  Spinner,
  StatusDot,
  type Tone,
} from '../../../components/ui';

export interface EpicDrawerProps {
  epicId: string | null;
  open: boolean;
  onClose: () => void;
  onSelectWorkpack?: (workpackId: string) => void;
}

const STATUS_TONE: Record<string, Tone> = {
  intake: 'info',
  'stage-1': 'purple',
  'stage-2': 'purple',
  executing: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

export function EpicDrawer({ epicId, open, onClose, onSelectWorkpack }: EpicDrawerProps) {
  const epicQuery = useEpic(open ? epicId : null);
  const workpacksQuery = useWorkpacks({ epic: epicId ?? undefined });
  const pauseMutation = usePauseEpic();
  const resumeMutation = useResumeEpic();
  const canPause = useCan('epic.pause');

  const epic = epicQuery.data;
  const workpacks = useMemo(() => workpacksQuery.data?.items ?? [], [workpacksQuery.data?.items]);

  if (!open) return null;

  const handleTogglePause = () => {
    if (!epic) return;
    if (epic.paused) {
      resumeMutation.mutate(epic.id);
    } else {
      pauseMutation.mutate(epic.id);
    }
  };

  const isMutating = pauseMutation.isPending || resumeMutation.isPending;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-brand">{epicId}</span>
          {epic && <Badge tone={STATUS_TONE[epic.status] ?? 'neutral'}>{epic.status}</Badge>}
          {epic?.paused && <Badge tone="warning">Paused</Badge>}
        </div>
      }
      description={epic?.title ?? 'Epic Details'}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-[12px] text-on-surface-variant">
            {epic && (
              <span>
                Total Spend: <strong className="text-on-surface">{usd(epic.spendUsdMicros)}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {epic && (
              <Button
                variant={epic.paused ? 'primary' : 'secondary'}
                onClick={handleTogglePause}
                loading={isMutating}
                disabled={!canPause.allowed}
                title={canPause.reason}
              >
                {epic.paused ? 'Resume Epic' : 'Pause Epic'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      {epicQuery.isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Spinner />
        </div>
      ) : !epic ? (
        <p className="text-[13px] text-on-surface-variant">Epic not found.</p>
      ) : (
        <div className="flex flex-col gap-6 text-[13px]">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-fluent-border bg-surface-sunken">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-on-surface-variant block">Priority</span>
              <span className="font-semibold text-on-surface">{epic.priority}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-on-surface-variant block">Mode</span>
              <span className="font-semibold text-on-surface">{epic.mode}</span>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-on-surface-variant block">Source</span>
              <span className="font-semibold text-on-surface">{epic.source} (#{epic.issueNumber})</span>
            </div>
          </div>

          {epic.budgetCapNote && (
            <div className="p-3 rounded border border-fluent-warning/30 bg-fluent-warning-subtle text-fluent-warning text-[12px]">
              {epic.budgetCapNote}
            </div>
          )}

          {/* Workpacks in this Epic */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-on-surface flex items-center justify-between">
              <span>Workpacks ({workpacks.length})</span>
            </h3>
            <div className="flex flex-col gap-2">
              {workpacks.length === 0 ? (
                <p className="text-[12px] text-on-surface-variant italic">No workpacks synthesized yet.</p>
              ) : (
                workpacks.map((wp) => (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => {
                      if (onSelectWorkpack) onSelectWorkpack(wp.id);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-fluent-border bg-surface-card hover:bg-white/5 text-left transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-semibold text-brand">{wp.id}</span>
                        <Badge tone={wp.priority === 'P0 Blocker' ? 'danger' : wp.priority === 'P1 High' ? 'warning' : 'neutral'}>
                          {wp.priority.split(' ')[0]}
                        </Badge>
                        <span className="text-sm font-medium text-on-surface truncate">{wp.title}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-on-surface-variant">
                        <span>Agent: {wp.assignedAgentId ?? '—'}</span>
                        <span>Files: {wp.targetFiles.length}</span>
                        <span>Cost: {usd(wp.costUsdMicros)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusDot tone={STATUS_TONE[wp.status] ?? 'neutral'} />
                      <span className="text-[12px] capitalize font-medium text-on-surface-variant">{wp.status}</span>
                      <Icon name="chevron_right" size={16} className="text-on-surface-variant" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Dependency DAG */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-on-surface">Dependency DAG ({epic.dag.length} nodes)</h3>
            <div className="flex flex-col gap-2">
              {epic.dag.map((node) => (
                <div key={node.id} className="p-3 rounded-lg border border-fluent-border bg-surface-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-on-surface">{node.title}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge tone="neutral">{node.stage}</Badge>
                      <Badge tone={node.complexity === 'High' ? 'danger' : node.complexity === 'Medium' ? 'warning' : 'neutral'}>
                        {node.complexity}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-[12px] text-on-surface-variant">
                    {node.targetFiles.length > 0 && (
                      <p className="font-mono truncate">Files: {node.targetFiles.join(', ')}</p>
                    )}
                    {node.dependsOn.length > 0 && (
                      <p className="mt-0.5">Depends on: {node.dependsOn.join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Contracts */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-on-surface">Attached Contracts ({epic.contracts.length})</h3>
            <div className="flex flex-col gap-2">
              {epic.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg border border-fluent-border bg-surface-card text-[12px]">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono font-medium text-on-surface block truncate">{c.path}</span>
                    <span className="text-on-surface-variant">Kind: {c.kind} · Hash: {c.hash.slice(0, 8)}</span>
                  </div>
                  <Badge tone={c.locked ? 'info' : 'warning'}>
                    {c.locked ? 'Locked' : 'Unlocked'}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}

