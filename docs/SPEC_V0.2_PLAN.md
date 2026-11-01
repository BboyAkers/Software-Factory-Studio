# Build Plan — Technical Spec v0.2 (Synthetix Factory OS)

> **Status:** Approved to build · **Source:** Deep-dive Q&A (22 rounds, 60+ locked decisions) against `TECHNICAL_SPEC.md` v0.1 + PRD + 8x `src/pages/*/DESIGN.md`
> **Goal:** Turn v0.1 into a complete, internally-consistent v1 scope for the software factory. No code changes in this plan — spec edits only.

---

## 1. Decision Log (locked)

### 1.1 Intake & source of truth
- GitHub Issues wins globally as Epic source of truth. No dupes: same URL/key link is canonical.
- Remove source-of-truth picker from onboarding wizard.
- Drop Jira intake in v1. Jira integration deferred (no mirror, no intake).
- SentryWatch enters **via GitHub issue auto-file** when fingerprint has no open match. Dedupe window: open issues only.
- Epics auto-start (no approval gate). Spending starts immediately on intake.
- Spec Studio input: formal DSL = Markdown + frontmatter, full-set required, auto-fix with diff-accept.

### 1.2 Lifecycle & Kanban
- `failed` / `cancelled` → auto-archive view, not columns. Keep 6-column Task Matrix + filter/badge for archived.
- Pause at both levels: global project kill-switch + per-workpack / per-epic pause. Broadcast global via Temporal signals.
- Concurrency: global 8 concurrent workpacks per project. No per-column WIP enforcement; show counts only.
- File overlap: queue-on-lock (second workpack stays `queued` until `target_files` free). Rebase before gates still applies after lock release.
- P0/P1 queue-jump only (no 20% reserve). FIFO + global 8-cap otherwise.
- SLAs: P0 4h, P1 24h, P2 best-effort. Breach → auto-escalate priority + Slack page to on-call.
- `max_attempts` fixed at 3 for all stages/priorities.
- Abort/cancel: kill run, keep branch + PR open for pickup, workpack → `cancelled` → auto-archive.
- Fork = clone workpack (`-fork-N` branch from same commit SHA), new `WorkpackWorkflow`, same Epic.

### 1.3 Human-in-loop
- Viewer suggest queue: any viewer can suggest; Engineer+ approves → injects at next turn boundary. G4 2s SLA measured **after approval**, not suggest time.
- Steering kinds kept: `hint` / `constraint` / `veto`. Veto rolls back current turn tools.
- Human file lock wins, per-run lifetime (releases on gate finish / run end). Agent writes to locked file rejected at MCP layer + `policy.violation` event.
- Write path = file editor only. Terminal is safe read-only commands (`vitest`, `git diff`, `tsc --noEmit`, log tail, dry-run preview). No `--write` escalation in v1.
- Reasoning trace: summaries only (no raw CoT). Step title + status, no token dump.

### 1.4 Gates & Quality
- Keep 6 core gates + add all extras in v1: perf budgets (bundle delta, LCP/p95), a11y, i18n, migration safety.
- Enforce: **warn-only for perf/a11y/i18n, block on migrations + new criticals**. Criticals = new high/critical SAST/CVE, failing migration dry-run, contract break.
- GateKeeper: full test edit allowed, but **second-agent review guardrail**: any test add/edit/delete needs Architect-Prime or second GateKeeper run review before merge (reconciles R1 anti-gaming).
- Flaky: 2x isolated retry → quarantine + auto-file GitHub `flaky-test` issue. Does not block merge but listed in PR body.
- Preview: no deployed preview. Screenshots-only: Playwright captures in sandbox → object store, 30d TTL, viewport matrix in Quality UI.
- Promote = merge to main (`factory/<wp-id>-<slug>`, check-runs `factory/gates/*`), then auto staging deploy. Rollback = revert commit (new PR) + reopen workpack on failure.
- Contract unlock: Maintainer one-click unlock + audit entry. Otherwise locked contracts immutable.
- DocuForge Done requirement: PR summary + changelog + OpenAPI sync when public interfaces touched. Full ADRs/migration guides on-demand only.

### 1.5 Budget & spend
- Enforceable caps: project/monthly only. Epic/workpack/agent tracked as attribution, not caps.
- Keep 80% soft / 100% hard defaults. Soft = Slack + Studio toast alert-only (auto-throttle default OFF — resolves conflict, see §2).
- Hard cap: deny reservations → finish current turn → pause (not fail). New runs blocked. Cap raise → auto-resume all paused in priority order.
- Overview KPIs v1 (standard 4, fixed windows): velocity (merged PRs/wk + %), zero-intervention rate, cost per merged PR, spec-to-merge p50/p90. Windows: 24h + 7d. Spend attribution by epic + agent shown, but cap is project-level.

