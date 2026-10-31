# Product Requirements Document (PRD)
## Synthetix Factory OS — Autonomous AI Agent Software Factory

---

### 1. Executive Summary
**Synthetix Factory OS** is an enterprise-grade orchestration and command center for managing an autonomous software development factory driven by a specialized fleet of AI agents. Rather than relying on generic chat-based coding assistants, Synthetix Factory OS models software engineering as a continuous, deterministic factory assembly line—spanning requirements decomposition, architecture contracts, code synthesis, automated verification, security analysis, documentation sync, and real-time observability.

The system is designed with a **human-in-the-loop steering model**, enterprise autonomy safeguards, dynamic compute budget allocation, and a unified **Microsoft Fluent Design System 2** interface optimized for staff engineers, engineering directors, and DevOps architects.

---

### 2. Product Objectives & Key Success Metrics
* **Autonomous Delivery Velocity**: Enable 80%+ of standard engineering workpacks (bug fixes, endpoint migrations, unit tests, refactoring, documentation) to move from issue intake to production-ready PR without manual developer authoring.
* **Zero Architectural Drift**: Ensure strict contract compliance and API compatibility via deterministic multi-stage verification gates prior to merge.
* **Cost & Budget Predictability**: Provide real-time token tracking, dynamic runway calculations, and interactive soft-alert and hard-cap safeguards to eliminate budget runaway.
* **Progressive Disclosure & Cognitive Load Reduction**: Deliver deep technical telemetry (AST transformations, live diff streams, GPU VRAM, P99 inference latency) within an intuitive, uncluttered UI following Microsoft Fluent 2 design principles.

---

### 3. Agent Fleet Architecture & Roles
The factory eliminates disorganized agent swarms in favor of a structured, 6-member dedicated specialist team where each agent owns a specific stage of the pipeline:

| Agent Name | Role / Title | Core Duty & Responsibilities | Model Selection & Tuning |
| :--- | :--- | :--- | :--- |
| **Architect-Prime** | *Chief Architect & Systems Lead* | Decomposes PRDs and backlog tickets into directed acyclic graph (DAG) workpacks; defines boundary contracts, system topology, and interface types; orchestrates downstream specialists. Does not directly commit application code. | Claude 3.7 Sonnet / Opus (Reasoning Effort: Medium/High) |
| **CodeCraft** | *Full-Stack Code Synthesis Engineer* | Consumes architectural contracts to synthesize production code, scaffolding, and database migrations. Streams real-time line-by-line diffs with active confidence scores. | Claude 3.5 Sonnet / DeepSeek-V3 (Reasoning Effort: High) |
| **GateKeeper** | *QA & Verification Engineer* | Generates and executes unit tests, end-to-end Playwright tests, and regression matrices inside isolated microVM sandboxes before merge approval. | Claude 3.5 Sonnet / Haiku (Reasoning Effort: Medium) |
| **SecOps-Vanguard** | *Security & Compliance Engineer* | Performs automated AST static analysis (Semgrep/SAST), secret scanning, software supply chain auditing (SBOM), and CVE threat boundary enforcement. Holds veto power over builds. | Claude 3.5 Sonnet (Reasoning Effort: High) |
| **DocuForge** | *Docs & DevEx Synthesizer* | Synchronizes OpenAPI/Swagger specifications, maintains Architecture Decision Records (ADRs), generates developer migration guides, and writes concise pull request release notes. | Claude 3.5 Haiku / Sonnet (Reasoning Effort: Low) |
| **SentryWatch** | *Observability & Reliability Analyst* | Continuously monitors production telemetry (Datadog, Grafana, Sentry), detects runtime anomalies, auto-triages regressions, and proactively files and dispatches self-healing maintenance workpacks. | Claude 3.5 Sonnet (Reasoning Effort: Medium) |

---

### 4. Key Functional Modules & Screens

#### 4.1 Factory Overview Dashboard (`Overview`)
* **Executive Telemetry Cards**:
  * *Output Velocity*: Merged PR count (e.g., 48 PRs/wk, +34%), spec-to-merge cycle time (4.2m average).
  * *Code Synthesized*: Total LOC produced and net delta with a 99.8% test pass rate indicator.
  * *Agent Pipeline Health*: Active operational count (6/6 dedicated specialists online, 100% pipeline load).
  * *Spend & Compute Burn*: Real-time month-to-date dollar spend ($384.20) against spend caps ($5,000 monthly target).
  * *Zero-Intervention Rate*: Percentage of pipeline builds merged autonomously without manual human patch intervention (88.4%).
* **Active Delivery Pipeline Feed**: Real-time progress tracker showing in-flight epics with phase progression (e.g., Spec Drafting -> Code Synthesis -> Sandbox Verification), live completion bars, and ETA readouts.
* **Shipped Milestones & Recent PR Releases**: Instant log of auto-merged pull requests with branch tags, time-since-merge, and change magnitude metrics.
* **Infrastructure Cluster Telemetry**: Persistent monitoring of cluster GPU VRAM utilization (e.g., 78% of 800 GB), prompt context cache hit ratios (94.2%), and P99 inference latency (24.1 ms).

#### 4.2 Mission Control (`Pipeline Orchestrator`)
* **Sequential 4-Stage Stepper**:
  * *Stage 1 (Product Spec & Contracts)* — Architect-Prime execution with time-to-spec metrics.
  * *Stage 2 (Architecture Decomposition)* — Dependency tree resolution and interface definitions.
  * *Stage 3 (Code Synthesis)* — Live token streaming, code generation rate (128 T/s), elapsed duration, and diff completeness.
  * *Stage 4 (Verification & Security)* — Ephemeral container execution, test suite passing, and SAST clearance.
