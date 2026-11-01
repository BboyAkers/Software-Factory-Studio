import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import type { IntegrationItem, GovernancePolicyConfig } from '../lib/settingsModel';
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

  return {
    integrations,
    policies,
    toggleIntegration,
    togglePolicy
  };
}