### 1.6 Fleet / runtime / index
- Provider-only v1 (no vLLM/H100). Drop VRAM/GPU cards; show provider latency, cache-hit, token burn.
- Fixed specialist→model mapping + ordered fallback. Families: Claude Sonnet/Opus/Haiku + DeepSeek-V3 + GPT-4o. No admin free-form IDs in v1.
- Node-only sandbox images (nightly rebuild, cosigned). Synthesize TS/JS only in v1.
- Index on-push: TS + Python + Go + Java + Markdown docs + OpenAPI specs. Ignore: `node_modules/`, `dist/`, `build/`, `*.lock`, binaries, generated. Touched-files-only deferred.
- Sandbox fleet: factory-hosted Firecracker on KVM bare-metal only. No BYO runners, no hosted E2B in v1.
- Skills: Markdown prompt + `tools[]` allow-list JSON. No JS bundles. Toggles for capabilities.
- Eval: 200 historical tickets, nightly + on agent-config change. Block active-version promotion on >2pt gate first-pass regression or >10% cost/PR regression.
- Retention kept: transcripts 90d, audit 1y, customer code never for training.

### 1.7 DX / API / frontend
- CLI v1 ops set: `factory up | run | steer | pause | logs | budget`. Auth = single project token (from Settings). No OIDC device flow v1.
- Wizard steps: repo URL + PAT (fine-grained) + default branch + monthly cap + auto-merge toggle. No source-of-truth step.
- Tokens: single full-power project token, manual rotation button + audit all uses (see §2 for leak fix).
- Secrets for tests: shared project vault, Maintainer-managed allow-list, per-run scoped env injection.
- Audit: new read-only Audit Log view with hash-chain verify + export. Inline workpack timeline links to it.
- Search: command palette + `Ctrl+F` scope = epics + workpacks + files + logs.
- Routing: TanStack Router deep links `/project/:id/<tab>/<workpackId>/<runId>`. Empty/error/offline states per tab.
- Offline: queue steering hints + Kanban moves, replay on reconnect with version check (`409` + toast on conflict). Block budget/promote offline.
- Org: single org per deployment, no SaaS billing v1.
- Pilot: dogfood this repo first, then 2–3 design-partner repos. GA = P0–P5 phases complete + G1–G5 held 30d on dogfood staging.
- Notifications: Slack only (budget, review, failures). No in-app center, email/Teams/webhooks v1.
- Repro bundle for failed workpack: branch + gate results + run transcript link (in PR body + Quality UI).
- Branch/PR convention kept: `factory/<wp-id>-<slug>` + Gate check-runs.

---

## 2. Conflict Resolutions (safe defaults)

| # | Conflict | Resolution for v0.2 |
|---|----------|---------------------|
| C1 | Kept 80/100 + auto-throttle, then picked alert-only soft action | **Alert-only wins.** Spec v0.2 sets `autoThrottle` default OFF and removes auto-throttle enforcement from Budget service. Keep field for future, document as deferred. |
| C2 | Single full-power token + manual-only leak handling = high risk | **Keep single token, add minimal safety:** one-click Revoke + Regenerate, last-used + actor audit, masked display. Still no scopes/expiry in v1, but leak path is one click. Document as known risk with P1 follow-up for scoped tokens. |
| C3 | Node-only synthesize vs 4-lang + docs indexing | **Index broadly, execute narrowly.** Index TS/Py/Go/Java + MD + OpenAPI on-push now; gates + synthesis support TS/JS only in v1. Other langs return `unsupported_language` at intake validation with clear error. Prevents re-index migration later. |

---

## 3. v1 Scope Lock (in / out)

**In:** GitHub intake, frontmatter DSL, 6+extra gates (warn/block matrix), screenshots-only QA, merge-then-staging, project-cap budget, fixed model map, Node/TS synthesize, on-push index, CLI ops set, wizard, audit view, deep routes, offline steer+moves queue, suggest-queue steering, per-run human lock, clone-fork, queue-on-lock, SLA timers, flaky GitHub issues, shared vault, 200-ticket eval.

**Out (deferred):** Jira intake, multi-repo atomic, self-hosted vLLM, VRAM cards, preview deploys, BYO runners, custom skill bundles, in-app/email/Teams/webhooks notify, per-epic/agent caps, auto-throttle, scoped/expiring tokens, custom branch templates, full offline queue, custom KPI builder, SaaS billing/multi-org.

---

