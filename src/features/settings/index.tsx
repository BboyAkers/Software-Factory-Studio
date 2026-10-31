import React from 'react';
import { useSettingsIntegrations } from './hooks/useSettingsIntegrations';
import { EnterpriseIntegrationsGrid } from './components/EnterpriseIntegrationsGrid';
import { GovernancePoliciesCard } from './components/GovernancePoliciesCard';
import { TelemetryAndSecurityCard } from './components/TelemetryAndSecurityCard';

export const SettingsPage: React.FC = () => {
  const {
    integrations,
    policies,
    toggleIntegration,
    togglePolicy
  } = useSettingsIntegrations();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-6 max-w-[1600px] mx-auto pb-16">
        {/* Top Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            <span className="text-primary font-mono">SYNTHETIX-CORE</span>
            <span className="text-on-surface-muted">/</span>
            <span>ENTERPRISE-SETTINGS</span>
            <span className="text-on-surface-muted">/</span>
            <span className="text-fluent-success flex items-center gap-1 font-semibold font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-fluent-success animate-pulse"></span>
              FEDERATED MESH
            </span>
          </div>
          <h1 className="text-[22px] text-white tracking-tight font-semibold flex items-center gap-2.5">
            Settings &amp; Autonomous Governance
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-on-surface-variant border border-fluent-border font-mono font-normal">
              policy-v2.4
            </span>
          </h1>
          <p className="text-[12.5px] text-on-surface-variant">
            Infrastructure gateways, model API keys, deterministic security tripwires, and enterprise policies
          </p>
        </div>

        {/* Enterprise Integrations Grid */}
        <EnterpriseIntegrationsGrid
          integrations={integrations}
          onToggle={toggleIntegration}
        />

        {/* Lower Row: Safety Policies & Security Keys */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <GovernancePoliciesCard
            policies={policies}
            onTogglePolicy={togglePolicy}
          />

          <TelemetryAndSecurityCard />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
