export type SpecMode = 'feature' | 'refactor' | 'bug' | 'security';

export interface SpecDecomposedTask {
  id: string;
  title: string;
  targetFile: string;
  agentRole: string;
  complexity: 'Low' | 'Medium' | 'High';
  estimatedTokens: string;
}

export const DECOMPOSED_TASKS: SpecDecomposedTask[] = [
  {
    id: 'TASK-1',
    title: 'PostgreSQL RBAC Enum Migration & Soft-Delete',
    targetFile: 'prisma/schema.prisma',
    agentRole: 'Architect-Prime',
    complexity: 'Medium',
    estimatedTokens: '~1.8k'
  },
  {
    id: 'TASK-2',
    title: 'tRPC Tenancy Authorization Middleware',
    targetFile: 'src/trpc/roles.ts',
    agentRole: 'SWE-Autopilot',
    complexity: 'High',
    estimatedTokens: '~4.2k'
  },
  {
    id: 'TASK-3',
    title: 'Playwright Multi-Tenant Role Matrix Test',
    targetFile: 'tests/e2e/roles.spec.ts',
    agentRole: 'QA-Sentinel',
    complexity: 'Medium',
    estimatedTokens: '~2.4k'
  }
];