## 4. Section-by-Section Edit Plan for TECHNICAL_SPEC.md v0.2

### §1 Goals & Non-Goals
- Add G1–G5 hold criterion: 30d dogfood staging for GA.
- Non-Goals add: Jira intake, multi-lang synthesize beyond TS/JS, preview deploys, self-hosted inference, multi-org billing, in-app notifications. Explicit so scope is closed.

### §4 Domain Model
- `workpack`: add `archived BOOLEAN DEFAULT false`, `sla_due_at TIMESTAMPTZ`, `sla_breached BOOLEAN`, `fork_of TEXT REFERENCES workpack(id)`, `human_locked_files TEXT[]`, `autonomy_override TEXT NULL`.
- New `steering_suggestion` table: `id, workpack_id/run_id, author_id, text, status (pending/approved/rejected), approver_id, created_at, decided_at`.
- `contract`: add `unlocked_by UUID, unlocked_at TIMESTAMPTZ, unlock_reason TEXT`.
- `gate_result`: add `severity TEXT (block|warn)`, `quarantined BOOLEAN`.
- `audit_log`: add `prev_hash, hash, actor, project_id` (document hash-chain verify API).
- Document auto-archive rule: `failed/cancelled → archived=true` after 5 min, excluded from Kanban default query.

### §5 Lifecycle
- Replace Kanban mapping: 6 columns query `archived=false`; add Archive view spec.
- Add global vs per-workpack pause signals table (`pipeline.pause` vs `workpack.pause`).
- Add SLA timers: P0 4h / P1 24h from `created_at`; breach emits `workpack.sla_breached` + Slack page + priority bump.
- Add file-lock rule: `target_files` overlap → second stays `queued` with `blocked_by` reason; emit `workpack.blocked`.
- Add abort/fork semantics: abort keeps branch/PR; fork clones to `-fork-N`.
- Keep `max_attempts=3` fixed; remove per-stage configurability note.

### §6 Orchestration
- Add signals: `suggestSteer` (viewer) vs `approveSteer` (Engineer+), `pauseWorkpack`/`resumeWorkpack`, `archiveSignal`.
- Document offline replay: mutations carry `If-Match: version`; replay rejects stale with `409`.
- Concurrency: global semaphore 8/project; P0/P1 jump queue (no reserve).

### §7 Agent Runtime
- Steering: suggest queue flow (pending → approved → inject next turn). G4 2s measured post-approval.
- Human lock: per-run `human_locked_files`; MCP `fs.write` deny + `policy.violation`.
- Terminal: safe-command allow-list (`vitest`, `git diff/status/log`, `tsc --noEmit`, `ls/cat`, log tail). Editor is sole write path.
- Reasoning: summaries-only schema (`step, title, status`), no raw CoT storage.
- AgentConfig: fixed `primary/fallbacks` table per specialist; admin cannot free-type model IDs v1. Skills schema: `{name, promptMarkdown, tools[]}`.
- Eval gate: 200 nightly + on-change; promotion blocked on regression thresholds.

### §8 Gates (rewrite as matrix)
| Gate | Block / Warn | Notes |
|------|--------------|-------|
| types_lint, unit_integration, contract, diff.scope, migration dry-run, new critical SAST/CVE | BLOCK | Must pass |
| perf bundle/LCP/p95, a11y, i18n | WARN | Shown in Quality + PR body, non-blocking |
| flaky | QUARANTINE | Auto GitHub `flaky-test` issue, non-blocking |
- Add screenshot capture: Playwright in sandbox → S3 `previews/<wp>/<sha>/<viewport>.png`, 30d TTL, signed GET.
- Add test-review guardrail: GateKeeper test diffs need second-agent approve activity before `finalize`.
- Maintainer unlock flow: `POST /contracts/:id/unlock {reason}` → audit.

### §10 API (deltas)
- Add: `POST /steering/suggest`, `POST /steering/:id/approve|reject`
- Add: `POST /workpacks/:id/archive`, `GET /workpacks?archived=`
- Add: `POST /contracts/:id/unlock`
- Add: `GET /audit?workpack=&actor=&since=` + `GET /audit/verify`
- Add: `GET /search?q=&scope=epics,workpacks,files,logs`
- Add: `POST /flaky` internal → GitHub issue (document, not public)
- Add: `GET /projects/onboarding/template`, `POST /projects/connect` (wizard)
- Add: `GET /tokens`, `POST /tokens/rotate` (single-token + revoke/regen)
- Add: `GET /vault/keys`, `PUT /vault/keys` (Maintainer)
- Document `If-Match` + `Idempotency-Key` on all mutations.

