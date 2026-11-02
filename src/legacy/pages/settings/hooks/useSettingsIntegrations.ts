import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import type { IntegrationItem, GovernancePolicyConfig, ConnectedRepoConfig } from '../lib/settingsModel';
import { getDefaultIntegrations, getDefaultPolicies } from '../queries/getSettingsConfig';
import { useToggleIntegrationMutation } from '../mutations/useToggleIntegrationMutation';

export function useSettingsIntegrations() {
  const { addToast } = useApp();

  const [integrations, setIntegrations] = useState<IntegrationItem[]>(getDefaultIntegrations());
  const [policies, setPolicies] = useState<GovernancePolicyConfig>(getDefaultPolicies());

  const { toggle } = useToggleIntegrationMutation(addToast);

  const toggleIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const next = toggle(item.id, item.name, item.enabled);
          return {
            ...item,
            enabled: next,
            status: next ? 'Connected' : 'Paused'
          };
        }
        return item;
      })
    );
  };

  const togglePolicy = (key: keyof GovernancePolicyConfig) => {
    setPolicies((prev) => {
      const next = !prev[key];
      addToast({
        type: 'info',
        title: 'Policy Updated',
        message: `${String(key)} rule toggled to ${next ? 'Enforced' : 'Advisory'}.`
      });
      return { ...prev, [key]: next };
    });
  };

  const updateGitHubRepo = (repoConfig: ConnectedRepoConfig) => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.id === 'github') {
          return {
            ...item,
            enabled: true,
            status: 'Connected',
            details: `repo: ${repoConfig.repoUrl} • branch: ${repoConfig.defaultBranch} • Webhook ${repoConfig.webhookEnabled ? 'Active' : 'Disabled'}`,
            repoConfig
          };
        }
        return item;
      })
    );
    addToast({
      type: 'success',
      title: 'GitHub Repository Connected',
      message: `Repository ${repoConfig.repoUrl} linked successfully (branch: ${repoConfig.defaultBranch}). Swarm agents are now synchronized.`
    });
  };

  return {
    integrations,
    policies,
    toggleIntegration,
    togglePolicy,
    updateGitHubRepo
  };
};
