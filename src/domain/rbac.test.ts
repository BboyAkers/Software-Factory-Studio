import { describe, expect, it } from 'vitest';
import { CAPABILITIES, can, capabilitiesFor, requiredRole, type Capability } from './rbac';
import { ROLES } from '../contracts';

describe('RBAC capability matrix (spec Appendix G)', () => {
  it('lets a viewer suggest steering but not inject it', () => {
    expect(can('viewer', 'steering.suggest')).toBe(true);
    expect(can('viewer', 'steering.inject')).toBe(false);
  });

  it('keeps veto above inject: an engineer can inject but only a maintainer can veto', () => {
    expect(can('engineer', 'steering.inject')).toBe(true);
    expect(can('engineer', 'steering.veto')).toBe(false);
    expect(can('maintainer', 'steering.veto')).toBe(true);
  });

  it('reserves promote and global pause for maintainers, budget and policy for admins', () => {
    expect(requiredRole('workpack.promote')).toBe('maintainer');
    expect(requiredRole('pipeline.pause')).toBe('maintainer');
    expect(requiredRole('budget.update')).toBe('admin');
    expect(requiredRole('policy.update')).toBe('admin');
    expect(can('maintainer', 'budget.update')).toBe(false);
  });

  it('grants every capability to an admin and a growing set to each higher role', () => {
    const counts = ROLES.map((r) => capabilitiesFor(r).length);
    expect(counts[3]).toBe(Object.keys(CAPABILITIES).length);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThan(counts[i - 1]!);
    }
  });

  it('holds exactly the 33 capabilities named in the spec, so the matrix cannot drift silently', () => {
    const expected: Capability[] = [
      'steering.suggest', 'audit.verify',
      'epic.preview', 'epic.dispatch', 'epic.pause', 'workpack.create', 'workpack.cancel', 'workpack.requestChanges',
      'workpack.pause', 'workpack.archive', 'steering.inject', 'steering.approve', 'steering.reject', 'editor.write', 'terminal.exec',
      'steering.veto', 'workpack.fork', 'workpack.promote', 'workpack.rollback', 'workpack.holdForReview', 'contract.unlock',
      'agent.tune', 'agent.run', 'vault.manage', 'pipeline.pause', 'benchmark.run', 'audit.export',
      'budget.update', 'integration.manage', 'policy.update', 'token.rotate', 'slack.manage', 'project.connect',
    ];
    expect(Object.keys(CAPABILITIES).sort()).toEqual([...expected].sort());
    expect(expected).toHaveLength(33);
  });
});
