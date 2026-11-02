import { parse } from 'yaml';
import type { z } from 'zod';
import { EpicDslSchema, type DslPriority, type EpicDsl, type EpicMode, type FieldError, type Priority } from '../contracts';

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

interface Split {
  yaml: string;
  body: string;
  /** Offset where the YAML text ends (just before the closing `---`'s newline). */
  yamlEnd: number;
}

function splitFrontmatter(markdown: string): Split | null {
  const text = markdown.replace(/^\uFEFF/, '');
  const match = FRONTMATTER.exec(text);
  if (!match) return null;
  const open = /^---[ \t]*\r?\n/.exec(text)![0].length;
  const yaml = match[1] ?? '';
  return { yaml, body: text.slice(match[0].length), yamlEnd: open + yaml.length };
}

export type ParsedDsl =
  | { ok: true; dsl: EpicDsl; body: string; raw: Record<string, unknown> }
  | {
      ok: false;
      code: 'validation_failed' | 'unsupported_language';
      errors: FieldError[];
      body: string;
      raw: Record<string, unknown> | null;
    };

function fail(
  code: 'validation_failed' | 'unsupported_language',
  errors: FieldError[],
  body: string,
  raw: Record<string, unknown> | null,
): ParsedDsl {
  return { ok: false, code, errors, body, raw };
}

function mapIssue(issue: z.core.$ZodIssue): FieldError {
  const path = issue.path.map(String).join('.') || 'frontmatter';
  let message = issue.message;
  let code: string = issue.code;
  if (issue.code === 'invalid_type' && /received undefined/.test(message)) {
    message = `Add ${path}`;
    code = 'required';
  } else if (issue.code === 'invalid_value' && 'values' in issue) {
    message = `${path} must be one of: ${(issue.values as unknown[]).join(', ')}`;
  }
  return { path, message, code };
}

/** Parse and validate a Spec Studio document (spec Appendix C). */
export function parseEpicDsl(markdown: string): ParsedDsl {
  const split = splitFrontmatter(markdown);
  if (!split) {
    return fail(
      'validation_failed',
      [{ path: 'frontmatter', message: 'Start the document with a frontmatter block between --- lines.', code: 'missing_frontmatter' }],
      markdown,
      null,
    );
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = parse(split.yaml);
  } catch (error) {
    const message = error instanceof Error ? (error.message.split('\n')[0] ?? 'Invalid YAML') : 'Invalid YAML';
    return fail('validation_failed', [{ path: 'frontmatter', message, code: 'invalid_yaml' }], split.body, null);
  }
  const raw: Record<string, unknown> =
    parsedYaml && typeof parsedYaml === 'object' && !Array.isArray(parsedYaml) ? (parsedYaml as Record<string, unknown>) : {};

  const errors: FieldError[] = [];
  if (raw.language !== undefined && String(raw.language).trim().toLowerCase() !== 'typescript') {
    errors.push({
      path: 'language',
      message: 'Only TypeScript is supported in v1. Set language: typescript or remove the field.',
      code: 'unsupported_language',
    });
  }
  const result = EpicDslSchema.safeParse(raw);
  if (!result.success) errors.push(...result.error.issues.map(mapIssue));

  if (errors.length > 0 || !result.success) {
    const code = errors.some((e) => e.code === 'unsupported_language') ? 'unsupported_language' : 'validation_failed';
    return fail(code, errors, split.body, raw);
  }
  return { ok: true, dsl: result.data, body: split.body, raw };
}

export function priorityLabel(priority: DslPriority): Priority {
  return priority === 'P0' ? 'P0 Blocker' : priority === 'P1' ? 'P1 High' : 'P2 Normal';
}

// ---------------------------------------------------------------------------
// Fill defaults
// ---------------------------------------------------------------------------

const DEFAULT_FIELDS: [key: string, value: string | string[]][] = [
  ['language', 'typescript'],
  ['contracts', []],
  ['dag_hints', []],
  ['test_plan', ['vitest run']],
];

const yamlLine = (key: string, value: string | string[]) =>
  `${key}: ${Array.isArray(value) ? JSON.stringify(value) : value}`;

/**
 * Propose the optional fields the document does not set yet. Required fields are never filled.
 * Returns `null` when there is nothing to add or the frontmatter cannot be read.
 */
