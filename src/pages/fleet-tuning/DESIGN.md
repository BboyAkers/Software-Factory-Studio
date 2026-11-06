# Fleet & Tuning Feature Architecture

The Fleet & Tuning feature configures the autonomous specialist agent fleet, hierarchical orchestration, pinned model inference routing, and prompt/eval boundaries.

## Responsibilities
- **Agent Models Hierarchy**: Visual tree showing the Lead Architect (`Architect-Prime`) directing the 5 downstream autonomous specialists (`CodeCraft`, `GateKeeper`, `SecOps-Vanguard`, `DocuForge`, `SentryWatch`).
- **Segmented Model Routing**: Select pinned LLM releases (Claude Opus, Sonnet, Haiku, GPT-4o, DeepSeek-V3) per specialist with live release identifier readouts.
- **System Prompt & Tuning Drawer**: Slide-out drawer to inspect and adjust agent system prompts, reasoning effort, temperature, execution limits, and skill definitions.
- **Intake & Manual Triggers**: Manual cycle trigger (`Run now`) for intake agents (`Architect-Prime`, `SentryWatch`).
- **Role-Based Governance**: Viewers read configuration in read-only mode. Maintainers and Admins tune prompts and run cycles.

## Module Structure
- `components/`:
  - `AgentCard.tsx`: Individual agent card matching the minimal dark slate card style with colored avatar, status, segmented model selector pills, pinned release tag, and action buttons.
  - `AgentHierarchyTree.tsx`: Hierarchical tree layout with top lead card, connecting branching lines, and horizontal specialists row.
  - `AgentTuningDrawer.tsx`: Slide-out drawer for editing system prompts, reasoning effort, and temperature.
- `mutations/`:
  - `useRunAgentMutation.ts`: Dispatches `POST /agents/:id/run` to trigger a manual intake cycle.
  - `useSaveAgentConfigMutation.ts`: Dispatches `POST /agents/:id/versions` to persist updated agent configurations.
- `routes.ts`: Search schema supporting `fleet/{-$agentId}` deep-linking.
- `index.tsx`: Fleet & Tuning page entry point.

