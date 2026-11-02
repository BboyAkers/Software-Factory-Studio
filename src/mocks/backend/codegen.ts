/**
 * Deterministic stand-ins for what an agent writes: small, plausible TypeScript files and an
 * edited version of each, so the diff viewer has real unified diffs to render.
 */

export function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const hex8 = (n: number): string => n.toString(16).padStart(8, '0');

/** 64 hex characters (the width of a SHA-256) derived deterministically from `text`. Not cryptographic. */
export function longHash(text: string): string {
  return Array.from({ length: 8 }, (_, i) => hex8(hash32(`${i}:${text}`))).join('');
}

const words = (path: string) =>
  path
    .replace(/\.[a-z]+$/, '')
    .split(/[/.\-_]/)
    .filter((w) => w && !['src', 'test', 'spec', 'index', 'tests', 'e2e'].includes(w));

const camel = (parts: string[]) => parts.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('') || 'run';
const pascal = (parts: string[]) => parts.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('') || 'Module';

interface FilePair {
  original: string;
  final: string;
}

function testFile(path: string): FilePair {
  const name = camel(words(path));
  const base = [
    `import { describe, expect, it } from 'vitest';`,
    `import { ${name} } from './index';`,
    ``,
    `describe('${name}', () => {`,
    `  it('returns the input unchanged', () => {`,
    `    expect(${name}({ id: 'a' })).toEqual({ id: 'a' });`,
    `  });`,
    `});`,
  ];
  const final = [
    ...base.slice(0, 7),
    ``,
    `  it('rejects an empty id', () => {`,
    `    expect(() => ${name}({ id: '' })).toThrow('id is required');`,
    `  });`,
    ``,
    `  it('is idempotent for repeated calls', () => {`,
    `    const once = ${name}({ id: 'a' });`,
    `    expect(${name}(once)).toEqual(once);`,
    `  });`,
    `});`,
  ];
  return { original: base.join('\n'), final: final.join('\n') };
}

function moduleFile(path: string): FilePair {
  const name = camel(words(path));
  const type = `${pascal(words(path))}Input`;
  const base = [
    `export interface ${type} {`,
    `  id: string;`,
    `}`,
    ``,
    `export function ${name}(input: ${type}): ${type} {`,
    `  return input;`,
    `}`,
  ];
  const final = [
    `export interface ${type} {`,
    `  id: string;`,
    `  /** Retry attempt, starting at 1. */`,
    `  attempt?: number;`,
    `}`,
    ``,
    `const MAX_ATTEMPTS = 3;`,
    ``,
    `export function ${name}(input: ${type}): ${type} {`,
    `  if (!input.id) throw new Error('id is required');`,
    `  const attempt = Math.min((input.attempt ?? 0) + 1, MAX_ATTEMPTS);`,
    `  return { ...input, attempt };`,
    `}`,
  ];
  return { original: base.join('\n'), final: final.join('\n') };
}

function hookFile(path: string): FilePair {
  const name = camel(words(path));
  const base = [`import { useState } from 'react';`, ``, `export function ${name}() {`, `  const [value, setValue] = useState(0);`, `  return { value, setValue };`, `}`];
  const final = [
    `import { useCallback, useState } from 'react';`,
    ``,
    `export function ${name}() {`,
    `  const [value, setValue] = useState(0);`,
    `  const reset = useCallback(() => setValue(0), []);`,
    `  const increment = useCallback(() => setValue((v) => v + 1), []);`,
    `  return { value, setValue, reset, increment };`,
    `}`,
  ];
  return { original: base.join('\n'), final: final.join('\n') };
}

function componentFile(path: string): FilePair {
  const name = pascal(words(path));
  const base = [`export function ${name}() {`, `  return <div>${name}</div>;`, `}`];
  const final = [
    `interface ${name}Props {`,
    `  label: string;`,
    `  disabled?: boolean;`,
    `}`,
    ``,
    `export function ${name}({ label, disabled = false }: ${name}Props) {`,
    `  return (`,
    `    <button type="button" disabled={disabled} aria-label={label}>`,
    `      {label}`,
    `    </button>`,
    `  );`,
    `}`,
  ];
  return { original: base.join('\n'), final: final.join('\n') };
}

function docFile(path: string): FilePair {
  const title = pascal(words(path));
  return {
    original: `# ${title}\n\nTODO`,
    final: `# ${title}\n\n## Overview\n\nDescribes the behavior added by this change.\n\n## Usage\n\nSee the acceptance criteria on the Epic.`,
  };
}

/** The base and final content for a path the agent will edit. */
export function generateFile(path: string): FilePair {
  if (/\.(test|spec)\.tsx?$/.test(path)) return testFile(path);
  if (path.endsWith('.md') || /\.ya?ml$/.test(path)) return docFile(path);
  if (path.endsWith('.tsx')) return componentFile(path);
  if (/(^|\/)use[A-Z][A-Za-z]*\.ts$/.test(path)) return hookFile(path);
  return moduleFile(path);
}

/** The first `fraction` (0..1) of `final`'s lines, always at least one line once writing has started. */
export function revealLines(original: string, final: string, fraction: number): string {
  if (fraction >= 1) return final;
  const lines = final.split('\n');
  const count = Math.max(0, Math.floor(lines.length * fraction));
  if (count === 0) return original;
  return [...lines.slice(0, count), ...original.split('\n').slice(count)].join('\n');
}
