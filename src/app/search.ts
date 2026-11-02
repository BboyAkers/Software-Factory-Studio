import { z } from 'zod';

export type SearchValue = string | number | boolean | null | undefined;
export type SearchInput = Record<string, SearchValue>;

/**
 * URLs carry flat string params: `?view=table&archived=1&q=retry`. A boolean is `1` or absent, so a link
 * reads the same as the spec (`archived=1`) instead of TanStack's default JSON encoding (`archived=1` →
 * the number 1, `q=123` → the number 123).
 */
export function parseSearch(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) out[key] = value;
  return out;
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    params.set(key, value === true ? '1' : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** A `?archived=1` switch, read as a boolean. Set it from code with `true` or `false`. */
export const searchFlag = () =>
  z
    .union([z.string(), z.boolean(), z.number()])
    .optional()
    .transform((value) => value === true || value === 1 || value === '1' || value === 'true')
    .catch(false);

/** Free text such as `q`: whatever is in the URL, or absent. */
export const searchText = () =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : String(value)))
    .catch(undefined);

/** One of a fixed set of values, with a fallback so a hand-edited URL never breaks the page. */
export const searchChoice = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).catch(fallback);
