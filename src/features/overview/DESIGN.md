# Overview Feature Architecture

The Factory Overview feature serves as the executive cockpit and operational command center for Synthetix Swarm OS.

## Responsibilities
- Displays real-time operational metrics across active autonomous runs, gate velocity, and daily token burn.
- Provides high-level visibility into workpack stages (Spec Decomposition, Multi-file Execution, Gate Verification, Human Signoff).
- Displays specialist swarm health and status (Architect, SWE, QA, Security, Doc, DevOps).
- Exposes diagnostic actions including deterministic regression benchmarks.

## Module Structure
- `components/`: UI cards (`HeroMetricCard`, `AutonomousPipelineCard`, `AgentActivityFeed`, `SystemHealthGauge`).
- `hooks/`: `useOverviewData` handles pipeline filtering, timeframe switching, and diagnostic triggers.
- `queries/`: `getOverviewMetrics` retrieves current KPIs and system health telemetry.
- `mutations/`: `triggerFactoryBenchmark` simulates synchronous/asynchronous test suite verification across 173 gates.
- `lib/`: `overviewModel` provides formatting utilities and mathematical models for velocity ratios.
- `routes.ts`: Route metadata and page title bindings.
- `index.tsx`: Root page component (`OverviewPage`).
