import React, { useState } from 'react';

export const TelemetryAndSecurityCard: React.FC = () => {
  const [apiKeyMasked, setApiKeyMasked] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText?.('syn_live_99214_omega_enterprise_secure_token');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="acrylic-card rounded-xl p-5 border border-fluent-border flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-fluent-border/60 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-fluent-purple">vpn_key</span>
            <h2 className="text-[14px] font-semibold text-white tracking-tight">
              API Keys &amp; Telemetry Token
            </h2>
          </div>
          <span className="text-[11px] font-mono text-on-surface-muted">TLS 1.3 / mTLS</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-mono uppercase text-on-surface-muted block mb-1">
              Active Factory Swarm Token
            </label>
            <div className="flex items-center gap-2">
              <input
                type={apiKeyMasked ? 'password' : 'text'}
                readOnly
                value="syn_live_99214_omega_enterprise_secure_token"
                className="flex-1 bg-[#161616] border border-fluent-border rounded-lg px-3 py-1.5 text-[12px] font-mono text-white focus:outline-none"
              />
              <button
                onClick={() => setApiKeyMasked((prev) => !prev)}
                className="fluent-btn-default px-2.5 py-1.5 rounded-md text-[11px]"
                title="Toggle visibility"
              >
                <span className="material-symbols-outlined text-[15px]">
                  {apiKeyMasked ? 'visibility' : 'visibility_off'}
                </span>
              </button>
              <button
                onClick={handleCopy}
                className="fluent-btn-default px-2.5 py-1.5 rounded-md text-[11px] text-primary"
                title="Copy token"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-[11.5px] font-mono text-on-surface-muted space-y-1">
            <div className="flex justify-between">
              <span>Token Scope:</span>
              <span className="text-white">factory:orchestrate, gate:verify</span>
            </div>
            <div className="flex justify-between">
              <span>Expires:</span>
              <span className="text-white">In 28 days (Nov 28, 2026)</span>
            </div>
            <div className="flex justify-between">
              <span>Audit Logging:</span>
              <span className="text-fluent-success">Immutable Datadog APM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
