import { describe, expect, it } from 'vitest';
import { MAX_COMMAND_LENGTH, checkCommand } from './terminalPolicy';

const ok = (cmd: string) => {
  const r = checkCommand(cmd);
  if (!r.ok) throw new Error(`expected "${cmd}" to be allowed: ${r.rule} — ${r.message}`);
  return r;
};
const rejected = (cmd: string) => {
  const r = checkCommand(cmd);
  if (r.ok) throw new Error(`expected "${cmd}" to be rejected`);
  expect(r.code).toBe('command_not_allowed');
  return r;
};

describe('terminal safe-command allow-list (spec §7.3)', () => {
  it.each([
    'vitest',
    'vitest run',
    'vitest run src/billing/stripe.test.ts',
    'vitest --coverage',
    'vitest run --reporter=dot',
    'git diff',
    'git diff --stat',
    'git diff --name-only src/auth/session.ts',
    'git status',
    'git log --oneline -n 20',
    'tsc --noEmit',
    'ls',
    'ls src/billing',
    'cat src/index.ts',
    'logs',
    'logs --tail 50',
  ])('allows "%s"', (cmd) => {
    expect(ok(cmd).ok).toBe(true);
  });

  it('normalizes whitespace and returns the argument vector', () => {
    const r = ok('  git   diff   --stat  ');
    expect(r.argv).toEqual(['git', 'diff', '--stat']);
    expect(r.normalized).toBe('git diff --stat');
  });

  it.each([
    ['vitest; rm -rf /', ';'],
    ['ls && cat secrets', '&'],
    ['cat src/a.ts | sh', '|'],
    ['ls > out.txt', '>'],
    ['cat < in.txt', '<'],
    ['ls `whoami`', '`'],
    ['cat $(whoami)', '$'],
    ['cat ${HOME}', '$'],
    ['ls\ncat x', 'newline'],
    ['vitest "a b"', '"'],
    ["vitest 'a'", "'"],
    ['cat a\\ b', '\\'],
  ])('rejects shell syntax in "%s"', (cmd) => {
    expect(rejected(cmd).rule).toBe('shell-operator');
  });

  it.each(['rm -rf /', 'npm install left-pad', 'curl http://example.com', 'git push', 'git commit -m x', 'git checkout main', 'node script.js', 'echo hi'])(
    'rejects "%s" because it is not on the allow-list',
    (cmd) => {
      expect(rejected(cmd).rule).toBe('not-allow-listed');
    },
  );

  it('only allows tsc with exactly --noEmit', () => {
    expect(rejected('tsc').rule).toBe('bad-argument');
    expect(rejected('tsc --build').rule).toBe('flag-not-allowed');
    expect(rejected('tsc --noEmit --watch').rule).toBe('flag-not-allowed');
  });

  it('refuses flags that could write: vitest -u, --update, --watch, --config', () => {
    for (const flag of ['-u', '--update', '--watch', '--config=x.ts']) {
      expect(rejected(`vitest ${flag}`).rule).toBe('flag-not-allowed');
    }
    expect(rejected('git diff --output=leak.txt').rule).toBe('flag-not-allowed');
  });

  it('bounds numeric arguments', () => {
    expect(rejected('git log -n 500').rule).toBe('bad-argument');
    expect(rejected('git log -n 0').rule).toBe('bad-argument');
    expect(rejected('logs --tail 0').rule).toBe('bad-argument');
    expect(rejected('logs --tail 600').rule).toBe('bad-argument');
    expect(ok('git log -n 200').ok).toBe(true);
    expect(ok('logs --tail 500').ok).toBe(true);
  });

  it('keeps paths inside the workspace', () => {
    for (const cmd of ['cat ../secret', 'cat /etc/passwd', 'ls ~', 'cat .git/config', 'ls src/../..', 'cat .env', 'cat config/.env.production']) {
      expect(rejected(cmd).rule).toBe('unsafe-path');
    }
  });

  it('requires the right number of path arguments', () => {
    expect(rejected('cat').rule).toBe('bad-argument');
    expect(rejected('cat a.ts b.ts').rule).toBe('bad-argument');
    expect(rejected('ls a b').rule).toBe('bad-argument');
  });

  it('rejects empty and over-long input', () => {
    expect(rejected('   ').rule).toBe('empty');
    expect(rejected(`cat ${'a'.repeat(MAX_COMMAND_LENGTH)}`).rule).toBe('too-long');
  });

  it('explains the rule that was broken', () => {
    expect(rejected('ls && whoami').message).toMatch(/&/);
    expect(rejected('git push').message).toMatch(/vitest.*git diff.*tsc/s);
  });
});
