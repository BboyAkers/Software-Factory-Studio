import React from 'react';

interface ContractVerificationPaneProps {
  activeTab: 'types' | 'tests';
  onTabChange: (tab: 'types' | 'tests') => void;
  contractTypes: string;
  contractTests: string;
}

export const ContractVerificationPane: React.FC<ContractVerificationPaneProps> = ({
  activeTab,
  onTabChange,
  contractTypes,
  contractTests
}) => {
  return (
    <div className="acrylic-card rounded-xl border border-fluent-border overflow-hidden flex flex-col justify-between">
      <div>
        <div className="px-4 py-2.5 bg-[#202020] border-b border-fluent-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[17px] text-fluent-purple">verified</span>
            <span className="text-[13px] font-semibold text-white">Synthesized Contracts</span>
          </div>

          <div className="flex items-center bg-[#181818] p-0.5 rounded border border-fluent-border text-[11px] font-mono">
            <button
              onClick={() => onTabChange('types')}
              className={`px-2.5 py-1 rounded ${
                activeTab === 'types' ? 'bg-primary text-white font-medium' : 'text-on-surface-muted hover:text-white'
              }`}
            >
              TypeScript Types
            </button>
            <button
              onClick={() => onTabChange('tests')}
              className={`px-2.5 py-1 rounded ${
                activeTab === 'tests' ? 'bg-primary text-white font-medium' : 'text-on-surface-muted hover:text-white'
              }`}
            >
              Playwright Assertions
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#141414] font-mono text-[12px] leading-relaxed max-h-[340px] overflow-y-auto">
          <pre className="text-white/80 whitespace-pre">
            {activeTab === 'types' ? contractTypes : contractTests}
          </pre>
        </div>
      </div>
    </div>
  );
};
