import { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { computeQualityScore } from '../lib/sandboxScoreModel';
import { getDefaultSandboxLogs } from '../queries/getVerificationGates';
import { usePromoteReleaseMutation } from '../mutations/usePromoteReleaseMutation';

export function useQualitySandbox() {
  const {
    verificationGates,
    isReleasePromoted,
    promoteReleaseCandidate,
    rollbackReleaseCandidate,
    addToast
  } = useApp();

  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [sandboxLogs, setSandboxLogs] = useState<string[]>(getDefaultSandboxLogs());
  const [activePlan, setActivePlan] = useState<'pro' | 'enterprise'>('enterprise');
  const [isPromoting, setIsPromoting] = useState(false);

  const score = useMemo(() => computeQualityScore(verificationGates), [verificationGates]);
  const { promote, rollback } = usePromoteReleaseMutation(
    promoteReleaseCandidate,
    rollbackReleaseCandidate,
    addToast
  );

  const handlePromote = async () => {
    setIsPromoting(true);
    try {
      await promote();
    } finally {
      setIsPromoting(false);
    }
  };

  const getViewportWidth = () => {
    if (device === 'mobile') return 'max-w-[375px]';
    if (device === 'tablet') return 'max-w-[768px]';
    return 'max-w-full';
  };

  return {
    verificationGates,
    isReleasePromoted,
    score,
    device,
    setDevice,
    sandboxLogs,
    setSandboxLogs,
    activePlan,
    setActivePlan,
    isPromoting,
    handlePromote,
    rollback,
    getViewportWidth
  };
}
