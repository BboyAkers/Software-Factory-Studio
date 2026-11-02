import { describe, expect, it } from 'vitest';
import { diffLines, fillDefaults, lineOfPath, parseEpicDsl, priorityLabel, templateFor, toIssueBody } from './dsl';
import { EpicModeSchema } from '../contracts';

const VALID = `---
title: "Multi-tenant Stripe webhook retry"
mode: feature
priority: P1
areas: [billing, webhooks]
acceptance:
  - "Idempotent retries with exponential backoff"
  - "Redis lease lock < 450ms"
---

Freeform problem statement. Agents interpret; frontmatter is authoritative.
`;

/** VALID with one top-level key (and its indented block) removed. */
const without = (key: string) => {
  const out: string[] = [];
  let skipping = false;
  for (const line of VALID.split('\n')) {
    if (line.startsWith(`${key}:`)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s+/.test(line)) continue;
    skipping = false;
    out.push(line);
  }
  return out.join('\n');
};

const errorsOf = (md: string) => {
  const r = parseEpicDsl(md);
  if (r.ok) throw new Error('expected a validation failure');
  return r;
};

describe('parsing and validating the Spec Studio DSL (Appendix C)', () => {
  it('accepts a complete document and keeps the free-form body', () => {
    const r = parseEpicDsl(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dsl).toMatchObject({ title: 'Multi-tenant Stripe webhook retry', mode: 'feature', priority: 'P1', areas: ['billing', 'webhooks'] });
    expect(r.dsl.acceptance).toHaveLength(2);
    expect(r.body).toContain('Freeform problem statement.');
  });

  it('reports each missing required field with its path', () => {
    for (const field of ['title', 'mode', 'priority', 'areas', 'acceptance']) {
      const r = errorsOf(without(field));
      expect(r.code).toBe('validation_failed');
      expect(r.errors.map((e) => e.path)).toContain(field);
    }
  });

  it('rejects empty areas and acceptance lists with the spec codes', () => {
    const md = VALID.replace('areas: [billing, webhooks]', 'areas: []').replace(/acceptance:[\s\S]*?---\n/, 'acceptance: []\n---\n');
    const r = errorsOf(md);
    const byPath = Object.fromEntries(r.errors.map((e) => [e.path, e]));
    expect(byPath.areas?.message).toBe('Add at least one area');
    expect(byPath.acceptance?.code).toBe('too_small');
  });

  it('rejects an unknown priority or mode and names the allowed values', () => {
    const r = errorsOf(VALID.replace('priority: P1', 'priority: P9').replace('mode: feature', 'mode: chore'));
    const byPath = Object.fromEntries(r.errors.map((e) => [e.path, e.message]));
    expect(byPath.priority).toMatch(/P0.*P1.*P2/);
    expect(byPath.mode).toMatch(/feature.*refactor.*bug.*security/);
  });

  it('flags a document with no frontmatter block', () => {
    const r = errorsOf('Just some prose, no frontmatter.');
    expect(r.errors[0]).toMatchObject({ path: 'frontmatter', code: 'missing_frontmatter' });
  });

  it('flags frontmatter that is not valid YAML', () => {
    const r = errorsOf('---\ntitle: "unclosed\nareas: [a\n---\nbody');
    expect(r.errors[0]).toMatchObject({ path: 'frontmatter', code: 'invalid_yaml' });
  });

  it('applies the language guard: anything other than typescript is unsupported_language', () => {
    const r = errorsOf(VALID.replace('areas:', 'language: python\nareas:'));
    expect(r.code).toBe('unsupported_language');
    expect(r.errors.find((e) => e.code === 'unsupported_language')).toMatchObject({ path: 'language' });
    expect(parseEpicDsl(VALID.replace('areas:', 'language: typescript\nareas:')).ok).toBe(true);
  });

  it('puts unsupported_language first even when other fields are also wrong', () => {
    const r = errorsOf(without('title').replace('areas:', 'language: go\nareas:'));
    expect(r.code).toBe('unsupported_language');
    expect(r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(['language', 'title']));
  });
});

