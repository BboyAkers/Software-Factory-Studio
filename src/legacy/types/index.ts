export type NavTab =
  | 'overview'
  | 'mission-control'
  | 'task-matrix'
  | 'live-workspace'
  | 'quality-sandboxes'
  | 'spec-studio'
  | 'fleet-tuning'
  | 'settings';

export type TaskStatus =
  | 'queued'
  | 'planning'
  | 'in-progress'
  | 'verification'
  | 'awaiting-review'
  | 'done';

export type TaskPriority = 'P0 Blocker' | 'P1 High' | 'P2 Normal';

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  reasoningEffort: 'Low' | 'Medium' | 'High' | 'Max';
  status: 'online' | 'synthesizing' | 'reviewing' | 'idle' | 'testing';
  color: string;
  avatar: string;
  initials: string;
  stage: string;
  stageIndex: number;
  systemPrompt: string;
  tokensConsumed24h: number;
  cost24h: number;
  responsibilities: string[];
  autonomyPolicy: 'fully-autonomous' | 'draft-and-queue' | 'propose-only';
  temperature: number;
}

export interface Workpack {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentId: string;
  assignedAgentName: string;
  assignedAgentInitials: string;
  branch: string;
  prNumber?: number;
  commitSha?: string;
  tokensConsumed: string;
  linesAdded: number;
  linesRemoved: number;
  filesCount: number;
  activeDiffStream?: string;
  completeness: number;
  timeActive?: string;
  phaseName?: string;
  category: string;
  verificationStatus?: string;
  targetFiles: string[];
  completedAt?: string;
}

export interface PipelineStage {
  id: number;
  title: string;
  subtitle: string;
  agentName: string;
  agentRole: string;
  status: 'completed' | 'active' | 'pending';
  duration?: string;
  metrics?: string;
}

export interface VerificationGate {
  id: string;
  index: string;
  title: string;
  description: string;
  status: 'passed' | 'running' | 'failed';
  badge: string;
  metrics: { label: string; value: string }[];
  details?: string;
}

export interface TelemetryLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'success' | 'agent' | 'error';
  tag: string;
  message: string;
  agent?: string;
}

export interface BudgetConfig {
  monthlyCap: number;
  currentSpend: number;
  softLimitPercent: number;
  hardCapPercent: number;
  slackChannel: string;
  autoThrottle: boolean;
  projectedSpend: number;
  runwayDays: number;
  runwayHours: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
}
