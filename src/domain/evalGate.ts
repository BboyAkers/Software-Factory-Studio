import type { AgentConfig } from '../contracts';

/** A version may not drop gate first-pass rate by more than this many points (spec §7.2). */
export const FIRST_PASS_REGRESSION_PTS = 2;
/** ...nor raise cost per PR by more than this percent. */
export const COST_REGRESSION_PCT = 10;

const EPSILON = 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EvalInput {
  firstPassRate: number;
  baselineFirstPassRate: number;
  costPerPrUsdMicros: number;
  baselineCostPerPrUsdMicros: number;
}

export interface EvalVerdict {
  status: 'passed' | 'failed';
  /** Negative = regression. */
  deltaFirstPassPts: number;
  /** Positive = regression. */
  deltaCostPct: number;
  reasons: string[];
}

export function evaluateEval(input: EvalInput): EvalVerdict {
  const deltaFirstPassPts = round2((input.firstPassRate - input.baselineFirstPassRate) * 100);
  const deltaCostPct =
    input.baselineCostPerPrUsdMicros > 0
      ? round2(((input.costPerPrUsdMicros - input.baselineCostPerPrUsdMicros) / input.baselineCostPerPrUsdMicros) * 100)
      : 0;

  const reasons: string[] = [];
  if (deltaFirstPassPts < -FIRST_PASS_REGRESSION_PTS - EPSILON) {
    reasons.push(`Gate first-pass rate fell ${Math.abs(deltaFirstPassPts)} pts (limit ${FIRST_PASS_REGRESSION_PTS} pts).`);
  }
  if (deltaCostPct > COST_REGRESSION_PCT + EPSILON) {
    reasons.push(`Cost per PR rose ${deltaCostPct}% (limit ${COST_REGRESSION_PCT}%).`);
  }
  return { status: reasons.length === 0 ? 'passed' : 'failed', deltaFirstPassPts, deltaCostPct, reasons };
}

const sorted = (list: readonly string[]) => [...list].sort();

/** Behavioral fields: any change needs a passing eval before promotion. Fallback order matters; tools and skills are sets. */
const GATED_FIELDS: [label: string, read: (c: AgentConfig) => unknown][] = [
  ['systemPrompt', (c) => c.systemPrompt],
  ['model.primary', (c) => c.model.primary],
  ['model.fallbacks', (c) => c.model.fallbacks],
  ['model.reasoningEffort', (c) => c.model.reasoningEffort],
  ['model.temperature', (c) => c.model.temperature],
  ['model.maxOutputTokens', (c) => c.model.maxOutputTokens],
  ['tools', (c) => sorted(c.tools)],
  ['skills', (c) => sorted(c.skills)],
  ['limits.maxTurns', (c) => c.limits.maxTurns],
  ['limits.maxTokensPerRun', (c) => c.limits.maxTokensPerRun],
  ['limits.maxWallClockSec', (c) => c.limits.maxWallClockSec],
];

export interface ConfigChange {
  /** An eval is required before this version can be promoted. */
  gated: boolean;
  /** Only the autonomy policy changed: no eval, but Maintainer-only and audited. */
  auditOnly: boolean;
  changed: string[];
}

export function gatedFieldsChanged(previous: AgentConfig, next: AgentConfig): ConfigChange {
  const changed = GATED_FIELDS.filter(([, read]) => JSON.stringify(read(previous)) !== JSON.stringify(read(next))).map(([label]) => label);
  const gated = changed.length > 0;
  const autonomyChanged = previous.autonomyPolicy !== next.autonomyPolicy;
  if (autonomyChanged) changed.push('autonomyPolicy');
  return { gated, auditOnly: !gated && autonomyChanged, changed };
}
