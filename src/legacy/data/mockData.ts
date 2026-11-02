import type {
  Agent,
  Workpack,
  PipelineStage,
  VerificationGate,
  TelemetryLog,
  BudgetConfig
} from '../types';

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'Architect-Prime',
    role: 'Chief Architect & Systems Lead',
    model: 'Claude 3.7 Sonnet',
    reasoningEffort: 'High',
    status: 'online',
    color: '#0078d4',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTpp2t-3QU9PijHmWRR1vDBFTFkC_RWwxu2U7nmPgv830gHnTsrReY7vdGKjuAj-v9mnRh_gx2aw4AAigc-3y65jUaEEN6vZiney16WQ317hoQvQWcmy24WAE1FhoIjisfpJOLltR6E1gbyvaa5hXNadOvBasiBnRGRmUiLDYyZji1_fWgzeN91yyxzZv1X-IAyXVc6fszR5ceeblSKCLihlZYjedhTy2QyLXiUWUa08BfuWOwSdiF',
    initials: 'AP',
    stage: 'Stage 1 • Decomposition',
    stageIndex: 1,
    systemPrompt:
      'You are Architect-Prime, the chief architectural coordinator of Synthetix Factory OS. Decompose PRDs and tickets into DAG workpacks. Author strict interface contracts and verify system boundary boundaries before dispatching to CodeCraft. Do not directly author application code.',
    tokensConsumed24h: 3820000,
    cost24h: 76.4,
    responsibilities: [
      'Decompose PRDs into atomic DAG workpacks',
      'Author boundary contracts & Playwright assertions',
      'Resolve cross-package dependency topological orders',
      'Direct pipeline queue priority without code authoring'
    ],
    autonomyPolicy: 'fully-autonomous',
    temperature: 0.2
  },
  {
    id: 'agent-2',
    name: 'CodeCraft',
    role: 'Full-Stack Code Synthesis Engineer',
    model: 'Claude 3.5 Sonnet',
    reasoningEffort: 'High',
    status: 'synthesizing',
    color: '#10b981',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCzBLWKXA-qGvkCuIcyc-FuP1D6IltcsIPqU6HrA9kweQF64OY-I_oJtYwAPKZL-88QJyH027a0jgfps3dzSn0FACZiSeGnScEAj3Xb3RQReZBb1V2OSJRiMkw8B-g5D-gRf_8olkM-Vi97RtLFslxrjpHwHgqTq1y-5c-KFGlwIdD8lOdy7Rxe8ndK3dxzJdJSBwjGllRsRrccwoeD925lgFm_Px2IrG8ekeCvQyfmcbLdw2mgBlUE',
    initials: 'CC',
    stage: 'Stage 2 • Synthesis',
    stageIndex: 2,
    systemPrompt:
      'You are CodeCraft, the production synthesis engine. Consume architectural contracts and write hardened TypeScript, Go, or Python code with line-by-line streaming diffs, atomic database migrations, and minimal runtime footprint.',
    tokensConsumed24h: 7420000,
    cost24h: 148.4,
    responsibilities: [
      'Synthesize production-grade application code from contracts',
      'Stream line-by-line diffs with confidence scores',
      'Generate atomic database migrations with zero-downtime guards',
      'Target < 150ms cold-start and zero bundle regressions'
    ],
    autonomyPolicy: 'fully-autonomous',
    temperature: 0.3
  },
  {
    id: 'agent-3',
    name: 'GateKeeper',
    role: 'QA & Verification Harness Engineer',
    model: 'Claude 3.5 Sonnet',
    reasoningEffort: 'Medium',
    status: 'testing',
    color: '#00b7c3',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80',
    initials: 'GK',
    stage: 'Stage 3 • Verification',
    stageIndex: 3,
    systemPrompt:
      'You are GateKeeper. Spin up isolated microVM sandboxes using Firecracker, generate Vitest and Playwright test matrices across 48 viewport variations, and guarantee zero visual regression before approving merge gates.',
    tokensConsumed24h: 2940000,
    cost24h: 58.8,
    responsibilities: [
      'Spin up ephemeral Firecracker microVM execution sandboxes',
      'Execute multi-tier Vitest unit & integration test suites',
      'Validate Playwright E2E across 48 desktop & mobile viewports',
      'Enforce zero visual drift tolerance'
    ],
    autonomyPolicy: 'fully-autonomous',
    temperature: 0.1
  },
  {
    id: 'agent-4',
    name: 'SecOps-Vanguard',
    role: 'Security & Compliance Engineer',
    model: 'Claude 3.5 Sonnet',
    reasoningEffort: 'High',
    status: 'online',
    color: '#ef4444',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=128&q=80',
    initials: 'SV',
    stage: 'Stage 4 • Security Guard',
    stageIndex: 4,
    systemPrompt:
      'You are SecOps-Vanguard. Audit all AST mutations, dependencies (SBOM), and execution boundaries for CVE vulnerabilities, secret leaks, and privilege escalations. You possess unconditional veto authority over builds.',
    tokensConsumed24h: 2150000,
    cost24h: 43.0,
    responsibilities: [
      'Perform automated Semgrep AST static analysis',
      'Scan diffs for credentials, private keys, and secrets',
      'Audit supply chain dependencies (SBOM) against CVE catalogs',
      'Hold hard veto power over merging untrusted code'
    ],
    autonomyPolicy: 'fully-autonomous',
    temperature: 0.1
  },
  {
    id: 'agent-5',
    name: 'DocuForge',
    role: 'Docs & DevEx Synthesizer',
    model: 'Claude 3.5 Haiku',
    reasoningEffort: 'Low',
    status: 'online',
    color: '#c239b3',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=128&q=80',
    initials: 'DF',
    stage: 'Stage 5 • Sync & Docs',
    stageIndex: 5,
    systemPrompt:
      'You are DocuForge. Synchronize OpenAPI/Swagger specifications, update Architecture Decision Records (ADRs), generate developer migration guides, and write concise pull request release notes.',
    tokensConsumed24h: 1220000,
    cost24h: 14.6,
    responsibilities: [
      'Synchronize OpenAPI/Swagger contracts with synthesized routes',
      'Maintain Architecture Decision Records (ADRs)',
      'Generate developer documentation and migration guides',
      'Author automated pull request changelog notes'
    ],
    autonomyPolicy: 'draft-and-queue',
    temperature: 0.4
  },
  {
    id: 'agent-6',
    name: 'SentryWatch',
    role: 'Observability & Reliability Analyst',
    model: 'Claude 3.5 Sonnet',
    reasoningEffort: 'Medium',
    status: 'online',
    color: '#8b5cf6',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=128&q=80',
    initials: 'SW',
    stage: 'Stage 6 • Reliability',
    stageIndex: 6,
    systemPrompt:
      'You are SentryWatch. Continuously monitor telemetry streams (Datadog, Grafana, Sentry), detect runtime regressions, auto-triage anomalies, and file self-healing maintenance workpacks into the Task Matrix.',
    tokensConsumed24h: 1850000,
    cost24h: 37.0,
    responsibilities: [
      'Monitor production APM metrics (latency, error rates, CPU)',
      'Detect runtime anomalies and trace root causes',
      'Triage Sentry exceptions and correlate to commits',
      'Auto-file self-healing bug tickets to Swarm intake'
    ],
    autonomyPolicy: 'fully-autonomous',
    temperature: 0.2
  }
];

