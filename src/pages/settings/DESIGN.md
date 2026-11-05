# Settings & Governance Feature Architecture

The Settings & Governance feature configures external infrastructure connectors, source repositories, LLM provider gateways, and autonomous safety policies.

## Responsibilities
- **GitHub Repository & Source Sync**: Connect individual personal accounts or organization repositories via fine-grained Personal Access Tokens (PAT). Manage webhook synchronization, trunk branches, and autonomous PR workflows.
- **Onboarding Wizard (§13.1)**: Personal access token authentication with preflight checks (token validity, scopes, reachable branch, TypeScript detection, webhook capability).
- **Integration Management**: Enable/pause connectors (GitHub, Slack, model providers, Semgrep, Datadog/Sentry). Turning off GitHub cascades an automatic pause across all targeting workpacks (`integration-disabled`).
- **Autonomous Guardrails**: Mainline auto-merge, hard budget tripwires, human sign-offs for P0/P1 and schema migrations.
- **Role-Based Access Control**: Admins manage integrations, connect projects, and update policies. Maintainers manage secrets vault. Viewers have read-only access with masked credentials.

## Module Structure
- `components/`:
  - `GitHubConnectionCard.tsx`: Primary container card coordinating GitHub repository queries, mutations, and dialogs while delegating view sections to `components/github/`.
  - `github/`:
    - `GitHubCardHeader.tsx`: Card header with status badge, sync toggle, and connect/disconnect actions.
    - `ConnectedRepoOverview.tsx`: Connected repository overview box, test connection trigger, and metadata pills.
    - `TokenPermissionsGrid.tsx`: Fine-grained PAT permission scope checklist with O(1) lookup map.
    - `GitHubWebhookSection.tsx`: Colocated webhook URL copy/ping verification section and active event subscriptions.
    - `GitHubFooterSections.tsx`: Mainline branch protection note and repository disconnect danger zone.
    - `GitHubEmptyState.tsx`: Disconnected empty state call-to-action.
  - `ModelProviderKeysCard.tsx`: Compact `// MODEL ACCESS` card for selecting an LLM provider (Anthropic, OpenAI, DeepSeek) and saving a write-only API key to the project vault.
  - `ConnectGitHubModal.tsx`: Complete repository onboarding modal implementing §13.1 steps (target repo, fine-grained PAT, branch & budget, governance toggles, and live preflight diagnostics).
  - `PauseGitHubConfirmDialog.tsx`: Confirmation dialog for pausing GitHub integration with clear explanation of active workpack impact.
  - `GitHubIcon.tsx`: Official SVG mark for GitHub.
- `lib/`:
  - `normalizeRepo.ts`: Normalizes user input (URLs, SSH remotes, or strings) into clean `<owner>/<repo>`.
- `mutations/`:
  - `useConnectProjectMutation.ts`: Dispatches `POST /projects/connect` to provision a connected repository.
  - `usePreflightMutation.ts`: Dispatches `POST /projects/connect/preflight` for dry-run verification.
  - `useRotateProviderKeyMutation.ts`: Dispatches `PUT /integrations/:id/key` to import or rotate a write-only model provider API key.
  - `useToggleIntegrationMutation.ts`: Dispatches `PATCH /integrations/:id` to toggle or pause connectors.
  - `useTestIntegrationMutation.ts`: Dispatches `POST /integrations/:id/test` for latency checks.
- `routes.ts`: Search schema supporting `?section=connect` deep-linking.
- `index.tsx`: Settings page entry point.
