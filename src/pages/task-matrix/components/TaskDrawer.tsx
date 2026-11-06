import { useState } from 'react';
import {
  useWorkpack,
  useWorkpackRuns,
  useContracts,
  useGates,
  useAudit,
} from '../../../api/queries';
import {
  usePauseWorkpack,
  useResumeWorkpack,
  useArchiveWorkpack,
  useForkWorkpack,
  usePromoteWorkpack,
  useHoldForReview,
} from '../../../api/mutations';
import { useCan } from '../../../app/session';
import { useNow } from '../../../app/useNow';
import { useGo } from '../../../app/nav';
import { relativeTime, tokens, usd } from '../../../domain/format';
import { slaState } from '../../../domain/queue';
import { manualActions } from '../../../domain/workpackMachine';
import type { Contract, Workpack } from '../../../contracts';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Icon,
  ProgressBar,
  Spinner,
  StatusDot,
  TabPanel,
  Tabs,
  Toggle,
  type TabItem,
  type Tone,
} from '../../../components/ui';
import { CancelWorkpackDialog } from './CancelWorkpackDialog';
import { RequestChangesDialog } from './RequestChangesDialog';
import { UnlockContractDialog } from './UnlockContractDialog';

export interface TaskDrawerProps {
  wpId: string | null;
  open: boolean;
  onClose: () => void;
  onSelectEpic?: (epicId: string) => void;
}

type TabKey = 'overview' | 'runs' | 'contracts' | 'gates' | 'timeline' | 'cost';

const TAB_ITEMS: TabItem<TabKey>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'runs', label: 'Runs' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'gates', label: 'Gates' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'cost', label: 'Cost' },
];

