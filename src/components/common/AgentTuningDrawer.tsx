import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const AgentTuningDrawer: React.FC = () => {
  const {
    isAgentDrawerOpen,
    closeAgentDrawer,
    selectedAgent,
    updateAgent,
    addToast
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'prompt' | 'skills' | 'autonomy' | 'metrics'>('prompt');
  const [model, setModel] = useState(selectedAgent?.model || 'Claude 3.5 Sonnet');
  const [reasoningEffort, setReasoningEffort] = useState<'Low' | 'Medium' | 'High' | 'Max'>(
    selectedAgent?.reasoningEffort || 'High'
  );
  const [systemPrompt, setSystemPrompt] = useState(selectedAgent?.systemPrompt || '');
  const [autonomyPolicy, setAutonomyPolicy] = useState(
    selectedAgent?.autonomyPolicy || 'fully-autonomous'
  );
  const [temperature, setTemperature] = useState(selectedAgent?.temperature ?? 0.2);

  // Sync state if selectedAgent changes
  React.useEffect(() => {
    if (selectedAgent) {
      setModel(selectedAgent.model);
      setReasoningEffort(selectedAgent.reasoningEffort);
      setSystemPrompt(selectedAgent.systemPrompt);
      setAutonomyPolicy(selectedAgent.autonomyPolicy);
      setTemperature(selectedAgent.temperature);
    }
  }, [selectedAgent]);

  if (!isAgentDrawerOpen || !selectedAgent) return null;

  const handleDeploy = () => {
    updateAgent(selectedAgent.id, {
      model,
      reasoningEffort,
      systemPrompt,
      autonomyPolicy,
      temperature
    });
    addToast({
      type: 'success',
      title: 'Agent Parameters Deployed',
      message: `${selectedAgent.name} updated with model ${model} (${reasoningEffort} reasoning).`
    });
    closeAgentDrawer();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={closeAgentDrawer}
      ></div>

      {/* Drawer */}
      <aside className="relative w-full max-w-lg bg-[#242424] border-l border-fluent-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 px-5 flex items-center justify-between bg-[#202020] border-b border-fluent-border shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-[12px] shadow-sm"
              style={{ backgroundColor: selectedAgent.color }}
            >
              {selectedAgent.initials}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-white">{selectedAgent.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-fluent-success-subtle text-fluent-success border border-fluent-success/20 font-semibold uppercase">
                  {selectedAgent.status}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-muted">{selectedAgent.role}</span>
            </div>
          </div>

          <button
            onClick={closeAgentDrawer}
            className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center border-b border-fluent-border bg-[#212121] px-4 text-[12px]">
          <button
            onClick={() => setActiveSubTab('prompt')}
            className={`py-2 px-3 font-medium transition-colors border-b-2 ${
              activeSubTab === 'prompt'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-white'
            }`}
          >
            System Prompt
          </button>
          <button
            onClick={() => setActiveSubTab('skills')}
            className={`py-2 px-3 font-medium transition-colors border-b-2 ${
              activeSubTab === 'skills'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-white'
            }`}
          >
            Skills &amp; Capabilities
          </button>
          <button
            onClick={() => setActiveSubTab('autonomy')}
            className={`py-2 px-3 font-medium transition-colors border-b-2 ${
              activeSubTab === 'autonomy'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-white'
            }`}
          >
            Autonomy Policy
          </button>
          <button
            onClick={() => setActiveSubTab('metrics')}
            className={`py-2 px-3 font-medium transition-colors border-b-2 ${
              activeSubTab === 'metrics'
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-on-surface-variant hover:text-white'
            }`}
          >
            Telemetry
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 bg-[#202020]">
          {/* Model Family & Reasoning Effort Selectors */}
          <div className="p-3.5 rounded-lg bg-[#262626] border border-fluent-border flex flex-col gap-3">
            <div>
              <label className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider block mb-1.5">
                Model Family Selection
              </label>
              <div className="grid grid-cols-4 gap-1.5 bg-[#1b1b1b] p-1 rounded-md text-[11.5px] font-mono">
                {['Claude 3.7 Sonnet', 'Claude 3.5 Sonnet', 'Claude 3.5 Haiku', 'DeepSeek-V3'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={`py-1.5 px-1 rounded text-center truncate transition-colors ${
                      model === m
                        ? 'bg-primary text-white font-semibold shadow-sm'
                        : 'text-on-surface-variant hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {m.replace('Claude ', '')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider block mb-1.5">
                Reasoning Effort (Compute Allocation)
              </label>
              <div className="grid grid-cols-4 gap-1.5 bg-[#1b1b1b] p-1 rounded-md text-[11.5px] font-mono">
                {(['Low', 'Medium', 'High', 'Max'] as const).map((effort) => (
                  <button
                    key={effort}
                    type="button"
                    onClick={() => setReasoningEffort(effort)}
                    className={`py-1 rounded text-center transition-colors ${
                      reasoningEffort === effort
                        ? 'bg-fluent-blue text-white font-semibold'
                        : 'text-on-surface-variant hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {effort}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] text-on-surface-variant mb-1">
                <span>Sampling Temperature</span>
                <span className="font-mono text-primary">{temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full h-1.5 bg-[#333333] rounded-full appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          {/* SubTab 1: System Prompt Editor */}
          {activeSubTab === 'prompt' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
                  Instruction System Prompt
                </label>
                <span className="text-[10.5px] font-mono text-primary">Live Context Active</span>
              </div>
              <textarea
                rows={8}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full bg-[#181818] border border-white/10 rounded-md p-3 text-[12px] font-mono text-white leading-relaxed focus:outline-none focus:border-primary resize-none"
              />
              <div className="text-[11px] text-on-surface-muted">
                Define boundaries, allowable tool calls, and output formatting expectations.
              </div>
            </div>
          )}

          {/* SubTab 2: Skills & Capabilities */}
          {activeSubTab === 'skills' && (
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
                Installed Capabilities &amp; Skill Plugins
              </span>

              {[
                { name: 'ast-semgrep-linter', desc: 'Abstract Syntax Tree AST security inspection', active: true },
                { name: 'playwright-e2e-matrix', desc: 'Multi-viewport test generator across 48 viewports', active: true },
                { name: 'openapi-contract-sync', desc: 'Automatic swagger schema extractor from tRPC routers', active: true },
                { name: 'redis-cas-guard', desc: 'Distributed atomic compare-and-swap mutex lease harness', active: true },
                { name: 'memory-leak-profiler', desc: 'V8 heap snapshot diagnostic parser', active: false }
              ].map((skill) => (
                <div
                  key={skill.name}
                  className="p-3 rounded-md bg-[#252525] border border-white/5 flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-[12px] text-white font-medium">{skill.name}</span>
                    <span className="text-[11px] text-on-surface-muted">{skill.desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    defaultChecked={skill.active}
                    className="w-4 h-4 rounded text-primary accent-primary"
                  />
                </div>
              ))}

              <button className="fluent-btn-default py-2 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 mt-2">
                <span className="material-symbols-outlined text-[16px]">upload_file</span>
                <span>Upload Custom Agent Skill</span>
              </button>
            </div>
          )}

          {/* SubTab 3: Autonomy Policy */}
          {activeSubTab === 'autonomy' && (
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-semibold text-on-surface-muted uppercase tracking-wider">
                Autonomy Boundary &amp; Merge Policy
              </span>

              {[
                {
                  id: 'fully-autonomous',
                  title: 'Fully Autonomous',
                  desc: 'Can synthesize code, execute unit tests in microVM, and auto-merge PR if all 4 verification gates pass.'
                },
                {
                  id: 'draft-and-queue',
                  title: 'Draft & Queue for Review',
                  desc: 'Generates PR and runs test verification, but halts before merge awaiting Staff Architect sign-off.'
                },
                {
                  id: 'propose-only',
                  title: 'Propose-Only (Read-Only)',
                  desc: 'Outputs speculative diffs and architecture contracts without modifying git repositories.'
                }
              ].map((policy) => (
                <label
                  key={policy.id}
                  className={`p-3 rounded-lg border cursor-pointer flex items-start gap-3 transition-colors ${
                    autonomyPolicy === policy.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-[#252525] border-white/5 hover:border-white/15'
                  }`}
                >
                  <input
                    type="radio"
                    name="autonomyPolicy"
                    checked={autonomyPolicy === policy.id}
                    onChange={() => setAutonomyPolicy(policy.id as any)}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-white">{policy.title}</span>
                    <span className="text-[11.5px] text-on-surface-variant leading-relaxed mt-0.5">
                      {policy.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* SubTab 4: Telemetry Metrics */}
          {activeSubTab === 'metrics' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#252525] border border-white/5 flex flex-col">
                  <span className="text-[10.5px] text-on-surface-muted uppercase">24h Tokens</span>
                  <span className="text-[18px] font-bold text-white font-mono mt-1">
                    {(selectedAgent.tokensConsumed24h / 1000000).toFixed(2)}M
                  </span>
                  <span className="text-[10px] text-fluent-success">Optimal cache ratio</span>
                </div>
                <div className="p-3 rounded-lg bg-[#252525] border border-white/5 flex flex-col">
                  <span className="text-[10.5px] text-on-surface-muted uppercase">24h Compute Spend</span>
                  <span className="text-[18px] font-bold text-primary font-mono mt-1">
                    ${selectedAgent.cost24h.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-on-surface-muted">Within budget runway</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#252525] border border-white/5 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-white">Core Specialist Responsibilities</span>
                <ul className="list-disc pl-4 space-y-1 text-[11.5px] text-on-surface-variant">
                  {selectedAgent.responsibilities.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#202020] border-t border-fluent-border flex items-center justify-between">
          <button
            onClick={closeAgentDrawer}
            className="px-3.5 py-1.5 rounded-md text-[12.5px] text-on-surface-variant hover:text-white hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            className="fluent-btn-primary px-4 py-1.5 rounded-md text-[12.5px] font-semibold flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Deploy Parameters</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
