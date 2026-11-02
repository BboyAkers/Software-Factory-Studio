import React, { createContext, useContext, useState, useEffect } from 'react';
import type {
  NavTab,
  Agent,
  Workpack,
  TaskStatus,
  PipelineStage,
  VerificationGate,
  TelemetryLog,
  BudgetConfig,
  ToastMessage
} from '../types';
import {
  INITIAL_AGENTS,
  INITIAL_WORKPACKS,
  INITIAL_PIPELINE_STAGES,
  VERIFICATION_GATES_DATA,
  INITIAL_LOGS,
  INITIAL_BUDGET
} from '../data/mockData';

interface AppContextType {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;
  agents: Agent[];
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  selectedAgent: Agent | null;
  setSelectedAgent: (agent: Agent | null) => void;
  isAgentDrawerOpen: boolean;
  openAgentDrawer: (agentId: string) => void;
  closeAgentDrawer: () => void;
  workpacks: Workpack[];
  addWorkpack: (
    workpack: Omit<Workpack, 'id' | 'completeness' | 'linesAdded' | 'linesRemoved' | 'filesCount'>
  ) => void;
  updateWorkpackStatus: (id: string, newStatus: TaskStatus) => void;
  selectedWorkpack: Workpack | null;
  setSelectedWorkpack: (workpack: Workpack | null) => void;
  isTaskDrawerOpen: boolean;
  openTaskDrawer: (taskId: string) => void;
  closeTaskDrawer: () => void;
  pipelineStages: PipelineStage[];
  isPipelinePaused: boolean;
  togglePausePipeline: () => void;
  streamedTokens: number;
  steerAgentPrompt: string;
  setSteerAgentPrompt: (prompt: string) => void;
  injectSteeringHint: (hintText: string) => void;
  steeringHintsHistory: string[];
  verificationGates: VerificationGate[];
  promoteReleaseCandidate: () => void;
  rollbackReleaseCandidate: () => void;
  isReleasePromoted: boolean;
  budget: BudgetConfig;
  updateBudget: (updates: Partial<BudgetConfig>) => void;
  isBudgetModalOpen: boolean;
  setIsBudgetModalOpen: (open: boolean) => void;
  isNewWorkpackModalOpen: boolean;
  setIsNewWorkpackModalOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  logs: TelemetryLog[];
  addLog: (log: Omit<TelemetryLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  gpuMemory: number;
  contextHit: number;
  throughput: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);