* **Interactive Agent Steering & Guardrails**:
  * Real-time text injection box allowing human engineers to provide steering hints, negative prompt constraints, or architectural clarifications mid-synthesis.
  * *Pipeline Controls*: One-click `Fork Pipeline`, `Pause Execution`, and `Steer Agent`.
* **Curated Telemetry Stream**: Monospace event log capturing linting milestones, AST parsing passes, heartbeat signals, and model token outputs.
* **Active PR Build Queue Table**: High-density DataGrid displaying branch tags, scope descriptions, net diff impact (+/- lines), assigned agent badges, real-time progress bars, diff previews, and `Auto-Release` triggers.

#### 4.3 Task Matrix (`Swarm Kanban Board`)
* **Kanban Workflow Columns**:
  * *Queued Tasks*: Intake backlog parsed from Jira/GitHub issues.
  * *Spec & Planning*: Active architecture decomposition with blocker severity tags (`P0 Blocker`, `P1 High`).
  * *In Progress*: Active code synthesis tasks showing live diff streams (`filename.ts`, tokens consumed, completion percentage).
  * *Awaiting Review / Verification*: Ephemeral preview sandbox links and security gate approvals.
  * *Done Today*: Auto-merged workpacks.
* **Filtering & Command Bar**:
  * Team filter pills (All Specialists, Architect-Prime, CodeCraft, GateKeeper, etc.).
  * Severity filters (`P0 Blocker`, `High`, `Normal`).
  * Global filter input (`Ctrl+F`) and `+ New Workpack Spec` quick creator.

#### 4.4 Fleet Operations & Model Tuning (`Agent Configuration`)
* **Hierarchical Agent Cards**:
  * *Lead Orchestrator Card* (Architect-Prime) featured prominently at top center with system prompt configuration and duty topology.
  * *Specialist Cards* arranged in balanced rows (DocuForge, CodeCraft, GateKeeper, SecOps-Vanguard, SentryWatch).
* **Per-Agent Model Controls**:
  * *Model Family Switcher*: Segmented controls to select optimal LLMs per role (`Fable`, `Opus`, `Sonnet`, `Haiku`).
  * *Reasoning Effort Chips*: Granular compute allocation selectors (`Low`, `Med`, `High`, `Max`).
  * Direct manual triggers (`Run now`) and prompt inspect actions (`Edit system prompt`).
* **24h Token Consumption Telemetry**: Area chart tracking cumulative token burn and model distribution (Claude, DeepSeek, GPT-4o) over time.

#### 4.5 Modals & Overlays
* **Right-Side Full-Height Agent Tuning Drawer**:
  * Docks flush to the right viewport edge.
  * Allows uploading custom agent skill plugins and toggling specific capabilities on/off.
  * Autonomy policy configuration (Autonomous, Draft-and-Queue, Propose-Only).
  * System prompt editor and parameter deployment (`Deploy Parameters`).
* **Pipeline Budget & Safeguards Modal**:
  * Replaces rigid token quotas with dollar spend allocation and runway metrics.
  * *Interactive Soft Limit Alert*: Editable numeric percentage field (default 80% / $4,000) with synchronized range slider and instant dollar computation.
  * *Interactive Hard Cap Safeguard*: Editable numeric ceiling (default 100% / $5,000) with range slider and automated pipeline throttling trigger upon breach.

---

### 5. Design System Specifications (Microsoft Fluent 2)
* **Design Language**: Microsoft Fluent Design System 2 (Dark Enterprise Palette).
* **Color Hierarchy**:
  * Canvas Background: `#131313` / `#1a1a1a` deep acrylic base.
  * Elevated Card Surfaces: `#202020` with subtle translucent acrylic layers and `1px` subtle borders (`rgba(255, 255, 255, 0.08)`).
  * Primary Accent: Microsoft Fluent Blue (`#118dff` / `#0078d4`) for key interactive buttons, active tab indicators, and progress tracks.
  * Status Accents: Forest Green (`#10b981`) for passing gates/online status; Soft Coral (`#ef4444`) for blockers and hard caps; Golden Amber (`#f59e0b`) for warnings and queue pauses.
* **Typography**: Segoe UI Variable / Geist with clear tabular numeric alignment for metrics, timestamps, and token counts.
* **Geometry**: 6px–8px border radius on cards, 4px on buttons and input fields, full pill radii on status tags.

---

### 6. Technical & Operational Workflow
1. **Intake & Work Breakdown**: A product epic, GitHub issue, or Sentry alert is received. Architect-Prime analyzes the issue, parses AST dependencies, and breaks the requirement into atomic tasks in the Task Matrix.
2. **Contract Generation**: Architect-Prime authors interface contracts and Playwright test assertions before code is generated.
3. **Synthesis**: CodeCraft initiates code synthesis, outputting streaming diffs to the Mission Control queue.
4. **Verification Sandbox**: GateKeeper deploys the generated branch into an ephemeral container and runs verification test suites.
5. **Security Clearance**: SecOps-Vanguard scans AST mutations and third-party dependencies for CVEs and privilege escalations.
6. **Documentation & Merge**: DocuForge updates OpenAPI contracts and authors release notes; the pull request is auto-merged and deployed to staging.
7. **Continuous Observability**: SentryWatch monitors post-deployment metrics, completing the closed-loop factory lifecycle.
