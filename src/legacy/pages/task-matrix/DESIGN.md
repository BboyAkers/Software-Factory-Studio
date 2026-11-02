# Task Matrix Feature Architecture

The Task Matrix feature provides an ultra-dense, multi-column Kanban board and streaming table for managing workpacks assigned across specialist agents.

## Responsibilities
- 6-column lifecycle tracking: Queued, Spec & Planning, In Progress, Verification Gates, Awaiting Review, Done.
- Filter and search operations across agents, priority severity levels (P0 to P3), and workpack keys.
- Quick status promotions and drag/click stage reassignments.
- Dual view toggle (Interactive Matrix Board vs Dense Enterprise Table).

## Module Structure
- `components/`: `TaskCard`, `KanbanColumn`, `TaskMatrixStreamTable`, `TaskFilterBar`, `TaskSummaryStats`.
- `hooks/`: `useTaskMatrixFilters` encapsulates filtering, view mode state, and status mutations.
- `queries/`: `getTaskMatrixTasks` provides summary metrics and aggregated task counts.
- `mutations/`: `useUpdateTaskStatusMutation` handles workpack state transitions.
- `lib/`: `taskMatrixModel` defines column layouts and filtering predicates.
- `routes.ts`: Route definitions and tab configuration.
- `index.tsx`: Root page component (`TaskMatrixPage`).
