import { useMemo, useState } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { useRouteIds, useSearchState, useGo } from '../../app/nav';
import { useWorkpacks } from '../../api/queries';
import { useCan } from '../../app/session';
import { ui } from '../../app/ui';
import type { Workpack } from '../../contracts';
import { Page } from '../../components/layout/Page';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { SearchSchema } from './routes';
import { TaskMatrixHeader } from './components/TaskMatrixHeader';
import { TaskMatrixFilterBar } from './components/TaskMatrixFilterBar';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskTableView } from './components/TaskTableView';
import { TaskDrawer } from './components/TaskDrawer';
import { EpicDrawer } from './components/EpicDrawer';
import { RequestChangesDialog } from './components/RequestChangesDialog';
import { CancelWorkpackDialog } from './components/CancelWorkpackDialog';

export default function TaskMatrixPage() {
  usePageTitle('Task Matrix');

  const { wpId } = useRouteIds();
  const [search, setSearch] = useSearchState(SearchSchema);
  const go = useGo();
  const canCreate = useCan('workpack.create');

  // Dialog and drawer state
  const [epicDrawerId, setEpicDrawerId] = useState<string | null>(null);
  const [requestChangesWp, setRequestChangesWp] = useState<Workpack | null>(null);
  const [cancelWp, setCancelWp] = useState<Workpack | null>(null);

  // Fetch all workpacks for project
  const workpacksQuery = useWorkpacks();
  const allWorkpacks = useMemo(() => workpacksQuery.data?.items ?? [], [workpacksQuery.data?.items]);

  // Count archived
  const archivedCount = useMemo(
    () => allWorkpacks.filter((w) => w.archived).length,
    [allWorkpacks]
  );

  // Filter workpacks based on search bar and active views
  const filteredWorkpacks = useMemo(() => {
    return allWorkpacks.filter((w) => {
      // Archived filter
      if (search.archived) {
        if (!w.archived) return false;
      } else {
        // If not in archived view, don't show archived items in board or table
        if (w.archived) return false;
      }

      // Priority filter
      if (search.priority && w.priority !== search.priority) {
        return false;
      }

      // Agent filter
      if (search.agent && w.assignedAgentId !== search.agent) {
        return false;
      }

      // Epic filter
      if (search.epic && w.epicId !== search.epic) {
        return false;
      }

      // Search query (id or title)
      if (search.q) {
        const query = search.q.toLowerCase().trim();
        const matchesId = w.id.toLowerCase().includes(query);
        const matchesTitle = w.title.toLowerCase().includes(query);
        const matchesDesc = w.description.toLowerCase().includes(query);
        if (!matchesId && !matchesTitle && !matchesDesc) return false;
      }

      return true;
    });
  }, [allWorkpacks, search]);

  const handleSelectWorkpack = (id: string) => {
    void go(`matrix/${id}`);
  };

  const handleCloseTaskDrawer = () => {
    void go('matrix');
  };

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <TaskMatrixHeader workpacks={allWorkpacks} />

        <TaskMatrixFilterBar
          search={search}
          onSearchChange={setSearch}
          archivedCount={archivedCount}
        />

        {workpacksQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : allWorkpacks.length === 0 ? (
          <div className="rounded-xl border border-fluent-border bg-surface-card p-12">
            <EmptyState
              icon="view_kanban"
              title="No workpacks yet"
              description="They appear when an Epic is decomposed, or create one."
              action={
                <Button
                  variant="primary"
                  icon="add"
                  onClick={() => ui.openNewWorkpack()}
                  disabled={!canCreate.allowed}
                  title={canCreate.reason}
                >
                  New workpack
                </Button>
              }
            />
          </div>
        ) : search.view === 'table' || search.archived ? (
          <TaskTableView
            workpacks={filteredWorkpacks}
            isArchivedView={search.archived}
            onSelectWorkpack={handleSelectWorkpack}
            onSelectEpic={setEpicDrawerId}
          />
        ) : (
          <KanbanBoard
            workpacks={filteredWorkpacks}
            onSelectWorkpack={handleSelectWorkpack}
            onRequestChanges={setRequestChangesWp}
            onCancelWorkpack={setCancelWp}
          />
        )}
      </div>

      {/* Task Drawer on /matrix/:wpId */}
      <TaskDrawer
        wpId={wpId ?? null}
        open={Boolean(wpId)}
        onClose={handleCloseTaskDrawer}
        onSelectEpic={setEpicDrawerId}
      />

      {/* Epic Drawer */}
      <EpicDrawer
        epicId={epicDrawerId}
        open={Boolean(epicDrawerId)}
        onClose={() => setEpicDrawerId(null)}
        onSelectWorkpack={handleSelectWorkpack}
      />

      {/* Request Changes Dialog */}
      <RequestChangesDialog
        open={Boolean(requestChangesWp)}
        workpack={requestChangesWp}
        onClose={() => setRequestChangesWp(null)}
      />

      {/* Cancel Workpack Dialog */}
      <CancelWorkpackDialog
        open={Boolean(cancelWp)}
        workpack={cancelWp}
        onClose={() => setCancelWp(null)}
      />
    </Page>
  );
}
