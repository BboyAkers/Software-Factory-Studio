import { useMemo, useState } from 'react';
import type { Priority, Workpack } from '../../../contracts';
import { useNow } from '../../../app/useNow';
import { useCan } from '../../../app/session';
import { relativeTime, usd } from '../../../domain/format';
import { slaState } from '../../../domain/queue';
import { useForkWorkpack } from '../../../api/mutations';
import {
  Avatar,
  Badge,
  Button,
  StatusDot,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  type Tone,
} from '../../../components/ui';

export interface TaskTableViewProps {
  workpacks: Workpack[];
  isArchivedView?: boolean;
  onSelectWorkpack: (id: string) => void;
  onSelectEpic?: (epicId: string) => void;
}

type SortField = 'id' | 'title' | 'epic' | 'agent' | 'priority' | 'status' | 'sla' | 'cost';
type SortOrder = 'asc' | 'desc';

const PRIORITY_WEIGHT: Record<Priority, number> = {
  'P0 Blocker': 0,
  'P1 High': 1,
  'P2 Normal': 2,
};

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

export function TaskTableView({
  workpacks,
  isArchivedView = false,
  onSelectWorkpack,
  onSelectEpic,
}: TaskTableViewProps) {
  const now = useNow();
  const forkMutation = useForkWorkpack();
  const forkCan = useCan('workpack.fork');

  const [sortField, setSortField] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...workpacks].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'id':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'epic':
          cmp = a.epicId.localeCompare(b.epicId);
          break;
        case 'agent':
          cmp = (a.assignedAgentId ?? '').localeCompare(b.assignedAgentId ?? '');
          break;
        case 'priority':
          cmp = (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'sla': {
          const aTime = a.slaDueAt ? Date.parse(a.slaDueAt) : Infinity;
          const bTime = b.slaDueAt ? Date.parse(b.slaDueAt) : Infinity;
          cmp = aTime - bTime;
          break;
        }
        case 'cost':
          cmp = a.costUsdMicros - b.costUsdMicros;
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [workpacks, sortField, sortOrder]);

  return (
    <div className="rounded-xl border border-fluent-border bg-surface-card overflow-hidden">
      <Table label="Workpacks table">
        <THead>
          <Tr>
            <Th
              sort={sortField === 'id' ? sortOrder : null}
              onSort={() => handleSort('id')}
              className="w-28"
            >
              ID
            </Th>
            <Th
              sort={sortField === 'title' ? sortOrder : null}
              onSort={() => handleSort('title')}
            >
              Title
            </Th>
            <Th
              sort={sortField === 'epic' ? sortOrder : null}
              onSort={() => handleSort('epic')}
              className="w-32"
            >
              Epic
            </Th>
            <Th
              sort={sortField === 'agent' ? sortOrder : null}
              onSort={() => handleSort('agent')}
              className="w-36"
            >
              Agent
            </Th>
            <Th
              sort={sortField === 'priority' ? sortOrder : null}
              onSort={() => handleSort('priority')}
              className="w-28"
            >
              Priority
            </Th>
            <Th
              sort={sortField === 'status' ? sortOrder : null}
              onSort={() => handleSort('status')}
              className="w-32"
            >
              Status
            </Th>
            <Th
              sort={sortField === 'sla' ? sortOrder : null}
              onSort={() => handleSort('sla')}
              className="w-32"
            >
              SLA
            </Th>
            <Th className="w-36">Reason</Th>
            <Th className="w-20 text-center">Attempt</Th>
            <Th className="w-20">PR</Th>
            <Th
              sort={sortField === 'cost' ? sortOrder : null}
              onSort={() => handleSort('cost')}
              className="w-24 text-right"
            >
              Cost
            </Th>
            {isArchivedView && <Th className="w-24 text-right">Actions</Th>}
          </Tr>
        </THead>
        <TBody>
          {sorted.length === 0 ? (
            <Tr>
              <Td colSpan={isArchivedView ? 12 : 11} className="py-8 text-center text-on-surface-variant italic">
                {isArchivedView ? 'No archived workpacks found.' : 'No workpacks match the current filters.'}
              </Td>
            </Tr>
          ) : (
            sorted.map((wp) => {
              const slaInfo = slaState(wp, new Date(now));
              const priorityTone: Tone =
                wp.priority === 'P0 Blocker'
                  ? 'danger'
                  : wp.priority === 'P1 High'
                    ? 'warning'
                    : 'neutral';

              const reason =
                wp.failureReason ||
                (wp.paused && wp.pausedReasons.length > 0 ? wp.pausedReasons.join(', ') : null) ||
                (wp.status === 'queued' && wp.queuedReason ? wp.queuedReason : null);

              return (
                <Tr key={wp.id} onActivate={() => onSelectWorkpack(wp.id)}>
                  <Td className="font-mono font-bold text-brand">{wp.id}</Td>
                  <Td className="font-medium text-on-surface max-w-xs truncate">
                    {wp.title}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEpic?.(wp.epicId);
                      }}
                      className="font-mono text-[12px] text-brand hover:underline"
                    >
                      {wp.epicId}
                    </button>
                  </Td>
                  <Td>
                    {wp.assignedAgentId ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar initials={getInitials(wp.assignedAgentId)} size={18} title={wp.assignedAgentId} />
                        <span className="truncate">{wp.assignedAgentId}</span>
                      </div>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={priorityTone}>{wp.priority.split(' ')[0]}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <StatusDot tone={STATUS_TONES[wp.status] ?? 'neutral'} />
                      <span className="capitalize">{wp.status}</span>
                    </div>
                  </Td>
                  <Td>
                    {slaInfo.state === 'breached' ? (
                      <span className="text-fluent-danger-text font-medium">Overdue</span>
                    ) : slaInfo.remainingMs !== null ? (
                      <span className={slaInfo.state === 'due-soon' ? 'text-fluent-warning font-medium' : ''}>
                        {relativeTime(wp.slaDueAt, now)}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </Td>
                  <Td className="text-[12px] text-on-surface-variant max-w-[140px] truncate" title={reason ?? undefined}>
                    {reason ?? '—'}
                  </Td>
                  <Td className="text-center font-mono text-[12px]">
                    {wp.attempt}/{wp.maxAttempts}
                  </Td>
                  <Td className="font-mono text-[12px]">
                    {wp.prNumber ? (
                      <span className="text-brand">#{wp.prNumber}</span>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </Td>
                  <Td className="text-right font-mono font-medium">
                    {usd(wp.costUsdMicros)}
                  </Td>
                  {isArchivedView && (
                    <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => forkMutation.mutate({ id: wp.id, version: wp.version })}
                        loading={forkMutation.isPending}
                        disabled={!forkCan.allowed}
                        title={forkCan.reason}
                      >
                        Fork
                      </Button>
                    </Td>
                  )}
                </Tr>
              );
            })
          )}
        </TBody>
      </Table>
    </div>
  );
}
