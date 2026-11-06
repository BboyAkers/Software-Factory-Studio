import { useEffect, useRef } from 'react';
import type { Search } from '../routes';
import { useAgents, useEpics } from '../../../api/queries';
import { useCan } from '../../../app/session';
import { ui } from '../../../app/ui';
import {
  Badge,
  Button,
  Icon,
  Input,
  Kbd,
  SegmentedControl,
  Select,
} from '../../../components/ui';

export interface TaskMatrixFilterBarProps {
  search: Search;
  onSearchChange: (patch: Partial<Search>) => void;
  archivedCount: number;
}

const PRIORITIES = [
  { value: '', label: 'All priorities' },
  { value: 'P0 Blocker', label: 'P0 Blocker' },
  { value: 'P1 High', label: 'P1 High' },
  { value: 'P2 Normal', label: 'P2 Normal' },
];

export function TaskMatrixFilterBar({
  search,
  onSearchChange,
  archivedCount,
}: TaskMatrixFilterBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const epicsQuery = useEpics();
  const agentsQuery = useAgents();
  const canCreate = useCan('workpack.create');

  const epics = epicsQuery.data?.items ?? [];
  const agents = agentsQuery.data ?? [];

  // Listen for Ctrl+F / Cmd+F to focus search input while active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-fluent-border bg-surface-card">
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
        {/* Search Input with shortcut hint */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Input
            ref={searchInputRef}
            value={search.q}
            onChange={(e) => onSearchChange({ q: e.target.value })}
            placeholder="Search workpacks..."
            className="pl-8 pr-14 h-8 text-[13px]"
          />
          <Icon
            name="search"
            size={16}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
          />
          {!search.q && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none opacity-60">
              <Kbd>Ctrl</Kbd>
              <Kbd>F</Kbd>
            </div>
          )}
        </div>

        {/* Priority Filter */}
        <Select
          value={search.priority}
          onChange={(e) => onSearchChange({ priority: e.target.value })}
          className="h-8 text-[12px] min-w-[130px]"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>

        {/* Agent Filter */}
        <Select
          value={search.agent}
          onChange={(e) => onSearchChange({ agent: e.target.value })}
          className="h-8 text-[12px] min-w-[130px]"
        >
          <option value="">All agents</option>
          {agents.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.name}
            </option>
          ))}
        </Select>

        {/* Epic Filter */}
        <Select
          value={search.epic}
          onChange={(e) => onSearchChange({ epic: e.target.value })}
          className="h-8 text-[12px] min-w-[140px]"
        >
          <option value="">All Epics</option>
          {epics.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {ep.id} · {ep.title}
            </option>
          ))}
        </Select>

        {/* Archived Toggle */}
        <button
          type="button"
          onClick={() => onSearchChange({ archived: !search.archived })}
          className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-md border text-[12px] font-medium transition-colors ${
            search.archived
              ? 'bg-brand/20 border-brand text-brand'
              : 'border-fluent-border bg-surface-sunken text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Icon name="archive" size={15} />
          <span>Archived</span>
          <Badge tone={search.archived ? 'info' : 'neutral'}>{archivedCount}</Badge>
        </button>
      </div>

      {/* Right Controls: Board/Table toggle and New Workpack button */}
      <div className="flex items-center gap-2.5 shrink-0">
        <SegmentedControl
          value={search.view}
          onChange={(view) => onSearchChange({ view })}
          options={[
            { value: 'board', label: 'Board', icon: 'view_kanban' },
            { value: 'table', label: 'Table', icon: 'table_rows' },
          ]}
          label="View mode"
          size="sm"
        />

        <Button
          variant="primary"
          size="sm"
          icon="add"
          onClick={() => ui.openNewWorkpack()}
          disabled={!canCreate.allowed}
          title={canCreate.reason}
        >
          New workpack
        </Button>
      </div>
    </div>
  );
}

