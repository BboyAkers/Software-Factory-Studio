import React from 'react';
import { useSpecStudio } from './hooks/useSpecStudio';
import { SpecStudioToolbar } from './components/SpecStudioToolbar';
import { SpecInputEditor } from './components/SpecInputEditor';
import { ContractVerificationPane } from './components/ContractVerificationPane';
import { DecompositionPipelinePreview } from './components/DecompositionPipelinePreview';

export const SpecStudioPage: React.FC = () => {
  const {
    mode,
    setMode,
    ticketId,
    setTicketId,
    promptText,
    setPromptText,
    activeTabContract,
    setActiveTabContract,
    contractTypes,
    contractTests,
    decomposedTasks,
    handleDispatch
  } = useSpecStudio();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-6 max-w-[1600px] mx-auto pb-16">
        {/* Toolbar & Mode Bar */}
        <SpecStudioToolbar
          mode={mode}
          onModeChange={setMode}
          ticketId={ticketId}
          onTicketIdChange={setTicketId}
          onDispatch={handleDispatch}
        />

        {/* Editor & Contract Verification Matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SpecInputEditor
            promptText={promptText}
            onPromptTextChange={setPromptText}
          />

          <ContractVerificationPane
            activeTab={activeTabContract}
            onTabChange={setActiveTabContract}
            contractTypes={contractTypes}
            contractTests={contractTests}
          />
        </div>

        {/* Swarm Decomposition Graph */}
        <DecompositionPipelinePreview tasks={decomposedTasks} />
      </div>
    </div>
  );
};

export default SpecStudioPage;
