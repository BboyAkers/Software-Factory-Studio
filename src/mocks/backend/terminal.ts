import type { Role, Run, TerminalLine, TerminalServerFrame, Workpack } from '../../contracts';
import { ROLE_LABEL, can } from '../../domain/rbac';
import { checkCommand } from '../../domain/terminalPolicy';
import { diffView, ensureFiles, toDiffLines } from './files';
import { latestGateResults } from './quality';
import { nowIso, recordAudit } from './runtime';
import { longHash } from './codegen';
import type { Actor, ProjectState } from './store';

const SCROLLBACK = 200;

type Listener = (line: TerminalLine) => void;
const listeners = new WeakMap<ProjectState, Map<string, Set<Listener>>>();

export function subscribeTerminal(ps: ProjectState, runId: string, listener: Listener): () => void {
  const byRun = listeners.get(ps) ?? new Map<string, Set<Listener>>();
  listeners.set(ps, byRun);
  const set = byRun.get(runId) ?? new Set<Listener>();
  byRun.set(runId, set);
  set.add(listener);
  return () => set.delete(listener);
}

/** Append a line to a run's terminal and show it to everyone attached. */
export function appendTerminal(ps: ProjectState, runId: string, stream: TerminalLine['stream'], text: string): TerminalLine {
  const buffer = ps.terminals.get(runId) ?? [];
  const line: TerminalLine = { id: (buffer.at(-1)?.id ?? 0) + 1, stream, text, at: nowIso(ps.store) };
  buffer.push(line);
  if (buffer.length > SCROLLBACK) buffer.splice(0, buffer.length - SCROLLBACK);
  ps.terminals.set(runId, buffer);
  for (const listener of listeners.get(ps)?.get(runId) ?? []) listener(line);
  return line;
}

export const scrollback = (ps: ProjectState, runId: string): TerminalLine[] => [...(ps.terminals.get(runId) ?? [])];

// ---------------------------------------------------------------------------
// Simulated commands
// ---------------------------------------------------------------------------

export interface CommandOutput {
  lines: { stream: 'stdout' | 'stderr'; text: string }[];
  exitCode: number;
}

const out = (text: string) => ({ stream: 'stdout' as const, text });
const err = (text: string) => ({ stream: 'stderr' as const, text });

const BASE_TREE = ['CHANGELOG.md', 'README.md', 'package.json', 'tsconfig.json', 'contracts/', 'docs/', 'src/', 'tests/'];

const PACKAGE_JSON = `{
  "name": "software-factory-studio",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "tsc -b && vite build", "test": "vitest run" }
}`;

const nonGlob = (files: readonly string[]): string[] => files.filter((f) => !f.includes('*'));

function knownPaths(ps: ProjectState, wp: Workpack): string[] {
  return [...new Set([...nonGlob(wp.targetFiles), ...(ps.files.get(wp.id) ?? []).map((f) => f.path)])];
}

function testFilesOf(wp: Workpack): string[] {
  const files = nonGlob(wp.targetFiles);
  const tests = files.filter((f) => /\.(test|spec)\./.test(f));
  const derived = files.filter((f) => !/\.(test|spec)\./.test(f)).map((f) => f.replace(/\.tsx?$/, '.test.ts'));
  return [...new Set([...tests, ...derived])].slice(0, 4);
}

function vitest(ps: ProjectState, wp: Workpack, args: string[]): CommandOutput {
  const filters = args.filter((a) => !a.startsWith('-') && a !== 'run');
  const files = testFilesOf(wp).filter((f) => filters.length === 0 || filters.some((x) => f.includes(x)));
  if (files.length === 0) return { lines: [out(' RUN  v5.0.5 /workspace'), err('No test files found, exiting with code 1')], exitCode: 1 };

  const unit = latestGateResults(ps, wp).find((g) => g.gate === 'tests.unit_integration');
  const failing = unit?.status === 'failed' ? unit.failures[0] : undefined;
  const counts = files.map((_, i) => 4 + ((longHash(`${wp.id}${i}`).charCodeAt(0) ?? 0) % 9));
  const lines: CommandOutput['lines'] = [out(' RUN  v5.0.5 /workspace'), out('')];
  files.forEach((f, i) => lines.push(out(` ${failing && i === 0 ? '✗' : '✓'} ${f} (${counts[i]} tests) ${6 + i * 5}ms`)));
  const total = counts.reduce((a, b) => a + b, 0);
  lines.push(out(''));
  if (failing) {
    lines.push(err(` FAIL  ${failing.file}`), err(failing.message), out(''));
    lines.push(out(` Test Files  1 failed | ${files.length - 1} passed (${files.length})`), out(`      Tests  1 failed | ${total - 1} passed (${total})`));
  } else {
    lines.push(out(` Test Files  ${files.length} passed (${files.length})`), out(`      Tests  ${total} passed (${total})`));
  }
  if (args.includes('--coverage')) {
    lines.push(out(''), out(' % Coverage report from v8'), out(`   changed lines   | ${failing ? 74 : 88}.2%`));
  }
  lines.push(out(`   Duration  ${(1.1 + files.length * 0.2).toFixed(2)}s`));
  return { lines, exitCode: failing ? 1 : 0 };
}

