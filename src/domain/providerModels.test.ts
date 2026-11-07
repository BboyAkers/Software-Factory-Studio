import { beforeEach, describe, expect, it } from 'vitest';
import {
  KNOWN_AGENT_IDS,
  PROVIDER_MODELS,
  activateProviderForProject,
  commitSavedModelsForProject,
  defaultModelForAgent,
  getModelsForProvider,
   providerGatewayStore,
  resetProviderGatewayStore,
  resolveActiveProvider,
  selectAgentModelForProject,
} from './providerModels';

describe('providerModels — dynamic fleet model loading by provider', () => {
  beforeEach(() => {
    resetProviderGatewayStore();
  });

  it('loads distinct model lineups for Anthropic, OpenAI, and DeepSeek', () => {
    expect(getModelsForProvider('anthropic').map((m) => m.shortLabel)).toEqual([
      'Opus',
      'Sonnet',
      'Sonnet 3.7',
      'Haiku',
    ]);
    expect(getModelsForProvider('openai').map((m) => m.shortLabel)).toEqual([
      'o3',
      'GPT-4.1',
      'GPT-4o',
      '4o-mini',
    ]);
    expect(getModelsForProvider('deepseek').map((m) => m.shortLabel)).toEqual([
      'R1',
      'V3',
      'Coder',
      'V3-Lite',
    ]);
  });

  it('dynamically switches available models and agent assignments when OpenAI key is saved', () => {
    activateProviderForProject('proj-1', 'openai');
    const state = providerGatewayStore.get();

    expect(resolveActiveProvider('proj-1', undefined, undefined, state)).toBe('openai');
    const selected = state.selectedModelByProject['proj-1']!;
    expect(selected['architect-prime']).toBe('openai/o3');
    expect(selected['codecraft']).toBe('openai/gpt-4.1');
    expect(selected['gatekeeper']).toBe('openai/gpt-4o');
    expect(selected['secops-vanguard']).toBe('openai/o3');
    expect(selected['docuforge']).toBe('openai/gpt-4o-mini');
    expect(selected['sentrywatch']).toBe('openai/gpt-4o');

    for (const id of KNOWN_AGENT_IDS) {
      expect(PROVIDER_MODELS.openai.some((m) => m.id === selected[id])).toBe(true);
    }
  });

  it('dynamically switches available models and agent assignments when DeepSeek key is saved', () => {
    activateProviderForProject('proj-1', 'deepseek');
    const state = providerGatewayStore.get();

    expect(resolveActiveProvider('proj-1', undefined, undefined, state)).toBe('deepseek');
    const selected = state.selectedModelByProject['proj-1']!;
    expect(selected['architect-prime']).toBe('deepseek/deepseek-r1');
    expect(selected['codecraft']).toBe('deepseek/deepseek-coder');
    expect(selected['gatekeeper']).toBe('deepseek/deepseek-v3');
    expect(selected['secops-vanguard']).toBe('deepseek/deepseek-r1');
    expect(selected['docuforge']).toBe('deepseek/deepseek-lite');
    expect(selected['sentrywatch']).toBe('deepseek/deepseek-v3');

    for (const id of KNOWN_AGENT_IDS) {
      expect(PROVIDER_MODELS.deepseek.some((m) => m.id === selected[id])).toBe(true);
    }
  });

  it('dynamically switches available models and agent assignments when Anthropic key is saved', () => {
    activateProviderForProject('proj-1', 'openai');
    activateProviderForProject('proj-1', 'anthropic');
    const state = providerGatewayStore.get();

    expect(resolveActiveProvider('proj-1', undefined, undefined, state)).toBe('anthropic');
    const selected = state.selectedModelByProject['proj-1']!;
    expect(selected['architect-prime']).toBe('anthropic/claude-opus');
    expect(selected['codecraft']).toBe('anthropic/claude-sonnet');
    expect(selected['docuforge']).toBe('anthropic/claude-haiku');
  });

  it('allows selecting and committing per-agent models within the active provider', () => {
    activateProviderForProject('proj-1', 'openai');
    selectAgentModelForProject('proj-1', 'codecraft', 'openai/o3');

    expect(providerGatewayStore.get().selectedModelByProject['proj-1']?.['codecraft']).toBe('openai/o3');
    expect(providerGatewayStore.get().savedModelByProject['proj-1']?.['codecraft']).toBe('openai/gpt-4.1');

    commitSavedModelsForProject('proj-1', { codecraft: 'openai/o3' });
    expect(providerGatewayStore.get().savedModelByProject['proj-1']?.['codecraft']).toBe('openai/o3');
  });

  it('resolves active provider from integration lastVerifiedAt when store is empty', () => {
    const integrations = [
      {
        id: 'anthropic' as const,
        name: 'Anthropic',
        category: 'Model provider' as const,
        status: 'connected' as const,
        enabled: true,
        details: '',
        lastVerifiedAt: '2026-11-06T10:00:00.000Z',
        webhookUrl: null,
      },
      {
        id: 'openai' as const,
        name: 'OpenAI',
        category: 'Model provider' as const,
        status: 'connected' as const,
        enabled: true,
        details: '',
        lastVerifiedAt: '2026-11-06T12:00:00.000Z',
        webhookUrl: null,
      },
    ];

    expect(resolveActiveProvider('proj-2', integrations)).toBe('openai');
    expect(defaultModelForAgent('architect-prime', 'openai').pinnedModel).toBe('o3-2025-04-16');
  });
});

