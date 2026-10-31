# Settings & Governance Feature Architecture

The Settings & Governance feature configures external infrastructure connectors, LLM providers, and safety tripwires.

## Responsibilities
- Enterprise connectors: GitHub Enterprise, Anthropic Claude API, DeepSeek-V3, AWS Firecracker microVMs, Datadog APM, and Semgrep SAST.
- Autonomous guardrails & policy toggles (Mainline auto-merge, hard budget tripwires, human signoffs, AST license scanning).
- Security tokens & mTLS key management with reveal/mask and copy workflows.

## Module Structure
- `components/`: `EnterpriseIntegrationsGrid`, `GovernancePoliciesCard`, `TelemetryAndSecurityCard`.
- `hooks/`: `useSettingsIntegrations` handles toggle mutations and toast feedback.
- `queries/`: `getSettingsConfig` returns baseline integration metadata and policy states.
- `mutations/`: `useToggleIntegrationMutation` persists active state for connectors.
- `lib/`: `settingsModel` specifies interfaces for connectors and policies.
- `routes.ts`: Route metadata.
- `index.tsx`: Settings page root (`SettingsPage`).