export const INITIAL_WORKPACKS: Workpack[] = [
  {
    id: 'TSK-1082',
    title: 'Multi-tenant Stripe Webhook Retry Logic',
    description:
      'Implement idempotent event handling for Stripe customer subscription webhooks with exponential backoff and Redis lease locks.',
    status: 'queued',
    priority: 'P1 High',
    assignedAgentId: 'agent-2',
    assignedAgentName: 'CodeCraft',
    assignedAgentInitials: 'CC',
    branch: 'feat/stripe-webhook-retry',
    tokensConsumed: '~1.4k tok',
    linesAdded: 84,
    linesRemoved: 14,
    filesCount: 3,
    completeness: 15,
    category: 'Billing',
    targetFiles: ['src/billing/stripe.ts', 'src/billing/retry.ts', 'tests/stripe.test.ts']
  },
  {
    id: 'TSK-1088',
    title: 'OpenAPI Spec Synchronizer for v2 Endpoints',
    description:
      'Auto-generate Swagger schema from tRPC v2 router exports with schema validation and strict type safety.',
    status: 'queued',
    priority: 'P2 Normal',
    assignedAgentId: 'agent-5',
    assignedAgentName: 'DocuForge',
    assignedAgentInitials: 'DF',
    branch: 'docs/openapi-v2-sync',
    tokensConsumed: '~850 tok',
    linesAdded: 140,
    linesRemoved: 22,
    filesCount: 2,
    completeness: 10,
    category: 'Documentation',
    targetFiles: ['src/docs/openapi.ts', 'specs/v2.yaml']
  },
  {
    id: 'TSK-1094',
    title: 'Rate Limit Exponential Backoff for LLM Gateway',
    description:
      'Inject resilient fallback queues with jittered token bucket limiter when Anthropic/OpenAI rate limits return 429.',
    status: 'queued',
    priority: 'P1 High',
    assignedAgentId: 'agent-2',
    assignedAgentName: 'CodeCraft',
    assignedAgentInitials: 'CC',
    branch: 'feat/llm-gateway-backoff',
    tokensConsumed: '~2.1k tok',
    linesAdded: 112,
    linesRemoved: 18,
    filesCount: 4,
    completeness: 5,
    category: 'Infrastructure',
    targetFiles: ['src/gateway/limiter.ts', 'src/gateway/token-bucket.ts']
  },
  {
    id: 'TSK-1077',
    title: 'Granular RBAC Permission Matrix & Scope Enforcer',
    description:
      'Synthesizing boundary conditions for multi-tenant tenant isolation, JWT claims evaluation, and granular token scopes.',
    status: 'planning',
    priority: 'P0 Blocker',
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Architect-Prime',
    assignedAgentInitials: 'AP',
    branch: 'spec/granular-rbac-matrix',
    tokensConsumed: '4.2k tok',
    linesAdded: 210,
    linesRemoved: 0,
    filesCount: 5,
    phaseName: 'Phase 2/3: Contract Authoring',
    completeness: 75,
    category: 'Security',
    targetFiles: ['contracts/rbac.proto', 'src/auth/permissions.ts', 'src/auth/jwt.ts']
  },
  {
    id: 'TSK-1080',
    title: 'PostgreSQL Vector Partitioning Strategy',
    description:
      'Partitioning pgvector embedding tables by tenant cluster ID to maintain < 12ms similarity queries at scale.',
    status: 'planning',
    priority: 'P1 High',
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Architect-Prime',
    assignedAgentInitials: 'AP',
    branch: 'spec/pgvector-partitioning',
    tokensConsumed: '3.1k tok',
    linesAdded: 95,
    linesRemoved: 12,
    filesCount: 3,
    phaseName: 'Schema draft',
    completeness: 55,
    category: 'Database',
    targetFiles: ['prisma/migrations/partition.sql', 'src/db/vector.ts']
  },
  {
    id: 'TSK-1065',
    title: 'Race Condition Guard in Redis Session Cache',
    description:
      'Eliminate race condition in Redis session token invalidation via atomic CAS locks and distributed mutex synchronization.',
    status: 'in-progress',
    priority: 'P0 Blocker',
    assignedAgentId: 'agent-2',
    assignedAgentName: 'CodeCraft',
    assignedAgentInitials: 'CC',
    branch: 'feat/redis-session-cas-lock',
    commitSha: '6a89f2c',
    tokensConsumed: '3.8k tok',
    linesAdded: 48,
    linesRemoved: 12,
    filesCount: 2,
    activeDiffStream: 'session_store.ts:84-126 (atomic CAS lock)',
    timeActive: '4m 12s',
    completeness: 88,
    category: 'Core Engine',
    targetFiles: ['src/cache/session_store.ts', 'src/cache/redis.ts']
  },
  {
    id: 'TSK-1071',
    title: 'AST Transform for Next.js 15 Server Actions',
    description:
      'Automated AST code mod parsing Next.js route handlers into React 19 server actions with CSRF protection wrappers.',
    status: 'in-progress',
    priority: 'P1 High',
    assignedAgentId: 'agent-2',
    assignedAgentName: 'CodeCraft',
    assignedAgentInitials: 'CC',
    branch: 'feat/next15-server-actions-ast',
    commitSha: '9b11e40',
    tokensConsumed: '5.2k tok',
    linesAdded: 164,
    linesRemoved: 44,
    filesCount: 8,
    activeDiffStream: 'ast_transform.ts:42-98 (babel AST traverse)',
    timeActive: '2m 45s',
    completeness: 62,
    category: 'Frontend',
    targetFiles: ['src/transforms/server-action.ts', 'src/routes/api.ts']
  },
  {
    id: 'TSK-1073',
    title: 'Zero-Downtime Migration for Org Billing',
    description:
      'Dual-write database migration for enterprise billing tables with backward-compatible view abstractions.',
    status: 'in-progress',
    priority: 'P2 Normal',
    assignedAgentId: 'agent-2',
    assignedAgentName: 'CodeCraft',
    assignedAgentInitials: 'CC',
    branch: 'feat/zero-downtime-billing-mig',
    tokensConsumed: '2.9k tok',
    linesAdded: 76,
    linesRemoved: 8,
    filesCount: 3,
    activeDiffStream: 'migrate_org_billing.sql:1-76',
    timeActive: '6m 20s',
    completeness: 92,
    category: 'Database',
    targetFiles: ['prisma/migrations/dual_write.sql']
  },
  {
    id: 'TSK-1059',
    title: 'Autonomous Multi-Tenant Billing Gateway',
    description:
      'Enterprise billing gateway with Stripe webhook listener, customer ledger, and automatic proration calculation.',
    status: 'verification',
    priority: 'P1 High',
    assignedAgentId: 'agent-3',
    assignedAgentName: 'GateKeeper',
    assignedAgentInitials: 'GK',
    branch: 'feat/agentic-billing-gateway',
    prNumber: 418,
    commitSha: '8df3a1b',
    tokensConsumed: '12.4k tok',
    linesAdded: 382,
    linesRemoved: 45,
    filesCount: 9,
    completeness: 98,
    verificationStatus: '4 / 4 PASSED (100% Vitest, 0.00% Drift)',
    category: 'Billing',
    targetFiles: ['src/billing/gateway.ts', 'src/billing/ledger.ts', 'tests/billing.e2e.ts']
  },
  {
    id: 'TSK-1061',
    title: 'JWT Revocation Edge Worker',
    description:
      'Cloudflare worker validating blacklisted JWT signatures against global KV cache with sub-3ms verification.',
    status: 'verification',
    priority: 'P1 High',
    assignedAgentId: 'agent-4',
    assignedAgentName: 'SecOps-Vanguard',
    assignedAgentInitials: 'SV',
    branch: 'feat/jwt-revocation-worker',
    prNumber: 416,
    commitSha: '3c98d1a',
    tokensConsumed: '4.6k tok',
    linesAdded: 118,
    linesRemoved: 14,
    filesCount: 3,
    completeness: 75,
    verificationStatus: 'Semgrep SAST scanning (2 of 4 passed)',
    category: 'Security',
    targetFiles: ['workers/jwt.ts', 'workers/kv.ts']
  },
  {
    id: 'TSK-1049',
    title: 'SAML SSO Enterprise Handshake',
    description:
      'Okta and Microsoft Entra ID SAML 2.0 assertion consumer service with auto-provisioning JIT hooks.',
    status: 'awaiting-review',
    priority: 'P0 Blocker',
    assignedAgentId: 'agent-4',
    assignedAgentName: 'SecOps-Vanguard',
    assignedAgentInitials: 'SV',
    branch: 'feat/saml-sso-handshake',
    prNumber: 412,
    commitSha: '7f91c0e',
    tokensConsumed: '8.1k tok',
    linesAdded: 284,
    linesRemoved: 41,
    filesCount: 6,
    completeness: 100,
    verificationStatus: 'Verified by GateKeeper • Ready for Main',
    category: 'Enterprise',
    targetFiles: ['src/auth/saml.ts', 'src/auth/idp.ts']
  },
  {
    id: 'TSK-1052',
    title: 'Edge KMS Token Decryption Middleware',
    description:
      'AWS KMS envelope decryption caching layer with LRU memory limits and encrypted payload validation.',
    status: 'awaiting-review',
    priority: 'P1 High',
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Architect-Prime',
    assignedAgentInitials: 'AP',
    branch: 'feat/edge-kms-middleware',
    prNumber: 409,
    commitSha: '1a2b3c4',
    tokensConsumed: '6.5k tok',
    linesAdded: 195,
    linesRemoved: 28,
    filesCount: 4,
    completeness: 100,
    verificationStatus: 'All tests green • Signed off by SecOps',
    category: 'Infrastructure',
    targetFiles: ['src/crypto/kms.ts', 'src/crypto/envelope.ts']
  },
  {
    id: 'TSK-1108',
    title: 'Datadog Anomaly: Redis Latency Spike Auto-Triage',
    description:
      'Detected 140ms P99 latency spike in session cluster. SentryWatch captured heap dump and deployed connection pool fix.',
    status: 'done',
    priority: 'P1 High',
    assignedAgentId: 'agent-6',
    assignedAgentName: 'SentryWatch',
    assignedAgentInitials: 'SW',
    branch: 'fix/redis-conn-pool-spike',
    prNumber: 411,
    commitSha: '5c28a9b',
    tokensConsumed: '3.4k tok',
    linesAdded: 32,
    linesRemoved: 14,
    filesCount: 2,
    completeness: 100,
    completedAt: '18m ago',
    category: 'Observability',
    targetFiles: ['src/cache/pool.ts']
  },
  {
    id: 'TSK-1044',
    title: 'Async Connection Pool Rebalance',
    description:
      'Auto-tuned PostgreSQL max open connection pool based on ephemeral microVM worker cluster size.',
    status: 'done',
    priority: 'P2 Normal',
    assignedAgentId: 'agent-2',
    assignedAgentName: 'CodeCraft',
    assignedAgentInitials: 'CC',
    branch: 'fix/pg-pool-rebalance',
    prNumber: 408,
    commitSha: '4f29a0b',
    tokensConsumed: '2.1k tok',
    linesAdded: 45,
    linesRemoved: 19,
    filesCount: 1,
    completeness: 100,
    completedAt: '28m ago',
    category: 'Database',
    targetFiles: ['src/db/pool.ts']
  },
  {
    id: 'TSK-1038',
    title: 'Telemetry Log Scrubbing Pipeline',
    description:
      'Automated PII redact filter for JSON log transport before shipping to Datadog and ClickHouse.',
    status: 'done',
    priority: 'P2 Normal',
    assignedAgentId: 'agent-4',
    assignedAgentName: 'SecOps-Vanguard',
    assignedAgentInitials: 'SV',
    branch: 'feat/log-pii-scrubber',
    prNumber: 405,
    commitSha: '81b2e41',
    tokensConsumed: '4.8k tok',
    linesAdded: 112,
    linesRemoved: 16,
    filesCount: 3,
    completeness: 100,
    completedAt: '1h 10m ago',
    category: 'Compliance',
    targetFiles: ['src/logger/redact.ts']
  }
];

