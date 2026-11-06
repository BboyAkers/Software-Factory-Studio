import { describe, it, expect } from 'vitest';
import { canTransition } from '../../domain/workpackMachine';
import { globsOverlap } from '../../domain/queue';

describe('Task Matrix Transition Rules (§5.1)', () => {
  it('allows Engineer to request changes from awaiting-review to in-progress', () => {
    const res = canTransition('awaiting-review', 'in-progress', 'engineer');
    expect(res.ok).toBe(true);
  });

  it('forbids Viewer from requesting changes', () => {
    const res = canTransition('awaiting-review', 'in-progress', 'viewer');
    expect(res.ok).toBe(false);
  });

  it('allows Maintainer to promote from awaiting-review to done', () => {
    const res = canTransition('awaiting-review', 'done', 'maintainer');
    expect(res.ok).toBe(true);
  });

  it('forbids Engineer from promoting to done', () => {
    const res = canTransition('awaiting-review', 'done', 'engineer');
    expect(res.ok).toBe(false);
  });

  it('allows Engineer to cancel non-terminal workpacks', () => {
    const statuses = ['queued', 'planning', 'in-progress', 'verification', 'awaiting-review'] as const;
    for (const status of statuses) {
      const res = canTransition(status, 'cancelled', 'engineer');
      expect(res.ok).toBe(true);
    }
  });

  it('forbids dragging from in-progress to done directly', () => {
    const res = canTransition('in-progress', 'done', 'maintainer');
    expect(res.ok).toBe(false);
  });

  it('forbids dragging from queued to done directly', () => {
    const res = canTransition('queued', 'done', 'maintainer');
    expect(res.ok).toBe(false);
  });
});

describe('New Workpack Overlap Detection', () => {
  it('detects overlapping glob patterns', () => {
    expect(globsOverlap(['src/domain/**'], ['src/domain/queue.ts'])).toBe(true);
    expect(globsOverlap(['src/billing/tax.ts'], ['src/auth/jwt.ts'])).toBe(false);
  });
});

