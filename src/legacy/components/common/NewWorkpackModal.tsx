import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { TaskPriority, TaskStatus } from '../../types';

export const NewWorkpackModal: React.FC = () => {
  const { isNewWorkpackModalOpen, setIsNewWorkpackModalOpen, agents, addWorkpack } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('P1 High');
  const [assignedAgentId, setAssignedAgentId] = useState(agents[1]?.id || 'agent-2');
  const [branch, setBranch] = useState('feat/new-autonomous-workpack');
  const [category, setCategory] = useState('Core Engine');
  const [targetFilesInput, setTargetFilesInput] = useState('src/billing/service.ts, src/types.ts');

  if (!isNewWorkpackModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const assignedAgent = agents.find((a) => a.id === assignedAgentId) || agents[0];
    const targetFiles = targetFilesInput
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    addWorkpack({
      title: title.trim(),
      description: description.trim() || 'Autonomous engineering workpack dispatched to swarm.',
      status: 'queued' as TaskStatus,
      priority,
      assignedAgentId: assignedAgent.id,
      assignedAgentName: assignedAgent.name,
      assignedAgentInitials: assignedAgent.initials,
      branch: branch.trim() || 'feat/swarm-task',
      tokensConsumed: '~1.8k tok',
      targetFiles: targetFiles.length > 0 ? targetFiles : ['src/main.ts'],
      category
    });

    setIsNewWorkpackModalOpen(false);
    setTitle('');
    setDescription('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-[#242424] rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#282828] border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#0078d4]/20 text-[#118dff] border border-[#0078d4]/40 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[19px]">add_task</span>
            </div>
            <div className="flex flex-col">
              <h3 className="text-[15px] font-semibold text-white leading-tight">
                New Workpack Specification
              </h3>
              <span className="text-[11px] text-on-surface-muted">
                Dispatch an engineering task to the autonomous specialist fleet
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsNewWorkpackModalOpen(false)}
            className="w-7 h-7 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5 bg-[#202020]">
          <div>
            <label className="text-[11.5px] font-medium text-white/80 block mb-1">
              Workpack Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Idempotent Redis Lease Token Invalidation"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#1c1c1c] border border-white/15 rounded px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11.5px] font-medium text-white/80 block mb-1">
                Priority Tier
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-[#1c1c1c] border border-white/15 rounded px-2.5 py-1.5 text-[12.5px] text-white focus:outline-none focus:border-primary"
              >
                <option value="P0 Blocker">P0 Blocker (Immediate)</option>
                <option value="P1 High">P1 High (Standard)</option>
                <option value="P2 Normal">P2 Normal (Backlog)</option>
              </select>
            </div>

            <div>
              <label className="text-[11.5px] font-medium text-white/80 block mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#1c1c1c] border border-white/15 rounded px-2.5 py-1.5 text-[12.5px] text-white focus:outline-none focus:border-primary"
              >
                <option value="Core Engine">Core Engine</option>
                <option value="Billing">Billing &amp; Payments</option>
                <option value="Security">Security &amp; Auth</option>
                <option value="Infrastructure">Infrastructure</option>
                <option value="Database">Database Migration</option>
                <option value="Documentation">Documentation</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11.5px] font-medium text-white/80 block mb-1">
                Assigned Specialist
              </label>
              <select
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value)}
                className="w-full bg-[#1c1c1c] border border-white/15 rounded px-2.5 py-1.5 text-[12.5px] text-white focus:outline-none focus:border-primary"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.initials})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11.5px] font-medium text-white/80 block mb-1">
                Git Branch
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-[#1c1c1c] border border-white/15 rounded px-2.5 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-[11.5px] font-medium text-white/80 block mb-1">
              Target Source Files (comma-separated)
            </label>
            <input
              type="text"
              value={targetFilesInput}
              onChange={(e) => setTargetFilesInput(e.target.value)}
              className="w-full bg-[#1c1c1c] border border-white/15 rounded px-3 py-1.5 text-[12px] font-mono text-white focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-[11.5px] font-medium text-white/80 block mb-1">
              Specification Description &amp; Constraints
            </label>
            <textarea
              rows={3}
              placeholder="Outline the architectural requirements, boundary types, and verification test conditions..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#1c1c1c] border border-white/15 rounded px-3 py-2 text-[12.5px] text-white focus:outline-none focus:border-primary resize-none leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsNewWorkpackModalOpen(false)}
              className="px-3 py-1.5 rounded-md text-[12.5px] text-on-surface-variant hover:text-white hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fluent-btn-primary px-4 py-1.5 rounded-md text-[12.5px] font-semibold flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
              <span>Dispatch to Swarm</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
