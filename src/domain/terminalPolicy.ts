/** Safe-command allow-list for the Live Workspace terminal (spec §7.3). Enforced server-side and mirrored in Studio. */
export const MAX_COMMAND_LENGTH = 256;

export type CommandRule =
  | 'empty'
  | 'too-long'
  | 'shell-operator'
  | 'not-allow-listed'
  | 'flag-not-allowed'
  | 'bad-argument'
  | 'unsafe-path';

export type CommandCheck =
  | { ok: true; argv: string[]; normalized: string }
  | { ok: false; code: 'command_not_allowed'; rule: CommandRule; message: string };

const ALLOWED = 'Allowed commands: vitest, git diff|status|log, tsc --noEmit, ls, cat, logs.';
const SHELL_CHARACTERS = '|;&><`$(){}\\"\'';
const SAFE_PATH = /^[A-Za-z0-9._@+\-/]+$/;
const GIT_SUBCOMMANDS = ['diff', 'status', 'log'];
const GIT_FLAGS = ['--stat', '--name-only', '--oneline'];

const deny = (rule: CommandRule, message: string): CommandCheck => ({ ok: false, code: 'command_not_allowed', rule, message });

function pathProblem(path: string): string | null {
  if (!SAFE_PATH.test(path)) return `"${path}" contains characters that are not allowed in a path.`;
  if (path.startsWith('/')) return 'Absolute paths are not allowed. Use a path inside the workspace.';
  const segments = path.split('/');
  if (segments.includes('..')) return 'Paths may not leave the workspace (no "..").';
  if (segments.includes('.git')) return 'Paths inside .git are not allowed.';
  const base = segments[segments.length - 1] ?? '';
  if (base.startsWith('.env')) return 'Environment files are not readable from the terminal.';
  return null;
}

function integerInRange(token: string | undefined, min: number, max: number): number | null {
  if (token === undefined || !/^\d+$/.test(token)) return null;
  const n = Number(token);
  return n >= min && n <= max ? n : null;
}

export function checkCommand(input: string): CommandCheck {
  const raw = input.trim();
  if (raw === '') return deny('empty', 'Enter a command.');
  if (raw.length > MAX_COMMAND_LENGTH) return deny('too-long', `Commands are limited to ${MAX_COMMAND_LENGTH} characters.`);
  if (/[\r\n]/.test(raw)) return deny('shell-operator', 'Send one command per line: newlines are not allowed.');
  const bad = [...raw].find((ch) => SHELL_CHARACTERS.includes(ch));
  if (bad) return deny('shell-operator', `Shell operators and quoting are not allowed (found ${bad}). Send one plain command.`);

  const argv = raw.split(/\s+/);
  const normalized = argv.join(' ');
  const [command, ...args] = argv as [string, ...string[]];
  const ok = (): CommandCheck => ({ ok: true, argv, normalized });

  const checkPaths = (paths: string[]): CommandCheck | null => {
    for (const p of paths) {
      const problem = pathProblem(p);
      if (problem) return deny('unsafe-path', problem);
    }
    return null;
  };

  switch (command) {
    case 'vitest': {
      const rest = args[0] === 'run' ? args.slice(1) : args;
      const paths: string[] = [];
      for (const token of rest) {
        if (token.startsWith('-')) {
          if (token === '--coverage' || /^--reporter=[a-z][a-z-]*$/.test(token)) continue;
          return deny('flag-not-allowed', `vitest flag ${token} is not allowed. Read-only runs may use --coverage and --reporter=<name>.`);
        }
        paths.push(token);
      }
      return checkPaths(paths) ?? ok();
    }

    case 'git': {
      const sub = args[0];
      if (!sub || !GIT_SUBCOMMANDS.includes(sub)) {
        return deny('not-allow-listed', `${sub ? `git ${sub}` : 'git'} is not allowed. ${ALLOWED}`);
      }
      const paths: string[] = [];
      for (let i = 1; i < args.length; i++) {
        const token = args[i]!;
        if (token === '-n') {
          if (integerInRange(args[i + 1], 1, 200) === null) return deny('bad-argument', '-n needs a whole number from 1 to 200.');
          i++;
        } else if (token.startsWith('-')) {
          if (!GIT_FLAGS.includes(token)) return deny('flag-not-allowed', `git ${sub} flag ${token} is not allowed. Use --stat, --name-only, --oneline or -n <1..200>.`);
        } else {
          paths.push(token);
        }
      }
      if (paths.length > 1) return deny('bad-argument', `git ${sub} accepts at most one path.`);
      return checkPaths(paths) ?? ok();
    }

    case 'tsc': {
      if (args.length === 0) return deny('bad-argument', 'tsc is only allowed as: tsc --noEmit');
      for (const token of args) {
        if (token === '--noEmit') continue;
        return token.startsWith('-')
          ? deny('flag-not-allowed', `tsc flag ${token} is not allowed. Only --noEmit is permitted.`)
          : deny('bad-argument', 'tsc is only allowed as: tsc --noEmit');
      }
      return ok();
    }

    case 'ls':
    case 'cat': {
      const flag = args.find((a) => a.startsWith('-'));
      if (flag) return deny('flag-not-allowed', `${command} takes a path, not flags (found ${flag}).`);
      if (command === 'cat' && args.length !== 1) return deny('bad-argument', 'cat needs exactly one file path.');
      if (command === 'ls' && args.length > 1) return deny('bad-argument', 'ls accepts at most one path.');
      return checkPaths(args) ?? ok();
    }

    case 'logs': {
      if (args.length === 0) return ok();
      if (args[0] !== '--tail') return deny('flag-not-allowed', `logs flag ${args[0]} is not allowed. Use: logs --tail <1..500>.`);
      if (args.length !== 2 || integerInRange(args[1], 1, 500) === null) return deny('bad-argument', '--tail needs a whole number from 1 to 500.');
      return ok();
    }

    default:
      return deny('not-allow-listed', `${command} is not allowed. ${ALLOWED}`);
  }
}