const STATUS_TONES: Record<string, Tone> = {
  queued: 'neutral',
  planning: 'purple',
  'in-progress': 'info',
  verification: 'warning',
  'awaiting-review': 'purple',
  done: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

function getInitials(name: string): string {
  const parts = name.split(/[\s-_]+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function TaskDrawer({ wpId, open, onClose, onSelectEpic }: TaskDrawerProps) {
  const go = useGo();
  const now = useNow();
  const [tab, setTab] = useState<TabKey>('overview');

  // Dialog states
  const [cancelOpen, setCancelOpen] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [unlockContract, setUnlockContract] = useState<Contract | null>(null);

  const wpQuery = useWorkpack(open ? wpId : null);
  const runsQuery = useWorkpackRuns(open ? wpId : null);
  const contractsQuery = useContracts(open ? wpId : null);
  const gatesQuery = useGates(open ? wpId : null);
  const auditQuery = useAudit(open && wpId ? { workpack: wpId } : {});

  const pauseMutation = usePauseWorkpack();
  const resumeMutation = useResumeWorkpack();
  const archiveMutation = useArchiveWorkpack();
  const forkMutation = useForkWorkpack();
  const promoteMutation = usePromoteWorkpack();
  const holdForReviewMutation = useHoldForReview();

  const pauseCan = useCan('workpack.pause');
  const cancelCan = useCan('workpack.cancel');
  const requestChangesCan = useCan('workpack.requestChanges');
  const promoteCan = useCan('workpack.promote');
  const forkCan = useCan('workpack.fork');
  const archiveCan = useCan('workpack.archive');
  const holdCan = useCan('workpack.holdForReview');
  const unlockCan = useCan('contract.unlock');

  const wp = wpQuery.data;
  if (!open) return null;

  const actions = wp
    ? manualActions(
        {
          status: wp.status,
          commitSha: wp.commitSha,
          mergedAt: wp.mergedAt,
          archived: wp.archived,
          pausedReasons: wp.pausedReasons,
        },
        'maintainer' // evaluate action possibilities
      )
    : [];

  const getAction = (name: string) => actions.find((a) => a.action === name);

  const slaInfo = wp ? slaState(wp, new Date(now)) : null;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base font-bold text-brand">{wpId}</span>
            {wp && (
              <>
                <Badge tone={STATUS_TONES[wp.status] ?? 'neutral'}>{wp.status}</Badge>
                <Badge
                  tone={
                    wp.priority === 'P0 Blocker'
                      ? 'danger'
                      : wp.priority === 'P1 High'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {wp.priority}
                </Badge>
                {wp.slaBreached && <Badge tone="danger">ESCALATED</Badge>}
                {wp.paused && (
                  <Badge tone="warning">
                    Paused: {wp.pausedReasons.join(', ') || 'Manual'}
                  </Badge>
                )}
                {wp.blockedBy && (
                  <Badge tone="warning">Blocked by {wp.blockedBy}</Badge>
                )}
              </>
            )}
          </div>
        }
        description={wp?.title ?? 'Task Details'}
        size="xl"
        footer={
          wp && (
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Pause / Resume */}
                {getAction('pause')?.enabled && (
                  <Button
                    variant="secondary"
                    onClick={() => pauseMutation.mutate({ id: wp.id, version: wp.version })}
                    loading={pauseMutation.isPending}
                    disabled={!pauseCan.allowed}
                    title={pauseCan.reason}
                  >
                    Pause
                  </Button>
                )}
                {getAction('resume')?.enabled && (
                  <Button
                    variant="secondary"
                    onClick={() => resumeMutation.mutate({ id: wp.id, version: wp.version })}
                    loading={resumeMutation.isPending}
                    disabled={!pauseCan.allowed}
                    title={pauseCan.reason}
                  >
                    Resume
                  </Button>
                )}

                {/* Cancel */}
                {getAction('cancel')?.enabled && (
                  <Button
                    variant="danger"
                    onClick={() => setCancelOpen(true)}
                    disabled={!cancelCan.allowed}
                    title={cancelCan.reason}
                  >
                    Cancel
                  </Button>
                )}

                {/* Request changes */}
                {getAction('requestChanges')?.enabled && (
                  <Button
                    variant="secondary"
                    onClick={() => setRequestChangesOpen(true)}
                    disabled={!requestChangesCan.allowed}
                    title={requestChangesCan.reason}
                  >
                    Request changes
                  </Button>
                )}

                {/* Approve & merge */}
                {getAction('promote')?.enabled && (
                  <Button
                    variant="primary"
                    onClick={() => promoteMutation.mutate({ id: wp.id, version: wp.version })}
                    loading={promoteMutation.isPending}
                    disabled={!promoteCan.allowed}
                    title={promoteCan.reason}
                  >
                    Approve & merge
                  </Button>
                )}

                {/* Fork */}
                {getAction('fork')?.enabled && (
                  <Button
                    variant="secondary"
                    onClick={() => forkMutation.mutate({ id: wp.id, version: wp.version })}
                    loading={forkMutation.isPending}
                    disabled={!forkCan.allowed}
                    title={forkCan.reason}
                  >
                    Fork
                  </Button>
                )}

                {/* Archive now */}
                {getAction('archive')?.enabled && (
                  <Button
                    variant="secondary"
                    onClick={() => archiveMutation.mutate({ id: wp.id, version: wp.version })}
                    loading={archiveMutation.isPending}
                    disabled={!archiveCan.allowed}
                    title={archiveCan.reason}
                  >
                    Archive now
                  </Button>
                )}
              </div>

              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          )
        }
      >
        {wpQuery.isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Spinner />
          </div>
        ) : !wp ? (
          <p className="text-[13px] text-on-surface-variant">Workpack not found.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Tabs group="task-drawer" value={tab} onChange={setTab} items={TAB_ITEMS} label="Task sections" />

            {/* TAB 1: OVERVIEW */}
            <TabPanel group="task-drawer" id="overview" value={tab}>
              <div className="flex flex-col gap-5 pt-2 text-[13px]">
                {/* Description */}
                {wp.description && (
                  <div className="p-3 rounded-lg border border-fluent-border bg-surface-card leading-relaxed">
                    <p className="text-on-surface whitespace-pre-wrap">{wp.description}</p>
                  </div>
                )}

                {/* Metadata cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded border border-fluent-border bg-surface-sunken">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-mono">Epic</span>
                    <button
                      type="button"
                      onClick={() => onSelectEpic?.(wp.epicId)}
                      className="font-medium text-brand hover:underline truncate block text-left"
                    >
                      {wp.epicId} · {wp.epicTitle || 'View Epic'}
                    </button>
                  </div>

                  <div className="p-3 rounded border border-fluent-border bg-surface-sunken">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-mono">Assigned Agent</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Avatar
                        initials={getInitials(wp.assignedAgentId ?? 'Unassigned')}
                        size={18}
                        title={wp.assignedAgentId ?? 'Unassigned'}
                      />
                      <span className="font-medium text-on-surface truncate">{wp.assignedAgentId ?? 'None'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded border border-fluent-border bg-surface-sunken">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-mono">Attempt</span>
                    <span className="font-semibold text-on-surface">
                      {wp.attempt} / {wp.maxAttempts}
                    </span>
                  </div>

                  <div className="p-3 rounded border border-fluent-border bg-surface-sunken">
                    <span className="text-[11px] text-on-surface-variant block uppercase font-mono">SLA Status</span>
                    <span className="font-medium">
                      {slaInfo?.state === 'breached' ? (
                        <span className="text-fluent-danger-text">Breached</span>
                      ) : slaInfo?.remainingMs !== null ? (
                        <span>{relativeTime(wp.slaDueAt, now)}</span>
                      ) : (
                        <span className="text-on-surface-variant">No SLA</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Links Strip: Branch, PR, Diff */}
                <div className="flex items-center gap-3 p-3 rounded-lg border border-fluent-border bg-surface-card flex-wrap">
                  <div className="flex items-center gap-1.5 text-on-surface-variant">
                    <Icon name="commit" size={16} />
                    <span className="font-mono text-[12px] text-on-surface">{wp.branch}</span>
                  </div>
                  {wp.prNumber && (
                    <div className="flex items-center gap-1.5 text-on-surface-variant">
                      <Icon name="merge" size={16} />
                      <span className="font-mono text-[12px] text-brand">PR #{wp.prNumber}</span>
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="terminal"
                      onClick={() => go(`workspace/${wp.id}`)}
                    >
                      Open workspace
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="verified_user"
                      onClick={() => go(`quality/${wp.id}`)}
                    >
                      Open quality
                    </Button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-on-surface">Completeness</span>
                    <span className="font-mono text-on-surface-variant">{Math.round(wp.completeness * 100)}%</span>
                  </div>
                  <ProgressBar value={wp.completeness * 100} label="Completeness" size="sm" />
                  <div className="flex items-center gap-4 text-[11px] text-on-surface-variant mt-0.5">
                    <span className="text-fluent-success">+{wp.linesAdded} lines</span>
                    <span className="text-fluent-danger-text">−{wp.linesRemoved} lines</span>
                    <span>{wp.filesCount} files</span>
                  </div>
                </div>

                {/* Queued / Paused Reasons */}
                {(wp.queuedReasons.length > 0 || wp.pausedReasons.length > 0) && (
                  <div className="p-3 rounded-lg border border-fluent-warning/30 bg-fluent-warning-subtle text-[12px] flex flex-col gap-1">
                    <div className="font-semibold text-fluent-warning flex items-center gap-1">
                      <Icon name="info" size={16} />
                      <span>Attention Details</span>
                    </div>
                    {wp.queuedReasons.length > 0 && (
                      <p>Queued reasons: <strong className="font-mono">{wp.queuedReasons.join(', ')}</strong></p>
                    )}
                    {wp.pausedReasons.length > 0 && (
                      <p>
                        Paused reasons: <strong className="font-mono">{wp.pausedReasons.join(', ')}</strong>
                        {wp.pausedBy && ` by ${wp.pausedBy}`}
                        {wp.pausedAt && ` (${relativeTime(wp.pausedAt, now)})`}
                      </p>
                    )}
                  </div>
                )}

                {/* Target Files */}
                <div className="flex flex-col gap-2">
                  <span className="font-semibold text-on-surface">Target Files ({wp.targetFiles.length})</span>
                  <div className="rounded border border-fluent-border bg-surface-sunken p-2.5 font-mono text-[12px] max-h-40 overflow-y-auto flex flex-col gap-1">
                    {wp.targetFiles.length === 0 ? (
                      <span className="text-on-surface-variant italic">No target files specified.</span>
                    ) : (
                      wp.targetFiles.map((file) => (
                        <div key={file} className="flex items-center justify-between">
                          <span className="text-on-surface">{file}</span>
                          {wp.humanLockedFiles.includes(file) && (
                            <Badge tone="warning">Locked by human</Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Hold for review Toggle */}
                <div className="pt-3 border-t border-fluent-border">
                  <Toggle
                    label="Hold for review"
                    description="Require Maintainer review before merging, overriding automated promotion policies"
                    checked={wp.autonomyOverride === 'require-review'}
                    onChange={(checked) =>
                      holdForReviewMutation.mutate({
                        workpack: { id: wp.id, version: wp.version },
                        hold: checked,
                      })
                    }
                    disabled={!holdCan.allowed || holdForReviewMutation.isPending}
                    disabledReason={!holdCan.allowed ? holdCan.reason : undefined}
                  />
                </div>
              </div>
            </TabPanel>

            {/* TAB 2: RUNS */}
            <TabPanel group="task-drawer" id="runs" value={tab}>
              <div className="flex flex-col gap-3 pt-2 text-[13px]">
                {runsQuery.isLoading ? (
                  <Spinner />
                ) : (runsQuery.data ?? []).length === 0 ? (
                  <p className="text-on-surface-variant italic">No synthesis or verification runs yet.</p>
                ) : (
                  (runsQuery.data ?? []).map((run) => (
                    <div
                      key={run.id}
                      className="p-3 rounded-lg border border-fluent-border bg-surface-card flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-brand">{run.id}</span>
                          <Badge tone={STATUS_TONES[run.status] ?? 'neutral'}>{run.status}</Badge>
                          <span className="text-[12px] text-on-surface-variant">Attempt {run.attempt}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[12px] text-on-surface-variant">
                          <span>Stage {run.stage}</span>
                          <span>Agent v{run.agentConfigVersion}</span>
                          <span>{tokens(run.tokens)} tokens</span>
                          <span>{usd(run.costUsdMicros)}</span>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => go(`workspace/${wp.id}/${run.id}`)}
                      >
                        View workspace
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </TabPanel>

            {/* TAB 3: CONTRACTS */}
            <TabPanel group="task-drawer" id="contracts" value={tab}>
              <div className="flex flex-col gap-3 pt-2 text-[13px]">
                {contractsQuery.isLoading ? (
                  <Spinner />
                ) : (contractsQuery.data ?? []).length === 0 ? (
                  <p className="text-on-surface-variant italic">No contracts attached.</p>
                ) : (
                  (contractsQuery.data ?? []).map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-lg border border-fluent-border bg-surface-card flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-on-surface truncate">{c.path}</span>
                          <Badge tone={c.locked ? 'info' : 'warning'}>
                            {c.locked ? 'Locked' : 'Unlocked'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[12px] text-on-surface-variant flex items-center gap-2">
                          <span>Type: {c.kind}</span>
                          <span>Hash: {c.hash.slice(0, 10)}</span>
                        </div>
                        {!c.locked && c.unlockedBy && (
                          <div className="mt-1 text-[11px] text-fluent-warning">
                            Unlocked by {c.unlockedBy} ({c.unlockReason})
                          </div>
                        )}
                      </div>
                      {c.locked && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setUnlockContract(c)}
                          disabled={!unlockCan.allowed}
                          title={unlockCan.reason}
                        >
                          Unlock
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabPanel>

            {/* TAB 4: GATES */}
            <TabPanel group="task-drawer" id="gates" value={tab}>
              <div className="flex flex-col gap-3 pt-2 text-[13px]">
                {gatesQuery.isLoading ? (
                  <Spinner />
                ) : !gatesQuery.data ? (
                  <p className="text-on-surface-variant italic">No gate outcomes recorded yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-fluent-border bg-surface-sunken">
                      <div>
                        <span className="text-sm font-semibold text-on-surface">Quality Gates</span>
                        <p className="text-[12px] text-on-surface-variant">
                          {gatesQuery.data.results.filter((r) => r.status === 'passed').length} passed / {gatesQuery.data.results.length} total
                        </p>
                      </div>
                      <Button variant="primary" size="sm" onClick={() => go(`quality/${wp.id}`)}>
                        Full Quality View
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {gatesQuery.data.results.map((gate) => (
                        <div key={gate.id} className="p-2.5 rounded border border-fluent-border bg-surface-card flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <StatusDot tone={gate.status === 'passed' ? 'success' : gate.status === 'failed' ? 'danger' : 'neutral'} />
                              <span className="font-medium text-on-surface">{gate.gate}</span>
                            </div>
                            <span className="text-[11px] text-on-surface-variant">{gate.severity}</span>
                          </div>
                          <Badge tone={gate.status === 'passed' ? 'success' : gate.status === 'failed' ? 'danger' : 'neutral'}>
                            {gate.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabPanel>

            {/* TAB 5: TIMELINE */}
            <TabPanel group="task-drawer" id="timeline" value={tab}>
              <div className="flex flex-col gap-3 pt-2 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-on-surface">Workpack Audit Trail</span>
                  <Button variant="ghost" size="sm" onClick={() => go('audit')}>
                    Open in Audit Log
                  </Button>
                </div>
                {auditQuery.isLoading ? (
                  <Spinner />
                ) : (auditQuery.data?.items ?? []).length === 0 ? (
                  <p className="text-on-surface-variant italic">No timeline entries.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(auditQuery.data?.items ?? []).map((entry) => (
                      <div key={entry.id} className="p-2.5 rounded border border-fluent-border bg-surface-card flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] font-semibold text-on-surface">{entry.action}</span>
                            <span className="text-[11px] text-on-surface-variant">by {entry.actorName}</span>
                          </div>
                          <span className="text-[11px] text-on-surface-variant font-mono">Hash: {entry.hash.slice(0, 12)}</span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant">{relativeTime(entry.createdAt, now)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabPanel>

            {/* TAB 6: COST */}
            <TabPanel group="task-drawer" id="cost" value={tab}>
              <div className="flex flex-col gap-4 pt-2 text-[13px]">
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-fluent-border bg-surface-sunken">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-on-surface-variant block">Total Spend</span>
                    <span className="text-lg font-bold text-on-surface">{usd(wp.costUsdMicros)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-on-surface-variant block">Total Tokens</span>
                    <span className="text-lg font-bold text-on-surface">{tokens(wp.tokensConsumed)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-on-surface">Spend by Run</span>
                  {(runsQuery.data ?? []).map((run) => (
                    <div key={run.id} className="p-2.5 rounded border border-fluent-border bg-surface-card flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold text-brand">{run.id}</span>
                        <span className="text-[12px] text-on-surface-variant ml-2">Stage {run.stage} · Attempt {run.attempt}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-on-surface">{usd(run.costUsdMicros)}</span>
                        <span className="text-[11px] text-on-surface-variant block">{tokens(run.tokens)} tok</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabPanel>
          </div>
        )}
      </Drawer>

      <CancelWorkpackDialog
        open={cancelOpen}
        workpack={wp ? (wp as unknown as Workpack) : null}
        onClose={() => setCancelOpen(false)}
      />

      <RequestChangesDialog
        open={requestChangesOpen}
        workpack={wp ? (wp as unknown as Workpack) : null}
        onClose={() => setRequestChangesOpen(false)}
      />

      <UnlockContractDialog
        open={Boolean(unlockContract)}
        contract={unlockContract}
        workpackId={wpId ?? ''}
        onClose={() => setUnlockContract(null)}
      />
    </>
  );
}
