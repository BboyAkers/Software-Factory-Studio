# Settings & Governance Feature Architecture

The Settings & Governance feature configures external infrastructure connectors, LLM providers, and safety tripwires.

## Responsibilities
- Developer & source connectors: GitHub (individual personal accounts or organization repositories), Anthropic Claude API, DeepSeek-V3, AWS Firecracker microVMs, Datadog APM, and Semgrep SAST.
- Individual GitHub repository onboarding: Personal Access Tokens (fine-grained repo scopes: contents, pull requests, checks) and GitHub App workflows.
- Autonomous guardrails & policy toggles (Mainline auto-merge, hard budget tripwires, human signoffs, AST license scanning).
- Security tokens & mTLS key management with reveal/mask and copy workflows.

## Module Structure
- `components/`: `EnterpriseIntegrationsGrid`, `ConnectGitHubRepoModal`, `GovernancePoliciesCard`, `TelemetryAndSecurityCard`.
- `hooks/`: `useSettingsIntegrations` handles toggle mutations, repository linking, and toast feedback.
- `queries/`: `getSettingsConfig` returns baseline integration metadata and policy states.
- `mutations/`: `useToggleIntegrationMutation` persists active state for connectors.
- `lib/`: `settingsModel` specifies interfaces for connectors, repository configuration, and policies.
- `routes.ts`: Route metadata.
- `index.tsx`: Settings page root (`SettingsPage`).
