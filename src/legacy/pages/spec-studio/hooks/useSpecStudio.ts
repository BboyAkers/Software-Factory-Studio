import { useState, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import type { SpecMode } from '../lib/specParserModel';
import { DECOMPOSED_TASKS } from '../lib/specParserModel';
import { getDefaultSpecContracts } from '../queries/getSpecTemplates';
import { useDispatchSpecWorkpack } from '../mutations/useDispatchSpecWorkpack';

export function useSpecStudio() {
  const { addWorkpack, setCurrentTab, addToast } = useApp();

  const [mode, setMode] = useState<SpecMode>('feature');
  const [ticketId, setTicketId] = useState('LIN-4821: Organization RBAC multi-tenant billing tiering');
  const [promptText, setPromptText] = useState(
`# REQUIREMENT SPEC: Implement tiered subscription roles for workspaces.
Must support dynamic roles: 'owner', 'auditor', 'contributor'.

Requirements breakdown:
- Add role_enum migration to PostgreSQL with soft-delete safeguard
- Expose tRPC procedures with strict tenancy authorization middleware
- Create responsive UI matrix modal with optimistic update support
- Guarantee zero regression on enterprise SAML SSO token issuance`
  );

  const [activeTabContract, setActiveTabContract] = useState<'types' | 'tests'>('types');
  const contracts = useMemo(() => getDefaultSpecContracts(), []);
  const { dispatch } = useDispatchSpecWorkpack(addWorkpack, addToast);

  const handleDispatch = () => {
    dispatch('Organization RBAC Multi-Tenant Tiering & Boundary Scopes', promptText);
    setCurrentTab('mission-control');
  };

  return {
    mode,
    setMode,
    ticketId,
    setTicketId,
    promptText,
    setPromptText,
    activeTabContract,
    setActiveTabContract,
    contractTypes: contracts.types,
    contractTests: contracts.tests,
    decomposedTasks: DECOMPOSED_TASKS,
    handleDispatch
  };
}
