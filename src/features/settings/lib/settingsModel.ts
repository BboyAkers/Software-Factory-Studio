export interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  status: string;
  details: string;
  enabled: boolean;
}

export interface GovernancePolicyConfig {
  autoMergeVerifiedPRs: boolean;
  hardBudgetTripwire: boolean;
  humanInTheLoopSignoff: boolean;
  strictSastScan: boolean;
}