export function fillDefaults(markdown: string): { proposed: string; added: string[] } | null {
  const text = markdown.replace(/^\uFEFF/, '');
  const split = splitFrontmatter(text);
  if (!split) return null;
  let raw: unknown;
  try {
    raw = parse(split.yaml);
  } catch {
    return null;
  }
  const present = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const missing = DEFAULT_FIELDS.filter(([key]) => !(key in present));
  if (missing.length === 0) return null;
  const insertion = `\n${missing.map(([key, value]) => yamlLine(key, value)).join('\n')}`;
  const proposed = text.slice(0, split.yamlEnd) + insertion + text.slice(split.yamlEnd);
  return { proposed, added: missing.map(([key]) => key) };
}

// ---------------------------------------------------------------------------
// Line diff (for the diff-accept dialog)
// ---------------------------------------------------------------------------

export interface DiffEntry {
  type: 'same' | 'add' | 'remove';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export function diffLines(before: string, after: string): DiffEntry[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i]!, oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: 'remove', text: a[i]!, oldLine: i + 1, newLine: null });
      i++;
    } else {
      out.push({ type: 'add', text: b[j]!, oldLine: null, newLine: j + 1 });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ type: 'remove', text: a[i]!, oldLine: i + 1, newLine: null });
  for (; j < b.length; j++) out.push({ type: 'add', text: b[j]!, oldLine: null, newLine: j + 1 });
  return out;
}

// ---------------------------------------------------------------------------
// Issue body
// ---------------------------------------------------------------------------

/** Canonical document filed as the GitHub issue body. JSON scalars are valid YAML, so quoting is safe. */
export function toIssueBody(dsl: EpicDsl, body: string): string {
  const q = (s: string) => JSON.stringify(s);
  const lines = ['---', `title: ${q(dsl.title)}`, `mode: ${dsl.mode}`, `priority: ${dsl.priority}`];
  lines.push(`areas: [${dsl.areas.map(q).join(', ')}]`);
  lines.push('acceptance:', ...dsl.acceptance.map((a) => `  - ${q(a)}`));
  if (dsl.language !== undefined) lines.push(`language: ${dsl.language}`);
  if (dsl.contracts !== undefined) {
    if (dsl.contracts.length === 0) lines.push('contracts: []');
    else lines.push('contracts:', ...dsl.contracts.map((c) => `  - ${JSON.stringify(c)}`));
  }
  if (dsl.dag_hints !== undefined) lines.push(`dag_hints: [${dsl.dag_hints.map(q).join(', ')}]`);
  if (dsl.test_plan !== undefined) lines.push(`test_plan: [${dsl.test_plan.map(q).join(', ')}]`);
  if (dsl.budget_cap_note !== undefined) lines.push(`budget_cap_note: ${q(dsl.budget_cap_note)}`);
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

/** 1-based line of a path's key in the document, for jump-to-error. Falls back to line 1. */
export function lineOfPath(markdown: string, path: string): number {
  const lines = markdown.split(/\r?\n/);
  const [root, index] = path.split('.');
  const at = lines.findIndex((line, i) => i > 0 && line.startsWith(`${root}:`));
  if (at === -1) return 1;
  if (index !== undefined && /^\d+$/.test(index)) {
    let seen = -1;
    for (let i = at + 1; i < lines.length; i++) {
      if (!/^\s+-\s/.test(lines[i]!)) break;
      seen++;
      if (seen === Number(index)) return i + 1;
    }
  }
  return at + 1;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<EpicMode, { title: string; areas: string; acceptance: string; prose: string }> = {
  feature: {
    title: 'Describe the capability in one line',
    areas: 'area-one',
    acceptance: 'State one observable outcome',
    prose: 'Describe the problem, who is affected, and any constraints the design must respect.',
  },
  refactor: {
    title: 'Describe what is being restructured',
    areas: 'area-one',
    acceptance: 'Behavior is unchanged and existing tests still pass',
    prose: 'Explain why the current structure is a problem and what the target structure looks like.',
  },
  bug: {
    title: 'Describe the failure in one line',
    areas: 'area-one',
    acceptance: 'The failure no longer reproduces',
    prose: 'Steps to reproduce, the expected result, and the actual result. Include error output if you have it.',
  },
  security: {
    title: 'Describe the vulnerability or hardening goal',
    areas: 'area-one',
    acceptance: 'The weakness is closed and covered by a test',
    prose: 'Describe the threat, the affected surface, and how you would verify the fix.',
  },
};

export function templateFor(mode: EpicMode): string {
  const t = TEMPLATES[mode];
  return [
    '---',
    `title: ${JSON.stringify(t.title)}`,
    `mode: ${mode}`,
    'priority: P2',
    `areas: [${t.areas}]`,
    'acceptance:',
    `  - ${JSON.stringify(t.acceptance)}`,
    '---',
    '',
    t.prose,
    '',
  ].join('\n');
}
