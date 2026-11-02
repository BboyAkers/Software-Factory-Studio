import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal, legalTransitions, manualActions, manualTargets } from './workpackMachine';
import type { WorkpackStatus } from '../contracts';

const wp = (over: Partial<Parameters<typeof manualActions>[0]> = {}): Parameters<typeof manualActions>[0] => ({
  status: 'in-progress',
  commitSha: 'abc1234',
  mergedAt: null,
  archived: false,
  pausedReasons: [],
  ...over,
});

const actionOf = (actions: ReturnType<typeof manualActions>, name: string) => actions.find((a) => a.action === name);

describe('workpack state machine (spec §5.1)', () => {
  it('lets the orchestrator advance queued → planning and rejects skipping ahead', () => {
    expect(canTransition('queued', 'planning', 'orchestrator')).toEqual({ ok: true });
    const skip = canTransition('queued', 'done', 'orchestrator');
    expect(skip.ok).toBe(false);
    if (!skip.ok) expect(skip.code).toBe('illegal_transition');
  });

  it('allows the verification retry loop and every verification exit', () => {
    for (const to of ['in-progress', 'awaiting-review', 'done', 'failed', 'cancelled'] as WorkpackStatus[]) {
      expect(canTransition('verification', to, 'orchestrator').ok).toBe(true);
    }
  });

  it('never leaves a terminal status, for anyone', () => {
    for (const from of ['done', 'failed', 'cancelled'] as WorkpackStatus[]) {
      expect(isTerminal(from)).toBe(true);
      expect(legalTransitions(from)).toEqual([]);
      expect(canTransition(from, 'in-progress', 'orchestrator').ok).toBe(false);
      expect(canTransition(from, 'in-progress', 'admin').ok).toBe(false);
    }
  });

  it('lets an engineer cancel from every pre-merge status but a viewer is forbidden', () => {
    for (const from of ['queued', 'planning', 'in-progress', 'verification', 'awaiting-review'] as WorkpackStatus[]) {
      expect(canTransition(from, 'cancelled', 'engineer')).toEqual({ ok: true });
    }
    const denied = canTransition('queued', 'cancelled', 'viewer');
    expect(denied).toMatchObject({ ok: false, code: 'forbidden', requiredRole: 'engineer' });
  });

  it('lets an engineer request changes but only a maintainer approve and merge', () => {
    expect(canTransition('awaiting-review', 'in-progress', 'engineer')).toEqual({ ok: true });
    expect(canTransition('awaiting-review', 'in-progress', 'viewer')).toMatchObject({ ok: false, code: 'forbidden' });
    expect(canTransition('awaiting-review', 'done', 'engineer')).toMatchObject({
      ok: false,
      code: 'forbidden',
      requiredRole: 'maintainer',
    });
    expect(canTransition('awaiting-review', 'done', 'maintainer')).toEqual({ ok: true });
  });

  it('rejects an illegal manual move and lists the targets the role may use', () => {
    const r = canTransition('queued', 'in-progress', 'engineer');
    expect(r).toMatchObject({ ok: false, code: 'illegal_transition' });
    if (!r.ok && r.code === 'illegal_transition') expect(r.allowed).toEqual(['cancelled']);
    expect(manualTargets('awaiting-review', 'engineer').sort()).toEqual(['cancelled', 'in-progress']);
    expect(manualTargets('awaiting-review', 'maintainer').sort()).toEqual(['cancelled', 'done', 'in-progress']);
  });

  it('does not let humans push a workpack into verification, planning or failed', () => {
    for (const to of ['planning', 'verification', 'failed'] as WorkpackStatus[]) {
      expect(canTransition('in-progress', to, 'admin').ok).toBe(false);
    }
  });
});

describe('manual actions available on a workpack', () => {
  it('disables cancel for a viewer and names the role needed', () => {
    const cancel = actionOf(manualActions(wp(), 'viewer'), 'cancel');
    expect(cancel).toMatchObject({ enabled: false, requiredRole: 'engineer', reason: 'Requires Engineer' });
  });

  it('offers pause when running and resume only when a manual workpack pause is in force', () => {
    const running = manualActions(wp(), 'engineer');
    expect(actionOf(running, 'pause')?.enabled).toBe(true);
    expect(actionOf(running, 'resume')?.enabled).toBe(false);

    const manual = manualActions(wp({ pausedReasons: ['manual-workpack'] }), 'engineer');
    expect(actionOf(manual, 'pause')?.enabled).toBe(false);
    expect(actionOf(manual, 'resume')?.enabled).toBe(true);
  });

  it('explains that a global or budget pause is not cleared by a per-workpack resume', () => {
    const budget = manualActions(wp({ pausedReasons: ['budget-hard-cap'] }), 'admin');
    const resume = actionOf(budget, 'resume');
    expect(resume?.enabled).toBe(false);
    expect(resume?.reason).toMatch(/budget/i);
  });

  it('offers archive only for ended, unarchived failed or cancelled workpacks', () => {
    expect(actionOf(manualActions(wp({ status: 'failed' }), 'engineer'), 'archive')?.enabled).toBe(true);
    expect(actionOf(manualActions(wp({ status: 'failed', archived: true }), 'engineer'), 'archive')).toBeUndefined();
    expect(actionOf(manualActions(wp({ status: 'in-progress' }), 'engineer'), 'archive')).toBeUndefined();
  });

  it('offers promote and request-changes only while awaiting review', () => {
    const review = manualActions(wp({ status: 'awaiting-review' }), 'maintainer');
    expect(actionOf(review, 'promote')?.enabled).toBe(true);
    expect(actionOf(review, 'requestChanges')?.enabled).toBe(true);
    const engineer = manualActions(wp({ status: 'awaiting-review' }), 'engineer');
    expect(actionOf(engineer, 'promote')).toMatchObject({ enabled: false, requiredRole: 'maintainer' });
    expect(actionOf(manualActions(wp(), 'maintainer'), 'promote')).toBeUndefined();
  });

  it('allows fork only once a commit exists and rollback only for merged done workpacks', () => {
    // Not applicable before any commit exists, so it is omitted rather than shown disabled.
    expect(actionOf(manualActions(wp({ commitSha: null, status: 'queued' }), 'maintainer'), 'fork')).toBeUndefined();
    // A failed workpack that never committed still shows Fork (its retry path), disabled with a reason.
    const noCommit = actionOf(manualActions(wp({ commitSha: null, status: 'failed' }), 'maintainer'), 'fork');
    expect(noCommit).toMatchObject({ enabled: false });
    expect(noCommit?.reason).toMatch(/no commit/i);
    expect(actionOf(manualActions(wp({ status: 'failed' }), 'maintainer'), 'fork')?.enabled).toBe(true);
    expect(actionOf(manualActions(wp({ status: 'done', mergedAt: '2026-11-01T00:00:00Z' }), 'maintainer'), 'rollback')?.enabled).toBe(true);
    expect(actionOf(manualActions(wp({ status: 'done', mergedAt: null }), 'maintainer'), 'rollback')).toBeUndefined();
  });
});
