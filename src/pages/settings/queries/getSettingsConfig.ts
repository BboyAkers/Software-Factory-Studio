import type { IntegrationItem, GovernancePolicyConfig } from '../lib/settingsModel';

export function getDefaultIntegrations(): IntegrationItem[] {
  return [
    {
      id: 'github',
      name: 'GitHub Enterprise',
      category: 'Source Control',
      icon: 'commit',
      status: 'Connected',
      details: 'repo: synthetix-corp/pipeline-prod • Webhook Active',
      enabled: true
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude API',
      category: 'LLM Gateway',
      icon: 'neurology',
      status: 'Connected',
      details: 'Claude 3.7 Sonnet / 3.5 Sonnet / 3.5 Haiku • 94.2% Cache Hit',
      enabled: true
    },
    {
      id: 'deepseek',
      name: 'DeepSeek-V3 Gateway',
      category: 'LLM Gateway',
      icon: 'memory',
      status: 'Connected',
      details: 'High-throughput code generation fallback node',
      enabled: true
    },
    {
      id: 'firecracker',
      name: 'AWS Firecracker MicroVMs',
      category: 'Execution Sandbox',
      icon: 'terminal',
      status: 'Connected',
      details: '118ms container cold-start • Ephemeral isolation',
      enabled: true
    },
    {
      id: 'datadog',
      name: 'Datadog Telemetry APM',
      category: 'Observability',
      icon: 'insights',
      status: 'Connected',
      details: 'Real-time trace profiling and exception telemetry',
      enabled: true
    },
    {
      id: 'semgrep',
      name: 'Semgrep SAST & SBOM',
      category: 'Security Scanner',
      icon: 'security',
      status: 'Connected',
      details: 'Automated AST vulnerability & license compliance auditing',
      enabled: true
    }
  ];
}

export function getDefaultPolicies(): GovernancePolicyConfig {
  return {
    autoMergeVerifiedPRs: true,
    hardBudgetTripwire: true,
    humanInTheLoopSignoff: true,
    strictSastScan: true
  };
}
