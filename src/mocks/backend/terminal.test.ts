import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from './store';
import { recordGateResults } from './gates';
import { flushAudit } from './runtime';
import { appendTerminal, handleInput, readyFrame, scrollback, subscribeTerminal } from './terminal';
import { writeProgress } from './files';
import { addWorkpack, createWorld, type World } from '../testing';

let w: World;
beforeEach(() => {
  w = createWorld();
});
afterEach(() => {
  w.close();
});

const person = (role: Actor['role'], name = 'Ada'): Actor => ({ id: `u-${name}`, name, role, type: 'user' });

function liveRun() {
  const wp = addWorkpack(w.ps, { status: 'in-progress', targetFiles: ['src/billing/stripe.ts', 'src/billing/stripe.test.ts'] });
  return { wp, run: wp.run! };
}
const text = (lines: { text: string }[]) => lines.map((l) => l.text).join('\n');

describe('the sandbox terminal (spec §7.3)', () => {
  it('lets only an engineer type, and tells everyone else what they need', () => {
    const { wp, run } = liveRun();
    expect(readyFrame(wp, run, 'viewer')).toMatchObject({ type: 'ready', canWrite: false, requiredRole: 'engineer', branch: wp.branch, runActive: true });
    expect(readyFrame(wp, run, 'engineer')).toMatchObject({ canWrite: true });

    const denied = handleInput(w.ps, wp, run, person('viewer'), 'vitest run');
    expect(denied.rejected).toMatchObject({ type: 'rejected', code: 'forbidden', requiredRole: 'engineer', message: 'Requires Engineer.' });
    expect(denied.output).toBeNull();
  });

  it('rejects shell syntax and unsafe paths with the rule that was broken, without running anything', () => {
    const { wp, run } = liveRun();
    const cases: [string, string][] = [
      ['vitest; rm -rf /', 'shell-operator'],
      ['cat src/a.ts | sh', 'shell-operator'],
      ['ls $(whoami)', 'shell-operator'],
      ['cat ../../etc/passwd', 'unsafe-path'],
      ['cat .env', 'unsafe-path'],
      ['npm install left-pad', 'not-allow-listed'],
      ['tsc --build', 'flag-not-allowed'],
    ];
    for (const [input, rule] of cases) {
      const res = handleInput(w.ps, wp, run, person('engineer'), input);
      expect(res.rejected, input).toMatchObject({ type: 'rejected', code: 'command_not_allowed', rule });
      expect(res.output, input).toBeNull();
    }
  });

  it('audits every accepted and rejected command as the person who typed it', async () => {
    const { wp, run } = liveRun();
    handleInput(w.ps, wp, run, person('engineer', 'Ada'), 'git status');
    handleInput(w.ps, wp, run, person('engineer', 'Ada'), 'git push');
    handleInput(w.ps, wp, run, person('viewer', 'Vera'), 'ls');
    await flushAudit(w.ps);
    const entries = w.ps.audit.filter((e) => e.action.startsWith('terminal.'));
    expect(entries.map((e) => [e.action, e.actorName, e.actorType, (e.target as { command: string }).command])).toEqual([
      ['terminal.exec', 'Ada', 'user', 'git status'],
      ['terminal.rejected', 'Ada', 'user', 'git push'],
      ['terminal.rejected', 'Vera', 'user', 'ls'],
    ]);
    expect(entries[1]!.target).toMatchObject({ reason: 'not-allow-listed', workpackId: wp.id, runId: run.id });
  });

  it('refuses input once the run has ended', () => {
    const wp = addWorkpack(w.ps, { status: 'awaiting-review' });
    const res = handleInput(w.ps, wp, wp.run!, person('engineer'), 'ls');
    expect(res.rejected).toMatchObject({ code: 'run_not_active' });
  });

  it('shows the workpack’s own files and diff, not canned text', () => {
    const { wp, run } = liveRun();
    const engineer = person('engineer');
    expect(text(handleInput(w.ps, wp, run, engineer, 'ls src/billing').output!.lines)).toBe('stripe.test.ts\nstripe.ts');
    expect(handleInput(w.ps, wp, run, engineer, 'ls src/nowhere').output).toMatchObject({ exitCode: 2 });

    writeProgress(w.ps, wp, 1, run.id, () => {});
    const stat = text(handleInput(w.ps, wp, run, engineer, 'git diff --stat').output!.lines);
    expect(stat).toMatch(/src\/billing\/stripe\.ts\s+\|\s+\d+ \++/);
    expect(stat).toMatch(/2 files changed, \d+ insertions\(\+\)/);
    expect(text(handleInput(w.ps, wp, run, engineer, 'git diff --name-only').output!.lines)).toBe('src/billing/stripe.test.ts\nsrc/billing/stripe.ts');
    expect(text(handleInput(w.ps, wp, run, engineer, 'git diff src/billing/stripe.ts').output!.lines)).toMatch(/^diff --git a\/src\/billing\/stripe\.ts b\//);
    expect(text(handleInput(w.ps, wp, run, engineer, 'cat src/billing/stripe.ts').output!.lines)).toContain('export function');
    expect(handleInput(w.ps, wp, run, engineer, 'cat src/missing.ts').output).toMatchObject({ exitCode: 1 });
    expect(text(handleInput(w.ps, wp, run, engineer, 'git status').output!.lines)).toContain(`On branch ${wp.branch}`);
    expect(text(handleInput(w.ps, wp, run, engineer, 'git log --oneline -n 2').output!.lines).split('\n')).toHaveLength(2);
  });

  it('reports test and type failures from the latest gate run with a non-zero exit code', () => {
    const { wp, run } = liveRun();
    const engineer = person('engineer');
    expect(handleInput(w.ps, wp, run, engineer, 'vitest run').output).toMatchObject({ exitCode: 0 });

    recordGateResults(w.ps, wp, run, { 'tests.unit_integration': 'failed', 'static.types_lint': 'failed' });
    const tests = handleInput(w.ps, wp, run, engineer, 'vitest run').output!;
    expect(tests.exitCode).toBe(1);
    expect(text(tests.lines)).toMatch(/FAIL .*test\.ts/);
    const types = handleInput(w.ps, wp, run, engineer, 'tsc --noEmit').output!;
    expect(types.exitCode).toBe(2);
    expect(text(types.lines)).toMatch(/error TS2322/);
  });

  it('prints the run log for the logs command', () => {
    const { wp, run } = liveRun();
    expect(text(handleInput(w.ps, wp, run, person('engineer'), 'logs --tail 5').output!.lines)).toBe('No log lines yet.');
  });
});

describe('scrollback and live lines', () => {
  it('keeps the last 200 lines and numbers them', () => {
    const { run } = liveRun();
    for (let i = 0; i < 230; i++) appendTerminal(w.ps, run.id, 'stdout', `line ${i}`);
    const lines = scrollback(w.ps, run.id);
    expect(lines).toHaveLength(200);
    expect(lines[0]!.text).toBe('line 30');
    expect(lines.at(-1)).toMatchObject({ text: 'line 229', id: 230 });
  });

  it('shows new lines to everyone attached until they leave', () => {
    const { run } = liveRun();
    const seen: string[] = [];
    const leave = subscribeTerminal(w.ps, run.id, (l) => seen.push(l.text));
    appendTerminal(w.ps, run.id, 'stdout', 'one');
    leave();
    appendTerminal(w.ps, run.id, 'stdout', 'two');
    expect(seen).toEqual(['one']);
  });
});
