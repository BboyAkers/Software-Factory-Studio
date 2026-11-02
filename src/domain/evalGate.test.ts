import { describe, expect, it } from 'vitest';
import { evaluateEval, gatedFieldsChanged } from './evalGate';
import type { AgentConfig } from '../contracts';

const base = { firstPassRate: 0.85, baselineFirstPassRate: 0.85, costPerPrUsdMicros: 1000, baselineCostPerPrUsdMicros: 1000 };

describe('eval gate: promotion thresholds (spec §7.2)', () => {
  it('passes an unchanged or improved version', () => {
    expect(evaluateEval(base)).toMatchObject({ status: 'passed', deltaFirstPassPts: 0, deltaCostPct: 0 });
    expect(evaluateEval({ ...base, firstPassRate: 0.9, costPerPrUsdMicros: 900 })).toMatchObject({ status: 'passed' });
  });

  it('fails when first-pass rate drops by more than 2 points', () => {
    const r = evaluateEval({ ...base, firstPassRate: 0.82 });
    expect(r.status).toBe('failed');
    expect(r.deltaFirstPassPts).toBe(-3);
    expect(r.reasons).toEqual([expect.stringMatching(/first-pass/i)]);
  });

  it('allows a drop of exactly 2 points, including floating-point noise', () => {
    expect(evaluateEval({ ...base, firstPassRate: 0.83 }).status).toBe('passed'); // 0.85 - 0.83 = 0.020000000000000018
    expect(evaluateEval({ ...base, firstPassRate: 0.8299 }).status).toBe('failed');
  });

  it('fails when cost per PR rises by more than 10%, and allows exactly 10%', () => {
    expect(evaluateEval({ ...base, costPerPrUsdMicros: 1100 }).status).toBe('passed');
    const r = evaluateEval({ ...base, costPerPrUsdMicros: 1101 });
    expect(r.status).toBe('failed');
    expect(r.deltaCostPct).toBeCloseTo(10.1, 1);
    expect(r.reasons).toEqual([expect.stringMatching(/cost/i)]);
  });

  it('reports both reasons when both thresholds are crossed', () => {
    const r = evaluateEval({ ...base, firstPassRate: 0.7, costPerPrUsdMicros: 2000 });
    expect(r.status).toBe('failed');
    expect(r.reasons).toHaveLength(2);
  });
});

const config = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: 'codecraft',
  role: 'Full-stack code synthesis',
  stage: 3,
  model: { primary: 'anthropic/claude-sonnet', fallbacks: ['deepseek/deepseek-v3', 'openai/gpt-4o'], reasoningEffort: 'High', temperature: 0.3, maxOutputTokens: 8000 },
  systemPrompt: 'You are CodeCraft.',
  tools: ['repo.read', 'fs.write'],
  autonomyPolicy: 'fully-autonomous',
  limits: { maxTurns: 40, maxTokensPerRun: 200000, maxWallClockSec: 1800 },
  skills: ['playwright-e2e-matrix'],
  ...over,
});

describe('which config changes need an eval', () => {
  it('gates behavioral fields: prompt, model, fallbacks, effort, temperature, tools, skills, limits', () => {
    const prev = config();
    const cases: [string, AgentConfig][] = [
      ['systemPrompt', config({ systemPrompt: 'Changed.' })],
      ['model.primary', config({ model: { ...prev.model, primary: 'anthropic/claude-opus' } })],
      ['model.fallbacks', config({ model: { ...prev.model, fallbacks: ['openai/gpt-4o', 'deepseek/deepseek-v3'] } })],
      ['model.reasoningEffort', config({ model: { ...prev.model, reasoningEffort: 'Max' } })],
      ['model.temperature', config({ model: { ...prev.model, temperature: 0.5 } })],
      ['tools', config({ tools: ['repo.read'] })],
      ['skills', config({ skills: [] })],
      ['limits.maxTurns', config({ limits: { ...prev.limits, maxTurns: 10 } })],
    ];
    for (const [field, next] of cases) {
      const r = gatedFieldsChanged(prev, next);
      expect(r.gated, field).toBe(true);
      expect(r.changed, field).toContain(field);
    }
  });

  it('does not gate an autonomy-only change but reports it as audit-only', () => {
    const r = gatedFieldsChanged(config(), config({ autonomyPolicy: 'draft-and-queue' }));
    expect(r).toEqual({ gated: false, auditOnly: true, changed: ['autonomyPolicy'] });
  });

  it('gates a combined change and still reports the autonomy change', () => {
    const r = gatedFieldsChanged(config(), config({ autonomyPolicy: 'propose-only', systemPrompt: 'x' }));
    expect(r.gated).toBe(true);
    expect(r.auditOnly).toBe(false);
    expect(r.changed).toEqual(expect.arrayContaining(['autonomyPolicy', 'systemPrompt']));
  });

  it('reports nothing for an identical config', () => {
    expect(gatedFieldsChanged(config(), config())).toEqual({ gated: false, auditOnly: false, changed: [] });
  });
});