  const [workpacks, setWorkpacks] = useState<Workpack[]>(INITIAL_WORKPACKS);
  const [selectedWorkpack, setSelectedWorkpack] = useState<Workpack | null>(null);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);

  const [pipelineStages] = useState<PipelineStage[]>(INITIAL_PIPELINE_STAGES);
  const [isPipelinePaused, setIsPipelinePaused] = useState(false);
  const [streamedTokens, setStreamedTokens] = useState(3842);
  const [steerAgentPrompt, setSteerAgentPrompt] = useState('');
  const [steeringHintsHistory, setSteeringHintsHistory] = useState<string[]>([
    'Enforce CAS lease duration < 450ms for multi-region Redis sync'
  ]);

  const [verificationGates] = useState<VerificationGate[]>(VERIFICATION_GATES_DATA);
  const [isReleasePromoted, setIsReleasePromoted] = useState(false);

  const [budget, setBudget] = useState<BudgetConfig>(INITIAL_BUDGET);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isNewWorkpackModalOpen, setIsNewWorkpackModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const [logs, setLogs] = useState<TelemetryLog[]>(INITIAL_LOGS);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const gpuMemory = 78;
  const contextHit = 94.2;
  const [throughput, setThroughput] = useState(4120);

  // Live token streaming animation when pipeline is active
  useEffect(() => {
    if (isPipelinePaused) return;
    const interval = setInterval(() => {
      setStreamedTokens((prev) => prev + Math.floor(Math.random() * 18) + 12);
      setThroughput(4000 + Math.floor(Math.random() * 240));
    }, 1200);
    return () => clearInterval(interval);
  }, [isPipelinePaused]);

  // Global keyboard shortcuts (Ctrl+K / Cmd+K for Command Palette)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsBudgetModalOpen(false);
        setIsNewWorkpackModalOpen(false);
        setIsTaskDrawerOpen(false);
        setIsAgentDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const updateAgent = (id: string, updates: Partial<Agent>) => {
    setAgents((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, ...updates } : agent))
    );
    if (selectedAgent && selectedAgent.id === id) {
      setSelectedAgent((prev) => (prev ? { ...prev, ...updates } : null));
    }
  };

  const openAgentDrawer = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId || a.name === agentId);
    if (agent) {
      setSelectedAgent(agent);
      setIsAgentDrawerOpen(true);
    }
  };

  const closeAgentDrawer = () => {
    setIsAgentDrawerOpen(false);
  };

  const openTaskDrawer = (taskId: string) => {
    const task = workpacks.find((w) => w.id === taskId);
    if (task) {
      setSelectedWorkpack(task);
      setIsTaskDrawerOpen(true);
    }
  };

  const closeTaskDrawer = () => {
    setIsTaskDrawerOpen(false);
  };

  const addWorkpack = (
    newWp: Omit<Workpack, 'id' | 'completeness' | 'linesAdded' | 'linesRemoved' | 'filesCount'>
  ) => {
    const newId = `TSK-${1100 + workpacks.length + 1}`;
    const workpackItem: Workpack = {
      ...newWp,
      id: newId,
      completeness: 5,
      linesAdded: Math.floor(Math.random() * 80) + 20,
      linesRemoved: Math.floor(Math.random() * 20),
      filesCount: newWp.targetFiles.length || 3
    };
    setWorkpacks((prev) => [workpackItem, ...prev]);
    addToast({
      type: 'success',
      title: 'Workpack Dispatched',
      message: `${workpackItem.id}: "${workpackItem.title}" queued for ${workpackItem.assignedAgentName}.`
    });
    addLog({
      level: 'info',
      tag: '[DISPATCH]',
      message: `New workpack ${workpackItem.id} assigned to ${workpackItem.assignedAgentName}.`,
      agent: workpackItem.assignedAgentName
    });
  };

  const updateWorkpackStatus = (id: string, newStatus: TaskStatus) => {
    setWorkpacks((prev) =>
      prev.map((wp) => (wp.id === id ? { ...wp, status: newStatus } : wp))
    );
    const updated = workpacks.find((w) => w.id === id);
    if (updated) {
      addToast({
        type: 'info',
        title: 'Task Advanced',
        message: `${id} transitioned to stage "${newStatus}".`
      });
      addLog({
        level: 'info',
        tag: '[WORKPACK-STATUS]',
        message: `${id} updated status to ${newStatus}.`,
        agent: updated.assignedAgentName
      });
    }
  };

  const togglePausePipeline = () => {
    setIsPipelinePaused((prev) => {
      const next = !prev;
      addToast({
        type: next ? 'warning' : 'success',
        title: next ? 'Pipeline Paused' : 'Pipeline Resumed',
        message: next
          ? 'Swarm processing halted. Compute runway conserved.'
          : 'Agent fleet resumed autonomous synthesis.'
      });
      addLog({
        level: next ? 'warn' : 'success',
        tag: '[PIPELINE-CONTROL]',
        message: next
          ? 'Human operator triggered PAUSE PIPELINE.'
          : 'Human operator triggered RESUME PIPELINE.'
      });
      return next;
    });
  };

  const injectSteeringHint = (hintText: string) => {
    if (!hintText.trim()) return;
    setSteeringHintsHistory((prev) => [hintText.trim(), ...prev]);
    setSteerAgentPrompt('');
    addToast({
      type: 'success',
      title: 'Steering Hint Injected',
      message: 'Active agent context updated with human guidance constraints.'
    });
    addLog({
      level: 'agent',
      tag: '[STEERING]',
      message: `Human-in-the-loop hint injected into CodeCraft: "${hintText.trim()}"`,
      agent: 'Human Operator'
    });
  };

  const promoteReleaseCandidate = () => {
    setIsReleasePromoted(true);
    addToast({
      type: 'success',
      title: 'PR #418 Merged to Main',
      message: 'Autonomous billing gateway passed all gates and deployed to production.'
    });
    addLog({
      level: 'success',
      tag: '[RELEASE-DEPLOY]',
      message: 'PR #418 promoted to production. Ephemeral microVM sandbox decommissioned.'
    });
  };

  const rollbackReleaseCandidate = () => {
    setIsReleasePromoted(false);
    addToast({
      type: 'warning',
      title: 'Rollback Executed',
      message: 'PR #418 ephemeral microVM pod purged. Mainline branch safeguarded.'
    });
    addLog({
      level: 'warn',
      tag: '[ROLLBACK]',
      message: 'Operator triggered Emergency Rollback sequence for PR #418.'
    });
  };

  const updateBudget = (updates: Partial<BudgetConfig>) => {
    setBudget((prev) => ({ ...prev, ...updates }));
    addToast({
      type: 'success',
      title: 'Budget Safeguards Updated',
      message: 'Monthly compute limits and alert thresholds deployed.'
    });
    addLog({
      level: 'info',
      tag: '[BUDGET-UPDATE]',
      message: `Monthly cap configured to $${(updates.monthlyCap ?? budget.monthlyCap).toLocaleString()}.`
    });
  };

  const addLog = (logData: Omit<TelemetryLog, 'id' | 'timestamp'>) => {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const newLog: TelemetryLog = {
      ...logData,
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      timestamp
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 80)]);
  };

  const clearLogs = () => {
    setLogs([]);
    addToast({
      type: 'info',
      title: 'Logs Cleared',
      message: 'Telemetry event buffer reset.'
    });
  };

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        agents,
        updateAgent,
        selectedAgent,
        setSelectedAgent,
        isAgentDrawerOpen,
        openAgentDrawer,
        closeAgentDrawer,
        workpacks,
        addWorkpack,
        updateWorkpackStatus,
        selectedWorkpack,
        setSelectedWorkpack,
        isTaskDrawerOpen,
        openTaskDrawer,
        closeTaskDrawer,
        pipelineStages,
        isPipelinePaused,
        togglePausePipeline,
        streamedTokens,
        steerAgentPrompt,
        setSteerAgentPrompt,
        injectSteeringHint,
        steeringHintsHistory,
        verificationGates,
        promoteReleaseCandidate,
        rollbackReleaseCandidate,
        isReleasePromoted,
        budget,
        updateBudget,
        isBudgetModalOpen,
        setIsBudgetModalOpen,
        isNewWorkpackModalOpen,
        setIsNewWorkpackModalOpen,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        logs,
        addLog,
        clearLogs,
        toasts,
        addToast,
        removeToast,
        gpuMemory,
        contextHit,
        throughput
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