export const INITIAL_PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 1,
    title: 'Product Spec & Contracts',
    subtitle: 'Decomposing requirement DAG & defining boundary schemas',
    agentName: 'Architect-Prime',
    agentRole: 'Chief Architect',
    status: 'completed',
    duration: '1m 12s',
    metrics: '8 contract assertions authoring • 0 architectural drift'
  },
  {
    id: 2,
    title: 'Architecture Decomposition',
    subtitle: 'Resolving dependency graph and Playwright assertions',
    agentName: 'Architect-Prime',
    agentRole: 'Chief Architect',
    status: 'completed',
    duration: '48s',
    metrics: '4 AST files mapped • 100% boundary coverage'
  },
  {
    id: 3,
    title: 'Code Synthesis & Scaffolding',
    subtitle: 'Streaming real-time diffs, CAS atomic locks, and migrations',
    agentName: 'CodeCraft',
    agentRole: 'Lead Code Synthesizer',
    status: 'active',
    duration: '2m 14s (streaming)',
    metrics: '128 T/s • 3.8k tokens • +48 / -12 lines'
  },
  {
    id: 4,
    title: 'Verification & Security Gates',
    subtitle: 'Ephemeral microVM sandboxes, Vitest suite, Semgrep SAST',
    agentName: 'GateKeeper & SecOps',
    agentRole: 'Verification Fleet',
    status: 'pending',
    duration: 'Queue #1',
    metrics: '342 tests queued • 48 viewports'
  }
];

