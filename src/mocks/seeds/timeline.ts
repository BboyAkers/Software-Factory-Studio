import type { ProjectState, ScheduledTask } from '../backend/store';

interface Step {
  at: number;
  seq: number;
  run: () => void;
}

/**
 * Replays seeded history in strict time order. Each step, and every scheduled task that falls due
 * between steps, runs with the virtual clock pinned to its own instant, so audit entries, events,
 * runs and timestamps all come out in the order they would have happened. Tasks due after `endMs`
 * stay scheduled for the live simulator.
 */
export class Timeline {
  private readonly ps: ProjectState;
  private readonly endMs: number;
  private readonly steps: Step[] = [];
  private seq = 0;

  constructor(ps: ProjectState, endMs: number) {
    this.ps = ps;
    this.endMs = endMs;
  }

  at(atMs: number, run: () => void): void {
    this.steps.push({ at: Math.min(atMs, this.endMs), seq: this.seq++, run });
  }

  run(): void {
    const { store, timers } = { store: this.ps.store, timers: () => this.ps.timers };
    const previous = store.clock.fixedMs;
    const steps = [...this.steps].sort((a, b) => a.at - b.at || a.seq - b.seq);
    let next = 0;
    for (;;) {
      const step = steps[next];
      const task = earliest(timers());
      const stepAt = step ? step.at : Number.POSITIVE_INFINITY;
      const taskAt = task ? task.dueMs : Number.POSITIVE_INFINITY;
      const taskFirst = task !== undefined && taskAt <= stepAt && taskAt <= this.endMs;
      if (!taskFirst && !step) break;
      if (taskFirst) {
        store.clock.fixedMs = taskAt;
        this.ps.timers = this.ps.timers.filter((t) => t !== task);
        task.run();
      } else {
        store.clock.fixedMs = stepAt;
        step!.run();
        next += 1;
      }
    }
    store.clock.fixedMs = previous;
  }
}

function earliest(tasks: ScheduledTask[]): ScheduledTask | undefined {
  let best: ScheduledTask | undefined;
  for (const t of tasks) if (!best || t.dueMs < best.dueMs) best = t;
  return best;
}