function gitDiff(ps: ProjectState, wp: Workpack, args: string[]): CommandOutput {
  const path = args.find((a) => !a.startsWith('-'));
  const view = diffView(ps, wp, null);
  // Like git, list files in path order.
  const files = view.files.filter((f) => (!path || f.path === path) && (f.additions > 0 || f.deletions > 0)).sort((a, b) => (a.path < b.path ? -1 : 1));
  if (args.includes('--name-only')) return { lines: files.map((f) => out(f.path)), exitCode: 0 };
  if (args.includes('--stat')) {
    const lines = files.map((f) => out(` ${f.path.padEnd(42)} | ${String(f.additions + f.deletions).padStart(3)} ${'+'.repeat(Math.min(12, f.additions))}${'-'.repeat(Math.min(6, f.deletions))}`));
    const added = files.reduce((n, f) => n + f.additions, 0);
    const removed = files.reduce((n, f) => n + f.deletions, 0);
    if (files.length > 0) lines.push(out(` ${files.length} file${files.length === 1 ? '' : 's'} changed, ${added} insertion${added === 1 ? '' : 's'}(+), ${removed} deletion${removed === 1 ? '' : 's'}(-)`));
    return { lines, exitCode: 0 };
  }
  const lines: CommandOutput['lines'] = [];
  for (const f of files) {
    const state = ensureFiles(ps, wp).find((x) => x.path === f.path)!;
    lines.push(out(`diff --git a/${f.path} b/${f.path}`), out(`--- a/${f.path}`), out(`+++ b/${f.path}`));
    for (const l of toDiffLines(state.original, state.modified)) lines.push(out(l.type === 'hunk' ? l.text : `${l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' '}${l.text}`));
  }
  return { lines, exitCode: 0 };
}

function gitStatus(ps: ProjectState, wp: Workpack): CommandOutput {
  const changed = diffView(ps, wp, null).files.filter((f) => f.additions > 0 || f.deletions > 0);
  const lines = [out(`On branch ${wp.branch}`)];
  if (changed.length === 0) lines.push(out('nothing to commit, working tree clean'));
  else lines.push(out('Changes not staged for commit:'), ...changed.map((f) => out(`\tmodified:   ${f.path}`)));
  return { lines, exitCode: 0 };
}

function gitLog(wp: Workpack, args: string[]): CommandOutput {
  const at = args.indexOf('-n');
  const n = at >= 0 ? Number(args[at + 1]) : 10;
  const head = wp.commitSha ?? longHash(wp.id).slice(0, 40);
  const subjects = [wp.title, 'test: cover the acceptance criteria', 'chore: scaffold the workpack branch', `contract: attach locked contracts to ${wp.id}`];
  const lines = subjects.slice(0, Math.max(1, Math.min(n, subjects.length))).map((s, i) => out(`${(i === 0 ? head : longHash(`${head}${i}`)).slice(0, 7)} ${s}`));
  return { lines, exitCode: 0 };
}

function ls(ps: ProjectState, wp: Workpack, args: string[]): CommandOutput {
  const all = [...BASE_TREE.filter((e) => !e.endsWith('/')), ...knownPaths(ps, wp)];
  const dirs = new Set<string>(BASE_TREE.filter((e) => e.endsWith('/')).map((e) => e.slice(0, -1)));
  for (const p of knownPaths(ps, wp)) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const target = (args[0] ?? '').replace(/\/$/, '');
  const prefix = target === '' || target === '.' ? '' : `${target}/`;
  if (prefix !== '' && !dirs.has(target)) {
    return { lines: [err(`ls: cannot access '${args[0]}': No such file or directory`)], exitCode: 2 };
  }
  const entries = new Set<string>();
  for (const path of all) if (path.startsWith(prefix) && path.length > prefix.length) entries.add(`${path.slice(prefix.length).split('/')[0]}${path.slice(prefix.length).includes('/') ? '/' : ''}`);
  for (const dir of dirs) if (dir.startsWith(prefix) && dir.length > prefix.length) entries.add(`${dir.slice(prefix.length).split('/')[0]}/`);
  return { lines: [...entries].sort().map(out), exitCode: 0 };
}

