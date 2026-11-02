import type { LogLevel, Workpack } from '../../contracts';
import type { Rng } from './runtime';

/**
 * Words the simulated agents "say": reasoning step titles, log lines and tool calls that mention the
 * workpack's real files so the Live Workspace reads like a real session.
 */

const baseName = (path: string): string => path.split('/').pop() ?? path;

/** The agent's plan: read, plan, write each file (up to three), test, fix, summarize. */
export function reasoningPlan(wp: Pick<Workpack, 'targetFiles' | 'title'>): string[] {
  const files = wp.targetFiles.filter((f) => !f.includes('*'));
  const first = files[0] ?? 'the target files';
  return [
    `Read locked contracts and ${baseName(first)}`,
    `Plan the change set (${Math.max(1, files.length)} file${files.length === 1 ? '' : 's'})`,
    ...files.slice(0, 3).map((f) => `Write ${baseName(f)}`),
    'Run unit tests in the sandbox',
    'Fix failing assertions',
    'Summarize the diff for the PR',
  ];
}

export interface LogLine {
  level: LogLevel;
  tag: string;
  message: string;
}

const NARRATION = [
  'Implementing the retry path with exponential backoff…',
  'Checking the new types against the locked contract…',
  'Replacing the inline loop with the shared helper…',
  'Adding a guard for the empty-input case…',
  'Keeping the public exports unchanged…',
  'Updating the call sites to the new signature…',
  'Writing the assertion for the second acceptance criterion…',
  'Extracting the repeated lookup into a small function…',
];

export const narration = (rng: Rng): string => rng.pick(NARRATION);

/** Which kind of step a plan index is, from its title. */
function stepKind(title: string): 'read' | 'plan' | 'write' | 'test' | 'fix' | 'summary' {
  if (title.startsWith('Read')) return 'read';
  if (title.startsWith('Plan')) return 'plan';
  if (title.startsWith('Write')) return 'write';
  if (title.startsWith('Run')) return 'test';
  if (title.startsWith('Fix')) return 'fix';
  return 'summary';
}

export function logLinesFor(wp: Workpack, stepTitle: string, rng: Rng, sha: string | null): LogLine[] {
  const files = wp.targetFiles.filter((f) => !f.includes('*'));
  const file = files[rng.int(0, Math.max(0, files.length - 1))] ?? 'src/index.ts';
  switch (stepKind(stepTitle)) {
    case 'read':
      return [
        { level: 'info', tag: '[REPO]', message: `Read ${file} (${rng.int(40, 320)} lines)` },
        { level: 'agent', tag: '[CODECRAFT]', message: 'Locked contracts resolved. Types compile against them.' },
      ];
    case 'plan':
      return [{ level: 'agent', tag: '[CODECRAFT]', message: `Plan: change ${Math.max(1, files.length)} file${files.length === 1 ? '' : 's'}, add tests for each acceptance criterion.` }];
    case 'write':
      return [
        { level: 'info', tag: '[FS]', message: `Wrote ${file} (+${rng.int(12, 64)} −${rng.int(0, 9)})` },
        ...(sha ? [{ level: 'success' as const, tag: '[GIT]', message: `Committed ${sha.slice(0, 7)} on ${wp.branch}` }] : []),
      ];
    case 'test':
      return [{ level: 'success', tag: '[TEST]', message: `vitest: ${rng.int(14, 58)} passed in ${(rng.int(8, 40) / 10).toFixed(1)}s` }];
    case 'fix':
      return [
        { level: 'warn', tag: '[TEST]', message: `1 assertion failed in ${baseName(file).replace(/\.tsx?$/, '')}.test.ts, adjusting.` },
        { level: 'agent', tag: '[CODECRAFT]', message: `Fixing the expectation in ${baseName(file)}.` },
      ];
    case 'summary':
      return [{ level: 'agent', tag: '[CODECRAFT]', message: 'Prepared the diff summary and acceptance mapping for the PR.' }];
  }
}

export interface ToolCall {
  tool: string;
  ok: boolean;
  durationMs: number;
}

export function toolCallsFor(stepTitle: string, rng: Rng): ToolCall[] {
  const call = (tool: string, min: number, max: number, failChance = 0.03): ToolCall => ({ tool, ok: !rng.chance(failChance), durationMs: rng.int(min, max) });
  switch (stepKind(stepTitle)) {
    case 'read':
      return [call('repo.read', 20, 90), call('repo.search', 40, 160)];
    case 'plan':
      return [call('repo.search', 40, 140)];
    case 'write':
      return [call('fs.write', 8, 40), call('git.commit', 60, 180)];
    case 'test':
      return [call('sandbox.exec', 1800, 5200, 0.1)];
    case 'fix':
      return [call('fs.write', 8, 40), call('sandbox.exec', 1600, 4200)];
    case 'summary':
      return [call('docs.write', 30, 90)];
  }
}
