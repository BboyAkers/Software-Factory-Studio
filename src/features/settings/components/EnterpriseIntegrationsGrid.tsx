import React from 'react';
import type { IntegrationItem } from '../lib/settingsModel';

interface EnterpriseIntegrationsGridProps {
  integrations: IntegrationItem[];
  onToggle: (id: string) => void;
}

export const EnterpriseIntegrationsGrid: React.FC<EnterpriseIntegrationsGridProps> = ({
  integrations,
  onToggle
}) => {
  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border">
      <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-white tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-primary">hub</span>
            Enterprise Gateways &amp; Core Connectors
          </h2>
          <p className="text-[12px] text-on-surface-variant mt-0.5">
            Manage continuous integration webhooks, LLM gateway credentials, and sandbox telemetry
          </p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-fluent-success-subtle text-fluent-success border border-fluent-success/20">
          6 Active Integrations
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-lg bg-black/20 border border-white/5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold text-white">{item.name}</div>
                    <div className="text-[11px] text-on-surface-muted font-mono">{item.category}</div>
                  </div>
                </div>

                <button
                  onClick={() => onToggle(item.id)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                    item.enabled ? 'bg-primary' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      item.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="text-[11.5px] text-on-surface-variant font-mono bg-white/[0.02] p-2 rounded border border-white/5 truncate">
                {item.details}
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
              <span
                className={`flex items-center gap-1 font-medium ${
                  item.enabled ? 'text-fluent-success' : 'text-on-surface-muted'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    item.enabled ? 'bg-fluent-success' : 'bg-on-surface-muted'
                  }`}
                />
                {item.status}
              </span>
              <button
                onClick={() => alert(`Configured settings for ${item.name}`)}
                className="text-primary hover:underline text-[11.5px] font-sans"
              >
                Configure
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
