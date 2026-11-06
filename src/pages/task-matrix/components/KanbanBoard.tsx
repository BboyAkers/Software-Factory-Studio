import React, { useState } from 'react';
import type { Workpack, WorkpackStatus } from '../../../contracts';
import { useNow } from '../../../app/useNow';
import { useGo } from '../../../app/nav';
import { useCan } from '../../../app/session';
import { duration } from '../../../domain/format';
import { CANCELLABLE_STATUSES } from '../../../domain/workpackMachine';
import {
  useArchiveWorkpack,
  useForkWorkpack,
  usePromoteWorkpack,
} from '../../../api/mutations';
import {
  Badge,
  Button,
  Icon,
} from '../../../components/ui';
import { WorkpackCard } from './WorkpackCard';

export interface KanbanBoardProps {
  workpacks: Workpack[];
  onSelectWorkpack: (id: string) => void;
  onRequestChanges: (wp: Workpack) => void;
  onCancelWorkpack: (wp: Workpack) => void;
}

interface ColumnDef {
  id: string;
  title: string;
  status: WorkpackStatus;
  tone: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'queued', title: 'Queued', status: 'queued', tone: 'text-on-surface-variant' },
  { id: 'planning', title: 'Spec & Planning', status: 'planning', tone: 'text-fluent-purple-text' },
  { id: 'in-progress', title: 'In Progress', status: 'in-progress', tone: 'text-fluent-blue-light' },
  { id: 'verification', title: 'Verification', status: 'verification', tone: 'text-fluent-warning' },
  { id: 'awaiting-review', title: 'Awaiting Review', status: 'awaiting-review', tone: 'text-fluent-purple-text' },
  { id: 'done', title: 'Done · 24h', status: 'done', tone: 'text-fluent-success' },
];

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function KanbanBoard({
  workpacks,
  onSelectWorkpack,
  onRequestChanges,
  onCancelWorkpack,
}: KanbanBoardProps) {
  const now = useNow();
  const go = useGo();

  const archiveMutation = useArchiveWorkpack();
  const forkMutation = useForkWorkpack();
  const promoteMutation = usePromoteWorkpack();

  const archiveCan = useCan('workpack.archive');
  const forkCan = useCan('workpack.fork');
  const promoteCan = useCan('workpack.promote');

  const [draggedItem, setDraggedItem] = useState<{ id: string; status: WorkpackStatus; version: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // Filter columns
  const getWorkpacksForColumn = (status: WorkpackStatus) => {
    if (status === 'done') {
      return workpacks.filter((w) => {
        if (w.status !== 'done' || w.archived) return false;
        const time = Date.parse(w.completedAt ?? w.endedAt ?? w.createdAt);
        return now - time <= TWENTY_FOUR_HOURS_MS;
      });
    }
    return workpacks.filter((w) => w.status === status && !w.archived);
  };

  // Recently ended items: failed or cancelled, not yet archived
  const recentlyEnded = workpacks.filter(
    (w) => (w.status === 'failed' || w.status === 'cancelled') && !w.archived
  );

  // Check legality of moving draggedItem to targetColumn
  const isMoveLegal = (target: string): boolean => {
    if (!draggedItem) return false;
    if (target === 'in-progress' && draggedItem.status === 'awaiting-review') return true;
    if (target === 'done' && draggedItem.status === 'awaiting-review') return true;
    if (target === 'recently-ended' && CANCELLABLE_STATUSES.includes(draggedItem.status)) return true;
    return false;
  };

  const handleDragOver = (e: React.DragEvent, target: string) => {
    e.preventDefault();
    if (isMoveLegal(target)) {
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
    setDragOverTarget(target);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = (e: React.DragEvent, target: string) => {
    e.preventDefault();
    setDragOverTarget(null);

    let data = draggedItem;
    if (!data) {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) data = JSON.parse(raw);
      } catch {
        // ignore invalid json
      }
    }

    if (!data) return;

    const sourceWp = workpacks.find((w) => w.id === data!.id);
    if (!sourceWp) return;

    if (target === 'in-progress' && data.status === 'awaiting-review') {
      onRequestChanges(sourceWp);
    } else if (target === 'done' && data.status === 'awaiting-review') {
      if (promoteCan.allowed) {
        promoteMutation.mutate({ id: sourceWp.id, version: sourceWp.version });
      }
    } else if (target === 'recently-ended' && CANCELLABLE_STATUSES.includes(data.status)) {
      onCancelWorkpack(sourceWp);
    }

    setDraggedItem(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 6 Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 min-h-[520px] items-start">
        {COLUMNS.map((col) => {
          const colWorkpacks = getWorkpacksForColumn(col.status);
          const isOver = dragOverTarget === col.id;
          const isLegal = isMoveLegal(col.id);

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex flex-col rounded-xl border bg-surface-sunken/60 p-3 transition-colors min-h-[460px] ${
                isOver
                  ? isLegal
                    ? 'border-brand ring-2 ring-brand/30 bg-brand/5'
                    : 'border-fluent-danger-text ring-2 ring-fluent-danger-text/30 bg-fluent-error-subtle cursor-not-allowed'
                  : 'border-fluent-border'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-fluent-border">
                <div className="flex items-center gap-2">
                  <h3 className={`text-[13px] font-semibold tracking-wide ${col.tone}`}>{col.title}</h3>
                </div>
                <Badge tone="neutral">{colWorkpacks.length}</Badge>
              </div>

              {/* Cards Container */}
              <div className="flex flex-col gap-2.5 flex-1">
                {colWorkpacks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-10 px-2 text-center text-[12px] text-on-surface-variant/70 border border-dashed border-fluent-border/60 rounded-lg">
                    <span>No workpacks</span>
                  </div>
                ) : (
                  colWorkpacks.map((wp) => (
                    <WorkpackCard
                      key={wp.id}
                      workpack={wp}
                      onSelect={onSelectWorkpack}
                      onRequestChanges={onRequestChanges}
                      onCancel={onCancelWorkpack}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recently Ended Tray */}
      <div
        onDragOver={(e) => handleDragOver(e, 'recently-ended')}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 'recently-ended')}
        className={`rounded-xl border p-4 transition-colors ${
          dragOverTarget === 'recently-ended'
            ? isMoveLegal('recently-ended')
              ? 'border-fluent-danger-text ring-2 ring-fluent-danger-text/30 bg-fluent-error-subtle'
              : 'border-fluent-border bg-surface-card'
            : 'border-fluent-border bg-surface-card'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="history" size={18} className="text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">Recently ended</h3>
            <span className="text-[12px] text-on-surface-variant">
              Failed or cancelled workpacks stay here 5 minutes before automatic archival
            </span>
          </div>
          <Badge tone="neutral">{recentlyEnded.length}</Badge>
        </div>

        {recentlyEnded.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-on-surface-variant italic border border-dashed border-fluent-border/60 rounded-lg">
            No recently ended workpacks. Drag any active card here to cancel it.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentlyEnded.map((wp) => {
              const endedTime = Date.parse(wp.endedAt ?? wp.createdAt);
              const expiresAt = endedTime + FIVE_MINUTES_MS;
              const remainingSec = Math.max(0, Math.round((expiresAt - now) / 1000));

              return (
                <div
                  key={wp.id}
                  className="flex flex-col justify-between p-3.5 rounded-lg border border-fluent-border bg-surface-sunken"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[12px] font-bold text-brand">{wp.id}</span>
                        <Badge tone={wp.status === 'failed' ? 'danger' : 'neutral'}>
                          {wp.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-fluent-warning font-mono">
                        <Icon name="timer" size={14} />
                        <span>{duration(remainingSec)}</span>
                      </div>
                    </div>

                    <h4 className="mt-2 text-[13px] font-medium text-on-surface line-clamp-1">
                      {wp.title}
                    </h4>

                    {wp.failureReason && (
                      <p className="mt-1 text-[12px] text-fluent-danger-text line-clamp-2">
                        {wp.failureReason}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-fluent-border flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => go(`quality/${wp.id}`)}
                    >
                      View repro
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => forkMutation.mutate({ id: wp.id, version: wp.version })}
                        loading={forkMutation.isPending}
                        disabled={!forkCan.allowed}
                        title={forkCan.reason}
                      >
                        Fork
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => archiveMutation.mutate({ id: wp.id, version: wp.version })}
                        loading={archiveMutation.isPending}
                        disabled={!archiveCan.allowed}
                        title={archiveCan.reason}
                      >
                        Archive now
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