export const VERIFICATION_GATES_DATA: VerificationGate[] = [
  {
    id: 'gate-1',
    index: '01',
    title: 'Unit & Integration Suite',
    description: 'GateKeeper Vitest Engine • 342 tests across isolated microVM sandbox',
    status: 'passed',
    badge: '100% PASS',
    metrics: [
      { label: 'Execution', value: '1.42s' },
      { label: 'Statement Coverage', value: '94.2%' },
      { label: 'Diff Coverage', value: '100% (+2.4%)' }
    ],
    details: 'All 342 test suites executed inside Firecracker VM without failure.'
  },
  {
    id: 'gate-2',
    index: '02',
    title: 'Visual Regression & Playwright E2E',
    description: 'Zero visual drift across 48 viewport permutations (desktop, tablet, mobile)',
    status: 'passed',
    badge: '0.00% DRIFT',
    metrics: [
      { label: 'Viewports Validated', value: '48 Viewports' },
      { label: 'Browsers', value: 'Chromium • Safari • Firefox' },
      { label: 'Pixel Diff Delta', value: '0.00%' }
    ],
    details: 'Pixel-perfect match with zero layout shifts (CLS 0.000).'
  },
  {
    id: 'gate-3',
    index: '03',
    title: 'SecOps-Vanguard Security Auditor',
    description: 'Static analysis (Semgrep), AST vulnerability scans & dependency audit',
    status: 'passed',
    badge: 'SOC2 COMPLIANT',
    metrics: [
      { label: 'Vulnerabilities', value: '0 Critical / 0 High' },
      { label: 'Auto-Healed', value: '1 Low Severity' },
      { label: 'Scanned Function', value: 'findTenantsByOrg()' }
    ],
    details: 'AST validated: zero secret leakage, safe SQL parameters, sanitized inputs.'
  },
  {
    id: 'gate-4',
    index: '04',
    title: 'Performance & Bundle Benchmark',
    description: 'Turbopack build delta analysis & edge cold start emulation',
    status: 'passed',
    badge: 'WITHIN SPEC',
    metrics: [
      { label: 'Bundle Delta', value: '+4.2 kB' },
      { label: 'Cold Start', value: '142 ms' },
      { label: 'Lighthouse Score', value: '99 / 100' }
    ],
    details: 'P99 response time within SLA (24.1ms); asset payload optimal.'
  }
];

