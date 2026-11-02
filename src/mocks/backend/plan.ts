import type { ContractKind, DagNode, EpicDsl, EpicMode, PreviewResponse } from '../../contracts';
import { globsOverlap } from '../../domain/queue';
import { hash32, longHash } from './codegen';

export interface ContractDraft {
  kind: ContractKind;
  path: string;
  content: string;
  hash: string;
}

export interface Plan {
  title: string;
  contracts: ContractDraft[];
  dag: DagNode[];
  estimate: PreviewResponse['estimate'];
}

export interface PlanContext {
  /** Workpacks that hold files right now: a node touching the same files will queue behind them. */
  activeLocks: { id: string; targetFiles: readonly string[] }[];
  /** Monthly cap minus spend, in micros. Used to express the estimate as a share of what is left. */
  remainingBudgetUsdMicros: number;
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'area';

const pascal = (text: string): string =>
  slug(text)
    .split('-')
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');

const quote = (text: string): string => JSON.stringify(text);

// ---------------------------------------------------------------------------
// DAG
// ---------------------------------------------------------------------------

interface NodeSpec {
  title: string;
  files: string[];
  /** Indices into the spec list this node waits for. */
  after: number[];
  stage: DagNode['stage'];
  complexity?: DagNode['complexity'];
}

const VERB: Record<EpicMode, { primary: string; secondary: string }> = {
  feature: { primary: 'Build', secondary: 'Wire up' },
  refactor: { primary: 'Extract', secondary: 'Migrate callers of' },
  bug: { primary: 'Fix', secondary: 'Guard against regressions in' },
  security: { primary: 'Harden', secondary: 'Add negative tests for' },
};

const MAX_AREAS = 3;
const MAX_SYNTHESIS_NODES = 5;
const UI_AREA = /ui|page|component|view|dashboard|screen|layout|form|modal|workspace|matrix|overview|settings|studio|panel|drawer|shell/;

/** Files for an area's main node and its follow-up node. UI areas get components and hooks, the rest services and routes. */
function areaFiles(dir: string): { primary: string[]; secondary: string[] } {
  if (UI_AREA.test(dir)) {
    const name = pascal(dir);
    return {
      primary: [`src/pages/${dir}/${name}.tsx`, `src/pages/${dir}/use${name}.ts`],
      secondary: [`src/pages/${dir}/index.tsx`, `src/pages/${dir}/routes.ts`],
    };
  }
  return { primary: [`src/${dir}/service.ts`, `src/${dir}/types.ts`], secondary: [`src/${dir}/routes.ts`, `src/${dir}/index.ts`] };
}

function nodeSpecs(dsl: EpicDsl): NodeSpec[] {
  const verbs = VERB[dsl.mode];
  const areas = dsl.areas.slice(0, MAX_AREAS).map(slug);
  const hints = (dsl.dag_hints ?? []).map((h) => h.trim()).filter(Boolean);
  const specs: NodeSpec[] = [];

  areas.forEach((area, i) => {
    const primaryName = hints[i] ?? area;
    const dir = slug(primaryName);
    const { primary, secondary } = areaFiles(dir);
    const files = [...primary];
    // A second area also touches the first area's main file, which makes two parallel nodes contend for it.
    if (i === 1) files.push(areaFiles(slug(hints[0] ?? areas[0]!)).primary[1]!);
    const primaryIndex = specs.length;
    specs.push({ title: `${verbs.primary} ${primaryName}`, files, after: [], stage: 'synthesis' });

    const wantsSecondary = specs.length < MAX_SYNTHESIS_NODES && (i === 0 || dsl.acceptance.length > 2);
    if (wantsSecondary && dsl.mode !== 'bug') {
      specs.push({ title: `${verbs.secondary} ${primaryName}`, files: secondary, after: [primaryIndex], stage: 'synthesis' });
    }
  });

  const synthesis = specs.map((_, i) => i);
  const firstArea = hints[0] ?? areas[0] ?? 'feature';
  specs.push({
    title: 'Cover the acceptance criteria with tests',
    files: [`tests/${slug(firstArea)}/acceptance.test.ts`, `tests/e2e/${slug(firstArea)}.spec.ts`],
    after: synthesis,
    stage: 'verification',
    complexity: 'Medium',
  });
  specs.push({
    title: 'Update docs and changelog',
    files: [`docs/${slug(firstArea)}.md`, 'CHANGELOG.md'],
    after: [specs.length - 1],
    stage: 'docs',
    complexity: 'Low',
  });
  return specs;
}

export const TOKENS: Record<DagNode['complexity'], [base: number, spread: number]> = {
  Low: [140_000, 110_000],
  Medium: [320_000, 280_000],
  High: [720_000, 680_000],
};

function complexityOf(spec: NodeSpec, mode: EpicMode, seed: number): DagNode['complexity'] {
  if (spec.complexity) return spec.complexity;
  const roll = seed % 10;
  const heavy = mode === 'security' || mode === 'refactor' ? 3 : 1;
  if (roll < heavy + 1) return 'High';
  if (roll < 6) return 'Medium';
  return 'Low';
}

/** For each node, the set of nodes it (transitively) depends on. */
function ancestors(nodes: { id: string; dependsOn: string[] }[]): Map<string, Set<string>> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, Set<string>>();
  const visit = (id: string): Set<string> => {
    const known = memo.get(id);
    if (known) return known;
    const out = new Set<string>();
    memo.set(id, out);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      out.add(dep);
      for (const up of visit(dep)) out.add(up);
    }
    return out;
  };
  for (const n of nodes) visit(n.id);
  return memo;
}

