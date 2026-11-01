import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { NavigationPane } from './components/common/NavigationPane';
import { HeaderBar } from './components/common/HeaderBar';
import { BudgetModal } from './components/common/BudgetModal';
import { NewWorkpackModal } from './components/common/NewWorkpackModal';
import { TaskDrawer } from './components/common/TaskDrawer';
import { AgentTuningDrawer } from './components/common/AgentTuningDrawer';
import { CommandPalette } from './components/common/CommandPalette';
import { ToastContainer } from './components/common/ToastContainer';

import {
  OverviewPage,
  MissionControlPage,
  TaskMatrixPage,
  LiveWorkspacePage,
  QualitySandboxesPage,
  SpecStudioPage,
  FleetTuningPage,
  SettingsPage
} from './pages';

const MainLayout: React.FC = () => {
  const { currentTab } = useApp();

  return (
    <div className="flex w-full h-screen overflow-hidden bg-[#1a1a1a] text-[#f3f3f3]">
      {/* Navigation Rail / Drawer */}
      <NavigationPane />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <HeaderBar />

        {/* View Router */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {currentTab === 'overview' && <OverviewPage />}
          {currentTab === 'mission-control' && <MissionControlPage />}
          {currentTab === 'task-matrix' && <TaskMatrixPage />}
          {currentTab === 'live-workspace' && <LiveWorkspacePage />}
          {currentTab === 'quality-sandboxes' && <QualitySandboxesPage />}
          {currentTab === 'spec-studio' && <SpecStudioPage />}
          {currentTab === 'fleet-tuning' && <FleetTuningPage />}
          {currentTab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Global Overlays & Slide-out Drawers */}
      <BudgetModal />
      <NewWorkpackModal />
      <TaskDrawer />
      <AgentTuningDrawer />
      <CommandPalette />
      <ToastContainer />
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}

export default App;