describe('Fill defaults (diff-accept, optional fields only)', () => {
  it('adds the optional fields that are missing and nothing else', () => {
    const r = fillDefaults(VALID);
    expect(r).not.toBeNull();
    expect(r!.added).toEqual(['language', 'contracts', 'dag_hints', 'test_plan']);
    expect(r!.proposed).toContain('language: typescript');
    expect(r!.proposed).toContain('Freeform problem statement.');
    expect(parseEpicDsl(r!.proposed).ok).toBe(true);
  });

  it('never fills a required field', () => {
    const r = fillDefaults(without('areas'));
    expect(r).not.toBeNull();
    expect(r!.proposed).not.toMatch(/^areas:/m);
    expect(r!.proposed).not.toMatch(/^title:.*\n.*^title:/ms);
  });

  it('keeps optional values the author already set, and is a no-op once everything is present', () => {
    const custom = VALID.replace('areas:', 'test_plan: ["vitest tests/stripe.test.ts"]\nareas:');
    const r = fillDefaults(custom)!;
    expect(r.added).not.toContain('test_plan');
    expect(r.proposed).toContain('vitest tests/stripe.test.ts');
    expect(fillDefaults(r.proposed)).toBeNull();
  });

  it('returns nothing to propose when there is no usable frontmatter', () => {
    expect(fillDefaults('no frontmatter here')).toBeNull();
  });
});

describe('line diff for the diff-accept dialog', () => {
  it('shows only additions when defaults are filled in', () => {
    const filled = fillDefaults(VALID)!;
    const diff = diffLines(VALID, filled.proposed);
    expect(diff.filter((l) => l.type === 'remove')).toHaveLength(0);
    expect(diff.filter((l) => l.type === 'add').map((l) => l.text)).toEqual(
      expect.arrayContaining(['language: typescript', 'contracts: []', 'dag_hints: []']),
    );
    expect(diff.filter((l) => l.type === 'same').length).toBeGreaterThan(5);
  });

  it('reports a replaced line as a removal plus an addition', () => {
    const diff = diffLines('a\nb\nc', 'a\nB\nc');
    expect(diff.map((l) => `${l.type}:${l.text}`)).toEqual(['same:a', 'remove:b', 'add:B', 'same:c']);
  });
});

describe('issue body round trip (Spec Studio files the issue; intake parses it back)', () => {
  it('parses back to exactly what was filed', () => {
    const first = parseEpicDsl(VALID);
    if (!first.ok) throw new Error('fixture invalid');
    const body = toIssueBody(first.dsl, first.body);
    const second = parseEpicDsl(body);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.dsl).toEqual(first.dsl);
    expect(second.body.trim()).toBe(first.body.trim());
  });

  it('round-trips optional fields, quotes and special characters', () => {
    const md = `---
title: "Fix: \\"quoted\\" title #1"
mode: bug
priority: P0
areas: ["api: v2", webhooks]
acceptance:
  - "Handles a: colon and 'single' quotes"
language: typescript
contracts:
  - { kind: ts-types, path: contracts/stripe.ts }
dag_hints: [stripe-ledger]
test_plan: ["vitest tests/stripe.test.ts"]
budget_cap_note: "Keep under $15"
---
Body`;
    const first = parseEpicDsl(md);
    if (!first.ok) throw new Error(JSON.stringify(first.errors));
    const second = parseEpicDsl(toIssueBody(first.dsl, first.body));
    expect(second.ok && second.dsl).toEqual(first.dsl);
  });
});

describe('helpers the editor relies on', () => {
  it('maps DSL priorities to workpack priorities', () => {
    expect(priorityLabel('P0')).toBe('P0 Blocker');
    expect(priorityLabel('P1')).toBe('P1 High');
    expect(priorityLabel('P2')).toBe('P2 Normal');
  });

  it('finds the line of a key so errors can jump to it (1-based)', () => {
    expect(lineOfPath(VALID, 'mode')).toBe(3);
    expect(lineOfPath(VALID, 'acceptance')).toBe(6);
    expect(lineOfPath(VALID, 'acceptance.1')).toBe(8);
    expect(lineOfPath(VALID, 'missing')).toBe(1);
  });

  it('ships a valid starter template for every mode', () => {
    for (const mode of EpicModeSchema.options) {
      const r = parseEpicDsl(templateFor(mode));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.dsl.mode).toBe(mode);
    }
  });
});