export const INITIAL_LOGS: TelemetryLog[] = [
  {
    id: 'log-1',
    timestamp: '21:34:02.120',
    level: 'info',
    tag: '[AST-DECOMP]',
    message: 'Architect-Prime resolved DAG dependency order: 4 nodes, 0 cycles.',
    agent: 'Architect-Prime'
  },
  {
    id: 'log-2',
    timestamp: '21:34:05.412',
    level: 'agent',
    tag: '[SYNTHESIS]',
    message: 'CodeCraft acquired contract schema; streaming session_store.ts diffs at 128 T/s.',
    agent: 'CodeCraft'
  },
  {
    id: 'log-3',
    timestamp: '21:34:08.890',
    level: 'info',
    tag: '[TOOL-CALL]',
    message: 'tool_call: lsp_diagnostics("src/cache/session_store.ts") -> 0 diagnostics found.',
    agent: 'CodeCraft'
  },
  {
    id: 'log-4',
    timestamp: '21:34:11.204',
    level: 'success',
    tag: '[CAS-LOCK]',
    message: 'Atomic CAS mutex lease lock compiled; Redis lease TTL bounded to 450ms.',
    agent: 'CodeCraft'
  },
  {
    id: 'log-5',
    timestamp: '21:34:14.650',
    level: 'warn',
    tag: '[MEMORY-SCAN]',
    message: 'Cluster GPU VRAM allocation at 78% (624 GB / 800 GB) - pool optimal.',
    agent: 'SentryWatch'
  },
  {
    id: 'log-6',
    timestamp: '21:34:18.014',
    level: 'info',
    tag: '[CACHE-HIT]',
    message: 'Anthropic Prompt Context Cache hit ratio verified at 94.2%.',
    agent: 'SentryWatch'
  },
  {
    id: 'log-7',
    timestamp: '21:34:21.802',
    level: 'success',
    tag: '[GATEKEEPER]',
    message: 'MicroVM sandbox boot time 118ms via Firecracker v1.4.0; ready for test run.',
    agent: 'GateKeeper'
  }
];

export const INITIAL_BUDGET: BudgetConfig = {
  monthlyCap: 5000,
  currentSpend: 3840,
  softLimitPercent: 80,
  hardCapPercent: 100,
  slackChannel: '#eng-ops-synthetix',
  autoThrottle: true,
  projectedSpend: 4910,
  runwayDays: 11,
  runwayHours: 4
};
