import React from 'react';
import { useQualitySandbox } from './hooks/useQualitySandbox';
import { ReleaseCandidateHeader } from './components/ReleaseCandidateHeader';
import { VerificationGateGrid } from './components/VerificationGateGrid';
import { InteractivePreviewFrame } from './components/InteractivePreviewFrame';
import { DeterministicAuditLogs } from './components/DeterministicAuditLogs';

export const QualitySandboxesPage: React.FC = () => {
  const {
    verificationGates,
    isReleasePromoted,
    device,
    setDevice,
    sandboxLogs,
    activePlan,
    setActivePlan,
    isPromoting,
    handlePromote,
    rollback,
    getViewportWidth
  } = useQualitySandbox();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface mica-bg min-h-screen">
      <div className="flex flex-col gap-5 max-w-[1600px] mx-auto pb-16">
        {/* Top Release Candidate Strip */}
        <ReleaseCandidateHeader
          isPromoted={isReleasePromoted}
          isPromoting={isPromoting}
          onPromote={handlePromote}
          onRollback={rollback}
        />

        {/* 4 Deterministic Verification Gates */}
        <VerificationGateGrid gates={verificationGates} />

        {/* Interactive Responsive Viewport Sandbox */}
        <InteractivePreviewFrame
          device={device}
          onDeviceChange={setDevice}
          activePlan={activePlan}
          onPlanChange={setActivePlan}
          viewportWidthClass={getViewportWidth()}
        />

        {/* Deterministic Audit Logs */}
        <DeterministicAuditLogs logs={sandboxLogs} />
      </div>
    </div>
  );
};

export default QualitySandboxesPage;
