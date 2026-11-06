import { useMemo } from 'react';
import type { Workpack } from '../../../contracts';
import { useNow } from '../../../app/useNow';
import { PageHeader } from '../../../components/layout/Page';

export interface TaskMatrixHeaderProps {
  workpacks: Workpack[];
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function TaskMatrixHeader({ workpacks }: TaskMatrixHeaderProps) {
  const now = useNow();

  const metrics = useMemo(() => {
    let active = 0;
    let inExecution = 0;
    let awaitingReview = 0;
    let attention = 0;
    let done24h = 0;

    for (const wp of workpacks) {
      if (wp.archived) continue;

      if (['queued', 'planning', 'in-progress', 'verification', 'awaiting-review'].includes(wp.status)) {
        active++;
      }
      if (wp.status === 'in-progress' || wp.status === 'verification') {
        inExecution++;
      }
      if (wp.status === 'awaiting-review') {
        awaitingReview++;
      }
      if (wp.slaBreached || wp.paused || wp.blockedBy !== null) {
        attention++;
      }
      if (wp.status === 'done') {
        const time = Date.parse(wp.completedAt ?? wp.endedAt ?? wp.createdAt);
        if (now - time <= TWENTY_FOUR_HOURS_MS) {
          done24h++;
        }
      }
    }

    return { active, inExecution, awaitingReview, attention, done24h };
  }, [workpacks, now]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Task Matrix"
        description="Kanban board & task table tracking end-to-end workpack lifecycle, SLA health, and specialist assignments."
      />

      {/* Summary KPI Counters Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl border border-fluent-border bg-surface-card shadow-fluent-elevation-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-on-surface-variant block">
            Active
          </span>
          <span className="text-2xl font-bold text-on-surface mt-1 block">
            {metrics.active}
          </span>
        </div>

        <div className="p-3 rounded-xl border border-fluent-border bg-surface-card shadow-fluent-elevation-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-fluent-blue-light block">
            In Execution
          </span>
          <span className="text-2xl font-bold text-fluent-blue-light mt-1 block">
            {metrics.inExecution}
          </span>
        </div>

        <div className="p-3 rounded-xl border border-fluent-border bg-surface-card shadow-fluent-elevation-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-fluent-purple-text block">
            Awaiting Review
          </span>
          <span className="text-2xl font-bold text-fluent-purple-text mt-1 block">
            {metrics.awaitingReview}
          </span>
        </div>

        <div className="p-3 rounded-xl border border-fluent-border bg-surface-card shadow-fluent-elevation-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-fluent-warning block">
            Attention Needed
          </span>
          <span className="text-2xl font-bold text-fluent-warning mt-1 block">
            {metrics.attention}
          </span>
        </div>

        <div className="p-3 rounded-xl border border-fluent-border bg-surface-card shadow-fluent-elevation-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-fluent-success block">
            Done · 24h
          </span>
          <span className="text-2xl font-bold text-fluent-success mt-1 block">
            {metrics.done24h}
          </span>
        </div>
      </div>
    </div>
  );
}

