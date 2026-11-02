import type { Envelope } from '../contracts';
import { corruptAuditEntry } from './backend/audit';
import { fileSimulatedIssue, type IssueKind } from './backend/intakeSim';
import { advanceClock, nowIso, nowMs } from './backend/runtime';
import { tickStore } from './backend/simulator';
import type { ProjectState, ScenarioId, Store } from './backend/store';
import { DOGFOOD_PROJECT_ID, seedWorld } from './seeds';

export type SpeedOption = 1 | 4 | 16;

export interface MockState {
  scenario: ScenarioId;
  speed: SpeedOption;
  offline: boolean;
  /** How far the virtual clock is ahead of real time. */
  clockOffsetMs: number;
}

/** What the dev panel can do to the simulated backend (spec Appendix H). These never go through REST. */
export interface MockControl {
  readonly store: Store;
  state(): MockState;
  subscribe(listener: () => void): () => void;
  setScenario(id: ScenarioId): Promise<void>;
  reset(): Promise<void>;
  setSpeed(speed: SpeedOption): void;
  advanceClock(ms: number): void;
  simulateIssue(kind: IssueKind, projectId?: string): number | null;
  dropStreams(): void;
  setOffline(offline: boolean): void;
  corruptAudit(projectId?: string): string | null;
  triggerSla(projectId?: string): string | null;
}

interface Closable {
  close: (code?: number, reason?: string) => void;
}

export function createControl(store: Store, extras: { terminalClients?: () => Iterable<Closable> } = {}): MockControl {
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  const project = (id: string): ProjectState => store.projects.get(id) ?? store.projects.values().next().value!;

  const dropStreams = () => {
    // Closing a stream removes it from the set, so walk a copy.
    for (const client of Array.from(store.streams)) client.close();
    for (const socket of extras.terminalClients?.() ?? []) socket.close(1011, 'Dev panel dropped the connection');
  };

  const rebuild = async (scenario: ScenarioId) => {
    await seedWorld(store, scenario);
    // The world is new: project streams are told to refetch everything, and per-run streams (whose runs are gone) end.
    for (const client of Array.from(store.streams)) {
      if (client.runId !== null) {
        client.close();
        continue;
      }
      const ps = store.projects.get(client.projectId);
      if (!ps) continue;
      const resync: Envelope = { id: '0', ts: nowIso(store), projectId: ps.project.id, event: { type: 'stream.resync' } };
      client.send(resync);
    }
    for (const socket of extras.terminalClients?.() ?? []) socket.close(1012, 'The mock world was rebuilt');
    changed();
  };

  return {
    store,
    state: () => ({ scenario: store.sim.scenario, speed: store.sim.speed as SpeedOption, offline: store.net.offline, clockOffsetMs: store.clock.offsetMs }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScenario: (id) => rebuild(id),
    reset: () => rebuild(store.sim.scenario),
    setSpeed: (speed) => {
      store.sim.speed = speed;
      changed();
    },
    advanceClock: (ms) => {
      advanceClock(store, ms);
      tickStore(store);
      changed();
    },
    simulateIssue: (kind, projectId = DOGFOOD_PROJECT_ID) => fileSimulatedIssue(project(projectId), kind)?.number ?? null,
    dropStreams: () => {
      dropStreams();
      changed();
    },
    setOffline: (offline) => {
      store.net.offline = offline;
      if (offline) dropStreams();
      changed();
    },
    corruptAudit: (projectId = DOGFOOD_PROJECT_ID) => corruptAuditEntry(project(projectId)),
    triggerSla: (projectId = DOGFOOD_PROJECT_ID) => {
      const ps = project(projectId);
      const open = ps.workpacks.filter((w) => w.slaDueAt !== null && !w.slaBreached && w.status !== 'done' && w.status !== 'failed' && w.status !== 'cancelled');
      const target = open.find((w) => w.status === 'in-progress') ?? open[0];
      if (!target) return null;
      target.slaDueAt = new Date(nowMs(store) - 1_000).toISOString();
      tickStore(store);
      changed();
      return target.id;
    },
  };
}
