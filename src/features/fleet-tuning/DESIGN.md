# Fleet & Tuning Feature Architecture

The Fleet & Tuning feature controls model assignment, hyperparameters (temperature, top-P, reasoning token budgets), and failover topology across the agent fleet.

## Responsibilities
- Real-time barometer metrics: active LLM gateways, VRAM allocation, monthly token burn, and KV cache hits.
- Lead Architect governance: system prompt tuning, primary coordination directives, and instant intake triggering.
- 5 dedicated specialist agents: SWE-Autopilot, QA-Sentinel, Security-Auditor, Doc-Synthesizer, DevOps-Runner.
- Fallback chain matrix for zero-downtime resilient code generation.

## Module Structure
- `components/`: `FleetBarometerCards`, `LeadArchitectCard`, `SpecialistAgentGrid`, `ModelFallbackMatrix`.
- `hooks/`: `useFleetTuning` manages hyperparameter state and drawer triggers.
- `queries/`: `getFleetStatus` computes telemetry on GPU VRAM, node health, and token burn.
- `mutations/`: `useUpdateAgentHyperparameters` mutates agent hyperparameter parameters.
- `lib/`: `fleetTuningModel` provides cluster statistics and cache heuristics.
- `routes.ts`: Route metadata.
- `index.tsx`: Fleet tuning page root (`FleetTuningPage`).