### §10.3 Events (deltas)
- Add: `workpack.blocked`, `workpack.archived`, `workpack.sla_breached`, `steering.suggested|approved|rejected`, `contract.unlocked`, `policy.violation`, `token.rotated`.

### §11 Budget
- Enforce project cap only. Epic/agent/workpack spend = attribution views (`GET /budget/attribution?by=epic,agent`).
- Soft = alert-only (toast + Slack + `budget.updated`). Remove auto-throttle enforcement; mark `autoThrottle` deprecated-OFF.
- Hard raise → `budget.resumed` event + auto-resume all paused priority-ordered.

### §12 LLM Gateway
- Fixed routing table (Architect-Prime → Claude Opus → Sonnet → GPT-4o, etc.). Document exact map in spec table.
- Remove VRAM telemetry; Fleet shows latency, cache-hit, burn, failover rate.

### §13 Integrations
- GitHub-wins dedupe rule: intake checks `source_ref` URL/key uniqueness; duplicates link to canonical Epic, no second Epic.
- Sentry → GitHub issue → Epic pipeline (no direct Epic).
- Jira section replaced with `Deferred to post-v1` note.
- Wizard API + branch convention + check-runs kept. No source-of-truth step.
- Slack-only notify table (budget, review-request, failure, SLA breach). Others deferred.

### §14 Security
- Single project token: masked display, last-used, one-click rotate, `token.rotated` audit. Document residual risk + P1 follow-up for scoped tokens.
- Shared vault: Maintainer allow-list, per-run scoped env, redacted in logs/transcripts.
- Editor-write vs terminal-read enforcement matrix.

### §15 Observability
- KPIs fixed: velocity, zero-intervention, cost/PR, cycle p50/p90 (24h + 7d). Attribution by epic/agent.
- SLIs add: steer-approve-to-inject p95, SLA breach rate, offline-replay conflict rate.

### §16 Frontend Plan
- Routes: `/p/:project/overview|mission|matrix|workspace/:wpId/:runId|quality/:wpId|spec|fleet|settings|audit`.
- New Audit Log view + verify button.
- Palette search scope + offline banner + queue indicator.
- Empty/error states per tab (no data, stream disconnected, gate failed).
- `VITE_USE_MOCKS` migration order kept; add audit + search + routes as step 6.

### Appendices
- Appx C: Frontmatter DSL schema (required: `title, mode, priority, areas[], acceptance[]`; optional: `contracts[], dag_hints, budget_cap_note, test_plan`; validation → auto-fix diff-accept in Spec Studio, `unsupported_language` for non-TS).
- Appx D: CLI reference (`up|run|steer|pause|logs|budget` + flags + exit codes).
- Appx E: Repro bundle format (branch, commit, gate JSON, transcript URI, vault-redacted env list).
- Appx F: Screenshot store layout + signed URL TTL.
- Update Appx A ownership: add `audit` view → API/Audit service; `search` → API.

### §17–19 Roadmap
- P0–P5 exit = GA. Dogfood-first pilot gate before external. No date changes, add Dogfood acceptance: green PR end-to-end + hard-cap drill + 200-eval pass.

---

## 5. Implementation Checklist (spec-edit tasks)

- [ ] §1, §4 DDL + archive/SLA/lock/suggest tables
- [ ] §5 state + pause + SLA + lock + abort/fork rewrite
- [ ] §6 signals + offline replay + semaphore
- [ ] §7 steering queue + lock + terminal allow-list + fixed model map + skill schema + eval
- [ ] §8 warn/block matrix + screenshots + review guardrail + unlock
- [ ] §10 REST + SSE event additions
- [ ] §11 project-cap + alert-only + auto-resume + attribution
- [ ] §12 fixed routing, drop VRAM
- [ ] §13 GitHub-wins, Sentry-via-GitHub, Jira deferred, wizard
- [ ] §14 token rotate + vault + write matrix
- [ ] §15 KPIs + new SLIs
- [ ] §16 routes + audit + search + offline
- [ ] Appx C–F new + A–B updates
- [ ] §17–19 dogfood + GA criteria

---

## 6. Risks Carried Into v0.2

- Single full-power token (C2) — mitigated to one-click rotate + audit; scoped tokens are P1.
- TS-only synthesize limits pilot repo choice — dogfood repo must be TS.
- Suggest-queue adds approval latency — G4 SLA post-approval only; monitor approval p95 as new SLI.
- Warn-only perf/a11y may accumulate debt — track warn counts in Overview quality tile.

---

*End of plan. Next step: apply edits to `docs/TECHNICAL_SPEC.md` → v0.2 draft + open review.*
