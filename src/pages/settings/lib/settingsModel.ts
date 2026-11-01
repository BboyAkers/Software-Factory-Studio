export interface ConnectedRepoConfig {
  repoUrl: string;
  defaultBranch: string;
  authMethod: 'pat' | 'app';
  token?: string;
  webhookEnabled: boolean;
  autoMergeEnabled: boolean;
  connectedAt?: string;
  lastSyncStatus?: 'synced' | 'syncing' | 'error';
}

export interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  status: string;
  details: string;
  enabled: boolean;
  repoConfig?: ConnectedRepoConfig;
}

export interface GovernancePolicyConfig {
  autoMergeVerifiedPRs: boolean;
  hardBudgetTripwire: boolean;
  humanInTheLoopSignoff: boolean;
  strictSastScan: boolean;
}

