import type { DatabaseSync } from 'node:sqlite';

export function createSchema(db: DatabaseSync): void {
  db.exec(`
    -- Projects
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo TEXT NOT NULL,
      defaultBranch TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      data TEXT NOT NULL
    );

    -- Repository connection status per project
    CREATE TABLE IF NOT EXISTS repositories (
      projectId TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      data TEXT NOT NULL
    );

    -- Integrations
    CREATE TABLE IF NOT EXISTS integrations (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    -- Policies
    CREATE TABLE IF NOT EXISTS policies (
      projectId TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      data TEXT NOT NULL
    );

    -- Slack Settings
    CREATE TABLE IF NOT EXISTS slack_settings (
      projectId TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      rawWebhook TEXT,
      data TEXT NOT NULL
    );

    -- Project Tokens
    CREATE TABLE IF NOT EXISTS project_tokens (
      projectId TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      tokenHash TEXT NOT NULL,
      data TEXT NOT NULL
    );

    -- Vault Keys
    CREATE TABLE IF NOT EXISTS vault_keys (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, name)
    );

    -- Budget & Spend
    CREATE TABLE IF NOT EXISTS budgets (
      projectId TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      capUsdMicros INTEGER NOT NULL,
      softLimitPercent INTEGER NOT NULL,
      slackChannel TEXT NOT NULL,
      periodStartMs INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spend_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      at TEXT NOT NULL,
      usdMicros INTEGER NOT NULL,
      source TEXT NOT NULL,
      epicId TEXT,
      workpackId TEXT,
      agentId TEXT
    );

    -- Epics
    CREATE TABLE IF NOT EXISTS epics (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      data TEXT NOT NULL,
      dagNodes TEXT NOT NULL DEFAULT '[]',
      meta TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (projectId, id)
    );

    -- Contracts
    CREATE TABLE IF NOT EXISTS contracts (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL,
      attachedWorkpackIds TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (projectId, id)
    );

    -- Workpacks
    CREATE TABLE IF NOT EXISTS workpacks (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      epicId TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    -- Runs
    CREATE TABLE IF NOT EXISTS runs (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      workpackId TEXT NOT NULL,
      agentId TEXT NOT NULL,
      status TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    -- Run Logs
    CREATE TABLE IF NOT EXISTS run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      runId TEXT NOT NULL,
      seq INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    -- Run Reasoning Steps
    CREATE TABLE IF NOT EXISTS run_reasoning (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      runId TEXT NOT NULL,
      stepIndex INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    -- Files touched by workpacks
    CREATE TABLE IF NOT EXISTS files (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      workpackId TEXT NOT NULL,
      path TEXT NOT NULL,
      original TEXT NOT NULL,
      modified TEXT NOT NULL,
      finalContent TEXT NOT NULL,
      lockedBy TEXT,
      writing INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (projectId, workpackId, path)
    );

    -- Steering Suggestions & Hints
    CREATE TABLE IF NOT EXISTS steering_suggestions (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      runId TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    CREATE TABLE IF NOT EXISTS steering_hints (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      runId TEXT NOT NULL,
      approvedAt TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    -- Quality Gates Results
    CREATE TABLE IF NOT EXISTS gate_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      workpackId TEXT NOT NULL,
      data TEXT NOT NULL
    );

    -- Screenshots
    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      workpackId TEXT NOT NULL,
      url TEXT NOT NULL,
      caption TEXT NOT NULL,
      at TEXT NOT NULL
    );

    -- Agents & Versions
    CREATE TABLE IF NOT EXISTS agents (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    CREATE TABLE IF NOT EXISTS agent_versions (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      agentId TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, agentId, version)
    );

    -- Intake Events & GitHub Issues
    CREATE TABLE IF NOT EXISTS intake_events (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, number)
    );

    -- Tamper-evident Audit Log Chain
    CREATE TABLE IF NOT EXISTS audit_log (
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      prevHash TEXT NOT NULL,
      hash TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (projectId, id)
    );

    -- Per-run Terminal Scrollback
    CREATE TABLE IF NOT EXISTS terminals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      runId TEXT NOT NULL,
      stream TEXT NOT NULL,
      text TEXT NOT NULL,
      at TEXT NOT NULL
    );

    -- Idempotency Cache
    CREATE TABLE IF NOT EXISTS idempotency_cache (
      key TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      status INTEGER NOT NULL,
      body TEXT NOT NULL,
      contentType TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    -- Indexes for fast queries
    CREATE INDEX IF NOT EXISTS idx_workpacks_project ON workpacks(projectId);
    CREATE INDEX IF NOT EXISTS idx_workpacks_status ON workpacks(projectId, status);
    CREATE INDEX IF NOT EXISTS idx_workpacks_epic ON workpacks(projectId, epicId);
    CREATE INDEX IF NOT EXISTS idx_runs_workpack ON runs(projectId, workpackId);
    CREATE INDEX IF NOT EXISTS idx_run_logs_run ON run_logs(projectId, runId);
    CREATE INDEX IF NOT EXISTS idx_run_reasoning_run ON run_reasoning(projectId, runId);
    CREATE INDEX IF NOT EXISTS idx_audit_project_at ON audit_log(projectId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_spend_project_at ON spend_ledger(projectId, at);
  `);
}
