# Quality & Sandboxes Feature Architecture

The Quality & Sandboxes feature enforces deterministic verification standards before code synthesized by autonomous agents can merge to mainline.

## Responsibilities
- 4 Deterministic verification gates: Static Analysis & Types, Unit & Integration Suites, Playwright Viewport Permutations, Security SAST/DAST Audit.
- Interactive multi-viewport preview container (Desktop, Tablet, Mobile) with real-time UI state toggles.
- Release candidate metadata inspection (PR #, Commit SHA, Regression scoring).
- Mainline promotion and instant rollback controls.

## Module Structure
- `components/`: `ReleaseCandidateHeader`, `VerificationGateGrid`, `InteractivePreviewFrame`, `DeterministicAuditLogs`.
- `hooks/`: `useQualitySandbox` provides responsive viewport logic, gate scoring, and promotion flow.
- `queries/`: `getVerificationGates` supplies audit logs and gate telemetry.
- `mutations/`: `usePromoteReleaseMutation` merges the release candidate to mainline.
- `lib/`: `sandboxScoreModel` computes pass rates and regression index.
- `routes.ts`: Route metadata.
- `index.tsx`: Root page entry (`QualitySandboxesPage`).