function cat(ps: ProjectState, wp: Workpack, path: string): CommandOutput {
  const file = ensureFiles(ps, wp).find((f) => f.path === path);
  if (file) return { lines: file.modified.split('\n').map(out), exitCode: 0 };
  if (path === 'package.json') return { lines: PACKAGE_JSON.split('\n').map(out), exitCode: 0 };
  return { lines: [err(`cat: ${path}: No such file or directory`)], exitCode: 1 };
}

function logs(ps: ProjectState, run: Run, args: string[]): CommandOutput {
  const at = args.indexOf('--tail');
  const n = at >= 0 ? Number(args[at + 1]) : 20;
  const lines = (ps.logs.get(run.id) ?? []).slice(-n).map((e) => out(`${new Date(e.ts).toISOString().slice(11, 23)} ${e.tag} ${e.message}`));
  return { lines: lines.length > 0 ? lines : [out('No log lines yet.')], exitCode: 0 };
}

function tsc(ps: ProjectState, wp: Workpack): CommandOutput {
  const types = latestGateResults(ps, wp).find((g) => g.gate === 'static.types_lint');
  const failure = types?.status === 'failed' ? types.failures[0] : undefined;
  return failure ? { lines: [err(`${failure.file}(${failure.line},1): error TS2322: ${failure.message}`)], exitCode: 2 } : { lines: [], exitCode: 0 };
}

/** Run an already-validated command against the simulated sandbox. */
export function runCommand(ps: ProjectState, wp: Workpack, run: Run, argv: string[]): CommandOutput {
  const [command, ...args] = argv;
  switch (command) {
    case 'vitest':
      return vitest(ps, wp, args);
    case 'git':
      return args[0] === 'diff' ? gitDiff(ps, wp, args.slice(1)) : args[0] === 'status' ? gitStatus(ps, wp) : gitLog(wp, args.slice(1));
    case 'tsc':
      return tsc(ps, wp);
    case 'ls':
      return ls(ps, wp, args);
    case 'cat':
      return cat(ps, wp, args[0] ?? '');
    case 'logs':
      return logs(ps, run, args);
    default:
      return { lines: [err(`${command}: command not found`)], exitCode: 127 };
  }
}

// ---------------------------------------------------------------------------
// A person typing into the terminal
// ---------------------------------------------------------------------------

export interface TerminalSession {
  runId: string;
  actor: Actor;
}

/** The first frame of a new connection. */
export function readyFrame(wp: Workpack, run: Run, role: Role): TerminalServerFrame {
  return { type: 'ready', cwd: '/workspace', branch: wp.branch, canWrite: can(role, 'terminal.exec'), requiredRole: 'engineer', runActive: run.endedAt === null };
}

export interface InputResult {
  /** Frames to send back right away (rejections). */
  rejected: TerminalServerFrame | null;
  /** Output to stream out, with the exit code to finish with. */
  output: CommandOutput | null;
  normalized: string | null;
}

/**
 * Apply the Appendix G role check and the §7.3 command grammar to one line of input, audit it as the
 * human who typed it, and (if allowed) produce the simulated output. Nothing is sent from here.
 */
export function handleInput(ps: ProjectState, wp: Workpack, run: Run, actor: Actor, data: string): InputResult {
  const target = { workpackId: wp.id, runId: run.id, command: data.trim().slice(0, 256) };
  if (!can(actor.role, 'terminal.exec')) {
    recordAudit(ps, actor, 'terminal.rejected', { ...target, reason: 'forbidden' });
    return { rejected: { type: 'rejected', code: 'forbidden', message: `Requires ${ROLE_LABEL.engineer}.`, requiredRole: 'engineer' }, output: null, normalized: null };
  }
  if (run.endedAt) {
    return { rejected: { type: 'rejected', code: 'run_not_active', message: 'The run has ended, so its sandbox is gone.' }, output: null, normalized: null };
  }
  const check = checkCommand(data);
  if (!check.ok) {
    recordAudit(ps, actor, 'terminal.rejected', { ...target, reason: check.rule });
    return { rejected: { type: 'rejected', code: 'command_not_allowed', rule: check.rule, message: check.message }, output: null, normalized: null };
  }
  recordAudit(ps, actor, 'terminal.exec', { ...target, command: check.normalized });
  return { rejected: null, output: runCommand(ps, wp, run, check.argv), normalized: check.normalized };
}
