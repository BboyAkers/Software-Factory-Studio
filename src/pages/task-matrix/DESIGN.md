# Task Matrix & Kanban Board Design

## 1. Overview
The **Task Matrix** (`/matrix`, `/matrix/:wpId`) provides the operational command center for workpacks across their entire lifecycle as specified in Technical Spec §16.6 and §5.1. It supports both a real-time **Board** view and a dense sortable **Table** view.

## 2. Views & Navigation
- **Route**: `/p/$project/matrix/{-$wpId}`
- **Search Schema**:
  - `view`: `'board' | 'table'` (default: `'board'`)
  - `archived`: boolean flag for showing archived workpacks
  - `q`: search filter string (targeted automatically by `Ctrl+F` / `Cmd+F`)
  - `priority`: priority filter (`'P0 Blocker' | 'P1 High' | 'P2 Normal'`)
  - `agent`: agent filter by specialist id
  - `epic`: Epic filter by epic id
- **Deep Linking**:
  - When `$wpId` is present in the route path, `TaskDrawer` slides open while preserving filter context.
  - Closing the drawer navigates back to `/matrix` with existing search params intact.

## 3. Kanban Board
The board features 6 lifecycle columns and a **Recently ended** tray:
1. **Queued**: Admitted candidates awaiting start or unblocked file locks.
2. **Spec & Planning**: Contracts attached and locked, branch created, awaiting first synthesis run.
3. **In Progress**: Active code synthesis by CodeCraft, displaying progress bar and line deltas.
4. **Verification**: Verification and security testing by GateKeeper & SecOps-Vanguard.
5. **Awaiting Review**: Autonomous merge conditions not met, or hold for review active.
6. **Done · 24h**: Completed workpacks finalized within the trailing 24-hour window. Older items remain accessible in the Table view.

### Recently Ended Tray
- Holds non-archived workpacks with status `failed` or `cancelled`.
- Features a live 5-minute archive countdown timer.
- Offers direct actions:
  - **View repro**: Navigates to `/quality/:wpId` with repro bundle inspection.
  - **Fork**: Maintainer+ action initiating a clean retry run.
  - **Archive now**: Engineer+ action archiving immediately.

## 4. Manual Transitions & Moves (§5.1)
Only legal transitions defined in §5.1 are permitted on the board:
- `awaiting-review` → `in-progress`: Opens **Request changes** dialog (reviewer text required; resets attempt counter to 1).
- `awaiting-review` → `done`: Triggers Maintainer approval & merge (Promote).
- Non-terminal (`queued`, `planning`, `in-progress`, `verification`, `awaiting-review`) → *Recently ended* tray: Triggers **Cancel workpack** confirmation dialog (preserving git branch and PR for manual pickup).
- All other moves are refused with a `not-allowed` cursor and forbidden indicator.
- The card's **⋯** menu provides equivalent keyboard-accessible actions.

## 5. Drawers & Dialogs
- **Task Drawer** (`TaskDrawer.tsx`): 6 tabs:
  1. *Overview*: Description, Epic link, assigned agent, branch and PR links, completeness progress bar, attempt `n/3`, SLA countdown, queued/paused reasons, target files, and Maintainer **Hold for review** toggle.
  2. *Runs*: History of synthesis and verification runs with token/cost attribution.
  3. *Contracts*: Attached contracts, lock states, and Maintainer **Unlock** modal.
  4. *Gates*: Gate status grid linking to Quality & Sandboxes.
  5. *Timeline*: Hash-verified audit trail entries for the workpack.
  6. *Cost*: Token breakdown and spend attribution by run.
- **Epic Drawer** (`EpicDrawer.tsx`): Dependency DAG, attached contracts, child workpack list, and Pause/Resume Epic controls.
- **New Workpack Dialog** (`NewWorkpackDialog.tsx`):
  - Validates relative paths for target files.
  - Dynamic file overlap detection (`globsOverlap`): Warns if files overlap running workpacks.
  - Computed branch preview (`factory/WP-...-<slug>`).
  - Multiselect dependencies within the selected Epic.

