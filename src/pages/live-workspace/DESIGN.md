# Live Workspace Feature Architecture

The Live Workspace feature provides interactive transparency into autonomous agent code generation, terminal execution, and AST reasoning.

## Responsibilities
- Real-time diff rendering with unified or side-by-side mode.
- Interactive Firecracker microVM terminal session with interactive command dispatching (`vitest`, `git diff`, etc.).
- Step-by-step Chain-of-Thought (CoT) reasoning inspection.
- Direct AST prompt injection into the container session without restart.

## Module Structure
- `components/`: `WorkspaceFileTabs`, `CodeDiffEditor`, `TerminalSession`, `ReasoningTraceViewer`, `WorkspaceToolbar`.
- `hooks/`: `useLiveWorkspace` orchestrates file selection, diff calculation, terminal history, and CoT step expansion.
- `queries/`: `getWorkspaceCode` returns file diff representations and telemetry tags.
- `mutations/`: `useExecuteTerminalCommand` handles virtual command processing.
- `lib/`: `workspaceStreamModel` models step definitions and syntax line types.
- `routes.ts`: Route metadata.
- `index.tsx`: Live workspace page root (`LiveWorkspacePage`).
