# Mission Control Feature Architecture

The Mission Control module manages the deterministic 4-stage assembly line orchestration across dedicated specialist agents.

## Responsibilities
- Live multi-stage pipeline state tracking (Spec Decomposition, Implementation, Deterministic Verification, Human Review).
- Real-time token stream monitoring and autonomous process logs.
- Safe human-in-the-loop steering guardrail injection into reasoning context.
- Pause, fork, and abort controls over containerized swarm tasks.

## Module Structure
- `components/`: Pipeline stage columns (`PipelineStageColumn`), workpack cards (`WorkpackMiniCard`), interactive steering console (`SteeringConsole`), and console log visualizer (`LiveExecutionLogViewer`).
- `hooks/`: `useMissionControlState` orchestrates log filtering, steering submissions, and execution controls.
- `queries/`: `getMissionControlData` loads runtime cluster telemetry and verification pass metrics.
- `mutations/`: `useSteerAgentMutation` handles user steering prompts into running container streams.
- `lib/`: `missionControlModel` provides throughput calculations and log filtering filters.
- `routes.ts`: Feature routing definition.
- `index.tsx`: Mission Control root page entry point (`MissionControlPage`).