function buildDag(dsl: EpicDsl, context: PlanContext): DagNode[] {
  const specs = nodeSpecs(dsl);
  const ids = specs.map((_, i) => `n${i + 1}`);
  const base = specs.map(
    (spec, i): DagNode => {
      const seed = hash32(`${dsl.title}|${spec.title}|${i}`);
      const complexity = complexityOf(spec, dsl.mode, seed);
      const [floor, spread] = TOKENS[complexity];
      return {
        id: ids[i]!,
        title: spec.title,
        targetFiles: spec.files,
        dependsOn: spec.after.map((a) => ids[a]!),
        complexity,
        estimatedTokens: floor + (seed % spread),
        stage: spec.stage,
        overlapsWith: [],
        queuesBehind: [],
        workpackId: null,
      };
    },
  );

  return withOverlaps(base, context);
}

/** Work out which nodes would contend for a file, and which would queue behind running workpacks. */
export function withOverlaps(base: DagNode[], context: PlanContext): DagNode[] {
  const up = ancestors(base);
  return base.map((node) => ({
    ...node,
    // Two nodes only contend when neither has to finish before the other starts.
    overlapsWith: base
      .filter((other) => other.id !== node.id && !up.get(node.id)!.has(other.id) && !up.get(other.id)!.has(node.id))
      .filter((other) => globsOverlap(node.targetFiles, other.targetFiles))
      .map((other) => other.id),
    queuesBehind: context.activeLocks.filter((lock) => globsOverlap(node.targetFiles, lock.targetFiles)).map((lock) => lock.id),
  }));
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

const API_AREA = /api|webhook|auth|billing|server|route|gateway|stream/;

function tsTypes(dsl: EpicDsl): string {
  const areas = dsl.areas.slice(0, MAX_AREAS);
  const lines = [`// Authored by Architect-Prime for: ${dsl.title}`, '// Locked while workpacks run. Changing it needs a Maintainer unlock.', ''];
  for (const area of areas) {
    const name = pascal(area);
    lines.push(`export interface ${name}Command {`, '  id: string;', '  requestedAt: string;', '}', '');
    lines.push(`export interface ${name}Result {`, '  ok: boolean;', '  reason?: string;', '}', '');
  }
  lines.push('/** What this Epic must satisfy. Each line becomes a test. */', 'export const ACCEPTANCE = [');
  for (const item of dsl.acceptance) lines.push(`  ${quote(item)},`);
  lines.push('] as const;', '');
  return lines.join('\n');
}

function openApi(dsl: EpicDsl): string {
  const lines = ['openapi: 3.1.0', 'info:', `  title: ${quote(dsl.title)}`, '  version: 0.1.0', 'paths:'];
  for (const area of dsl.areas.slice(0, MAX_AREAS)) {
    lines.push(
      `  /${slug(area)}:`,
      '    post:',
      `      operationId: submit${pascal(area)}`,
      '      requestBody:',
      '        required: true',
      '        content:',
      '          application/json:',
      '            schema:',
      `              $ref: '#/components/schemas/${pascal(area)}Command'`,
      '      responses:',
      "        '202': { description: Accepted }",
      "        '422': { description: Validation failed }",
    );
  }
  lines.push('components:', '  schemas:');
  for (const area of dsl.areas.slice(0, MAX_AREAS)) {
    lines.push(
      `    ${pascal(area)}Command:`,
      '      type: object',
      '      required: [id, requestedAt]',
      '      properties:',
      '        id: { type: string }',
      '        requestedAt: { type: string, format: date-time }',
    );
  }
  return `${lines.join('\n')}\n`;
}

function playwright(dsl: EpicDsl): string {
  const route = slug(dsl.areas[0] ?? 'home');
  const lines = ["import { expect, test } from '@playwright/test';", '', `test.describe(${quote(dsl.title)}, () => {`];
  for (const item of dsl.acceptance.slice(0, 4)) {
    lines.push(
      `  test(${quote(item)}, async ({ page }) => {`,
      `    await page.goto('/${route}');`,
      "    await expect(page.getByRole('main')).toBeVisible();",
      '  });',
      '',
    );
  }
  lines.push('});', '');
  return lines.join('\n');
}

const INVARIANTS: Record<EpicMode, string[]> = {
  feature: ['Existing public exports keep their signatures.', 'No new runtime dependency without a note in the PR body.'],
  refactor: ['Behavior is unchanged: every existing test passes untouched.', 'Public exports keep their names and signatures.', 'No file outside the target files changes.'],
  bug: ['The fix adds a test that fails before the change and passes after.', 'No unrelated formatting or renames in the diff.'],
  security: ['No secret or token reaches a log line.', 'Every new input is validated at the boundary.', 'No dependency is added without passing the license policy.'],
};

function invariants(dsl: EpicDsl): string {
  const lines = [`# Invariants for ${dsl.title}`, '', ...INVARIANTS[dsl.mode].map((i) => `- ${i}`)];
  if (dsl.budget_cap_note) lines.push(`- Budget note from the author: ${dsl.budget_cap_note}`);
  return `${lines.join('\n')}\n`;
}

export function contractsFor(dsl: EpicDsl): ContractDraft[] {
  const title = slug(dsl.title);
  const firstArea = slug(dsl.areas[0] ?? 'feature');
  const hinted = new Map<ContractKind, string>((dsl.contracts ?? []).map((c) => [c.kind, c.path]));

  const wants: { kind: ContractKind; path: string; content: () => string }[] = [
    { kind: 'ts-types', path: hinted.get('ts-types') ?? `contracts/${title}.ts`, content: () => tsTypes(dsl) },
    { kind: 'playwright', path: hinted.get('playwright') ?? `tests/e2e/${firstArea}.spec.ts`, content: () => playwright(dsl) },
  ];
  if (dsl.mode === 'feature' || dsl.mode === 'security' || dsl.areas.some((a) => API_AREA.test(a.toLowerCase())) || hinted.has('openapi')) {
    wants.splice(1, 0, { kind: 'openapi', path: hinted.get('openapi') ?? `contracts/${title}.openapi.yaml`, content: () => openApi(dsl) });
  }
  if (dsl.mode !== 'feature' || hinted.has('invariant')) {
    wants.push({ kind: 'invariant', path: hinted.get('invariant') ?? `contracts/${title}.invariants.md`, content: () => invariants(dsl) });
  }

  return wants.map((w) => {
    const content = w.content();
    return { kind: w.kind, path: w.path, content, hash: longHash(`${w.kind}|${w.path}|${content}`) };
  });
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

/** Blended price: $4 per million tokens, in micros per token. */
const MICROS_PER_TOKEN = 4;
/** Architect-Prime spends this many tokens on stages 1–2 before any workpack starts. */
const ARCHITECT_TOKENS = 90_000;
const TOKENS_PER_MINUTE = 30_000;

function estimate(dag: DagNode[], context: PlanContext): PreviewResponse['estimate'] {
  const tokens = dag.reduce((sum, n) => sum + n.estimatedTokens, ARCHITECT_TOKENS);
  const mid = tokens * MICROS_PER_TOKEN;

  const byId = new Map(dag.map((n) => [n.id, n]));
  const finish = new Map<string, number>();
  const longest = (id: string): number => {
    const known = finish.get(id);
    if (known !== undefined) return known;
    const node = byId.get(id)!;
    const start = node.dependsOn.length > 0 ? Math.max(...node.dependsOn.map(longest)) : 0;
    const end = start + Math.ceil(node.estimatedTokens / TOKENS_PER_MINUTE) + 4; // synthesis plus its gate run
    finish.set(id, end);
    return end;
  };
  const criticalPath = dag.length > 0 ? Math.max(...dag.map((n) => longest(n.id))) : 0;

  const costHighUsdMicros = Math.round(mid * 1.6);
  const remaining = Math.max(0, context.remainingBudgetUsdMicros);
  return {
    tokens,
    costLowUsdMicros: Math.round(mid * 0.7),
    costHighUsdMicros,
    durationMinutes: criticalPath + 6,
    budgetSharePercent: remaining === 0 ? 100 : Math.min(100, Math.round((costHighUsdMicros / remaining) * 1000) / 10),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** What Architect-Prime would produce for this spec. Pure: the same spec and context always give the same plan. */
export function buildPlan(dsl: EpicDsl, context: PlanContext): Plan {
  const dag = buildDag(dsl, context);
  return { title: dsl.title, contracts: contractsFor(dsl), dag, estimate: estimate(dag, context) };
}
