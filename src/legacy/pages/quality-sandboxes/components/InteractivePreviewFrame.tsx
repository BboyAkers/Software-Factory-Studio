import React from 'react';

interface InteractivePreviewFrameProps {
  device: 'desktop' | 'tablet' | 'mobile';
  onDeviceChange: (device: 'desktop' | 'tablet' | 'mobile') => void;
  activePlan: 'pro' | 'enterprise';
  onPlanChange: (plan: 'pro' | 'enterprise') => void;
  viewportWidthClass: string;
}

export const InteractivePreviewFrame: React.FC<InteractivePreviewFrameProps> = ({
  device,
  onDeviceChange,
  activePlan,
  onPlanChange,
  viewportWidthClass
}) => {
  return (
    <div className="acrylic-card rounded-xl border border-fluent-border overflow-hidden flex flex-col justify-between">
      {/* Viewport bar */}
      <div className="px-4 py-2.5 bg-[#202020] border-b border-fluent-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[17px] text-primary">devices</span>
          <span className="text-[12.5px] font-semibold text-white">Live Synthetic Sandbox Viewport</span>
        </div>

        {/* Device Switcher */}
        <div className="flex items-center bg-[#181818] p-0.5 rounded border border-fluent-border text-[11px] font-mono">
          <button
            onClick={() => onDeviceChange('desktop')}
            className={`px-2.5 py-1 rounded flex items-center gap-1 ${
              device === 'desktop' ? 'bg-primary text-white font-medium' : 'text-on-surface-muted hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">desktop_windows</span>
            <span>Desktop</span>
          </button>
          <button
            onClick={() => onDeviceChange('tablet')}
            className={`px-2.5 py-1 rounded flex items-center gap-1 ${
              device === 'tablet' ? 'bg-primary text-white font-medium' : 'text-on-surface-muted hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">tablet_mac</span>
            <span>Tablet</span>
          </button>
          <button
            onClick={() => onDeviceChange('mobile')}
            className={`px-2.5 py-1 rounded flex items-center gap-1 ${
              device === 'mobile' ? 'bg-primary text-white font-medium' : 'text-on-surface-muted hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">smartphone</span>
            <span>Mobile</span>
          </button>
        </div>
      </div>

      {/* Synthetic UI Simulation */}
      <div className="p-6 bg-[#161616] flex justify-center items-center min-h-[380px]">
        <div
          className={`w-full ${viewportWidthClass} transition-all duration-300 bg-[#222222] rounded-xl border border-fluent-border p-6 shadow-2xl flex flex-col gap-4`}
        >
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <div className="text-[11px] font-mono text-primary font-bold uppercase">SYNTHETIX BILLING</div>
              <h2 className="text-[16px] font-semibold text-white">Subscription Management</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPlanChange('pro')}
                className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-all ${
                  activePlan === 'pro' ? 'bg-primary text-white' : 'bg-white/5 text-on-surface-muted'
                }`}
              >
                Pro Tier
              </button>
              <button
                onClick={() => onPlanChange('enterprise')}
                className={`px-3 py-1 rounded text-[11px] font-semibold font-mono transition-all ${
                  activePlan === 'enterprise' ? 'bg-fluent-purple text-white' : 'bg-white/5 text-on-surface-muted'
                }`}
              >
                Enterprise Tier
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div className="p-3 rounded-lg bg-black/30 border border-white/5">
              <div className="text-on-surface-muted text-[11px]">Active Plan</div>
              <div className="text-[15px] font-bold text-white capitalize mt-0.5">{activePlan} Subscription</div>
              <div className="text-primary font-mono text-[11px] mt-1">$2,400 / month / seat</div>
            </div>

            <div className="p-3 rounded-lg bg-black/30 border border-white/5">
              <div className="text-on-surface-muted text-[11px]">SAML &amp; SCIM Provisioning</div>
              <div className="text-[14px] font-bold text-fluent-success flex items-center gap-1 mt-0.5">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                Deterministic Token Passed
              </div>
              <div className="text-on-surface-muted text-[11px] mt-1">Audit log ID: #sec-89104</div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-fluent-success/10 border border-fluent-success/20 text-fluent-success text-[12px] flex items-center gap-2">
            <span className="material-symbols-outlined text-[17px]">check_circle</span>
            <span>Zero regression detected across 48 viewport permutations.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
