import React from 'react';
import type { Workpack } from '../../../contracts';
import { useCan } from '../../../app/session';
import { useNow } from '../../../app/useNow';
import { useGo, href } from '../../../app/nav';
import { useProjectId } from '../../../api/queries';
import { toast } from '../../../app/toast';
import { relativeTime } from '../../../domain/format';
import { slaState } from '../../../domain/queue';
import { manualActions } from '../../../domain/workpackMachine';
import {
  usePauseWorkpack,
  useResumeWorkpack,
  useForkWorkpack,
  usePromoteWorkpack,
} from '../../../api/mutations';
import {
  Avatar,
  Badge,
  IconButton,
  Menu,
  ProgressBar,
  Tooltip,
  type MenuItem,
  type Tone,
} from '../../../components/ui';

export interface WorkpackCardProps {
  workpack: Workpack;
  onSelect: (id: string) => void;
  onRequestChanges: (wp: Workpack) => void;
  onCancel: (wp: Workpack) => void;
}

function getInitials(name: string): string {
  const parts = name.split(/[\s-_]+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function WorkpackCard({
  workpack: wp,
  onSelect,
  onRequestChanges,
  onCancel,
}: WorkpackCardProps) {
  const projectId = useProjectId();
  const go = useGo();
  const now = useNow();

  const pauseMutation = usePauseWorkpack();
  const resumeMutation = useResumeWorkpack();
  const forkMutation = useForkWorkpack();
  const promoteMutation = usePromoteWorkpack();

  const pauseCan = useCan('workpack.pause');
  const cancelCan = useCan('workpack.cancel');
  const requestChangesCan = useCan('workpack.requestChanges');
  const promoteCan = useCan('workpack.promote');
  const forkCan = useCan('workpack.fork');

  const slaInfo = slaState(wp, new Date(now));

  const actions = manualActions(
    {
      status: wp.status,
      commitSha: wp.commitSha,
      mergedAt: wp.mergedAt,
      archived: wp.archived,
      pausedReasons: wp.pausedReasons,
    },
    'maintainer'
  );

  const getAction = (name: string) => actions.find((a) => a.action === name);

  // Copy link
  const handleCopyLink = () => {
    const url = `${window.location.origin}${href(projectId, `matrix/${wp.id}`)}`;
    void navigator.clipboard.writeText(url).then(() => {
      toast.success(`Copied link to ${wp.id}`);
    });
  };

  // Build menu items
  const menuItems: MenuItem[] = [
    {
      id: 'open-workspace',
      label: 'Open workspace',
      icon: 'terminal',
      onSelect: () => go(`workspace/${wp.id}`),
    },
    {
      id: 'open-quality',
      label: 'Open quality',
      icon: 'verified_user',
      onSelect: () => go(`quality/${wp.id}`),
    },
    {
      id: 'copy-link',
      label: 'Copy link',
      icon: 'link',
      onSelect: handleCopyLink,
    },
  ];

  if (getAction('requestChanges')?.enabled) {
    menuItems.unshift({
      id: 'request-changes',
      label: 'Request changes',
      icon: 'rate_review',
      disabled: !requestChangesCan.allowed,
      reason: requestChangesCan.reason,
      onSelect: () => onRequestChanges(wp),
    });
  }

  if (getAction('promote')?.enabled) {
    menuItems.unshift({
      id: 'promote',
      label: 'Approve & merge',
      icon: 'check_circle',
      disabled: !promoteCan.allowed,
      reason: promoteCan.reason,
      onSelect: () => promoteMutation.mutate({ id: wp.id, version: wp.version }),
    });
  }

  if (getAction('pause')?.enabled) {
    menuItems.push({
      id: 'pause',
      label: 'Pause',
      icon: 'pause',
      separatorBefore: true,
      disabled: !pauseCan.allowed,
      reason: pauseCan.reason,
      onSelect: () => pauseMutation.mutate({ id: wp.id, version: wp.version }),
    });
  }

  if (getAction('resume')?.enabled) {
    menuItems.push({
      id: 'resume',
      label: 'Resume',
      icon: 'play_arrow',
      separatorBefore: true,
      disabled: !pauseCan.allowed,
      reason: pauseCan.reason,
      onSelect: () => resumeMutation.mutate({ id: wp.id, version: wp.version }),
    });
  }

  if (getAction('fork')?.enabled) {
    menuItems.push({
      id: 'fork',
      label: 'Fork',
      icon: 'fork_right',
      disabled: !forkCan.allowed,
      reason: forkCan.reason,
      onSelect: () => forkMutation.mutate({ id: wp.id, version: wp.version }),
    });
  }

  if (getAction('cancel')?.enabled) {
    menuItems.push({
      id: 'cancel',
      label: 'Cancel workpack',
      icon: 'cancel',
      tone: 'danger',
      separatorBefore: true,
      disabled: !cancelCan.allowed,
      reason: cancelCan.reason,
      onSelect: () => onCancel(wp),
    });
  }

  const priorityTone: Tone =
    wp.priority === 'P0 Blocker'
      ? 'danger'
      : wp.priority === 'P1 High'
        ? 'warning'
        : 'neutral';

  const slaTone: Tone =
    slaInfo.state === 'breached'
      ? 'danger'
      : slaInfo.state === 'due-soon'
        ? 'warning'
        : 'neutral';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        id: wp.id,
        status: wp.status,
        version: wp.version,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!wp.archived}
      onDragStart={handleDragStart}
      onClick={() => onSelect(wp.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(wp.id);
        }
      }}
      className="group relative flex flex-col gap-2 rounded-lg border border-fluent-border bg-surface-card p-3 shadow-fluent-elevation-2 hover:border-fluent-border-high hover:shadow-fluent-elevation-8 transition-all cursor-pointer select-none text-left focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[12px] font-semibold text-brand truncate">{wp.id}</span>
          <Badge tone={priorityTone}>{wp.priority.split(' ')[0]}</Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {wp.assignedAgentId && (
            <Tooltip content={`Assigned agent: ${wp.assignedAgentId}`}>
              <div>
                <Avatar initials={getInitials(wp.assignedAgentId)} size={18} title={wp.assignedAgentId} />
              </div>
            </Tooltip>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Menu
              align="end"
              label={`Actions for ${wp.id}`}
              trigger={(props) => (
                <IconButton
                  {...props}
                  icon="more_horiz"
                  label="Card actions"
                  className="size-6 text-on-surface-variant hover:text-on-surface"
                />
              )}
              items={menuItems}
            />
          </div>
        </div>
      </div>

      {/* Title */}
      <h4 className="text-[13px] font-medium leading-snug text-on-surface line-clamp-2">
        {wp.title}
      </h4>

      {/* Progress bar during in-progress */}
      {wp.status === 'in-progress' && (
        <div className="flex flex-col gap-1 my-0.5">
          <ProgressBar value={wp.completeness * 100} label="Progress" size="sm" />
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>{Math.round(wp.completeness * 100)}%</span>
            <span>
              +{wp.linesAdded} −{wp.linesRemoved}
            </span>
          </div>
        </div>
      )}

      {/* Chips and status badges */}
      <div className="flex flex-wrap items-center gap-1 pt-1 text-[11px]">
        {/* SLA */}
        {slaInfo.state !== 'none' && (
          <Badge tone={slaTone}>
            {slaInfo.state === 'breached' ? 'Overdue' : `Due ${relativeTime(wp.slaDueAt, now)}`}
          </Badge>
        )}

        {/* Escalated */}
        {wp.slaBreached && <Badge tone="danger">ESCALATED</Badge>}

        {/* Paused */}
        {wp.paused && (
          <Tooltip content={`Paused: ${wp.pausedReasons.join(', ') || 'Manual'}`}>
            <div>
              <Badge tone="warning">Paused</Badge>
            </div>
          </Tooltip>
        )}

        {/* Blocked */}
        {wp.blockedBy && (
          <Tooltip content={`Blocked by workpack ${wp.blockedBy}`}>
            <div>
              <Badge tone="warning">Blocked</Badge>
            </div>
          </Tooltip>
        )}

        {/* Attempt count if > 1 */}
        {wp.attempt > 1 && (
          <Badge tone="neutral">
            Attempt {wp.attempt}/{wp.maxAttempts}
          </Badge>
        )}

        {/* Fork or Revert marker */}
        {wp.forkOf && (
          <Badge tone="neutral">Fork of {wp.forkOf}</Badge>
        )}
        {wp.revertOf && (
          <Badge tone="neutral">Revert of {wp.revertOf}</Badge>
        )}

        {/* PR number */}
        {wp.prNumber && (
          <span className="font-mono text-brand font-medium">#{wp.prNumber}</span>
        )}
      </div>
    </div>
  );
}
