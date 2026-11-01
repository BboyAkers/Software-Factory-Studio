import type { Workpack, ToastMessage } from '../../../types';

export function useDispatchSpecWorkpack(
  addWorkpack: (
    wp: Omit<Workpack, 'id' | 'completeness' | 'linesAdded' | 'linesRemoved' | 'filesCount'>
  ) => void,
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
) {
  const dispatch = (specTitle: string, promptText: string) => {
    addWorkpack({
      title: specTitle || 'Synthesized Workpack from Spec',
      description: promptText,
      status: 'planning',
      priority: 'P1 High',
      assignedAgentId: 'agent-1',
      assignedAgentName: 'Architect-Prime',
      assignedAgentInitials: 'AP',
      branch: 'feat/rbac-tenant-tiering',
      tokensConsumed: '~3.2k tok',
      category: 'Security',
      targetFiles: ['prisma/schema.prisma', 'src/auth/rbac.ts', 'src/trpc/roles.ts']
    });

    addToast({
      type: 'success',
      title: 'Spec Dispatched to Swarm',
      message: 'Architect-Prime received synthesized PRD decomposition.'
    });
  };

  return { dispatch };
}
