import type { DatabaseSync } from 'node:sqlite';
import type { ProjectState, StoredResponse } from '../../src/mocks/backend/store';

export function saveProject(db: DatabaseSync, ps: ProjectState): void {
  const p = ps.project;

  // Save project
  db.prepare(`
    INSERT INTO projects (id, name, repo, defaultBranch, createdAt, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      repo = excluded.repo,
      defaultBranch = excluded.defaultBranch,
      data = excluded.data;
  `).run(p.id, p.name, p.repo, p.defaultBranch, p.createdAt, JSON.stringify(p));

  // Save repository
  if (ps.repository) {
    db.prepare(`
      INSERT INTO repositories (projectId, data)
      VALUES (?, ?)
      ON CONFLICT(projectId) DO UPDATE SET data = excluded.data;
    `).run(p.id, JSON.stringify(ps.repository));
  } else {
    db.prepare('DELETE FROM repositories WHERE projectId = ?').run(p.id);
  }

  // Save policies
  db.prepare(`
    INSERT INTO policies (projectId, data)
    VALUES (?, ?)
    ON CONFLICT(projectId) DO UPDATE SET data = excluded.data;
  `).run(p.id, JSON.stringify(ps.policies));

  // Save slack settings
  db.prepare(`
    INSERT INTO slack_settings (projectId, channel, rawWebhook, data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(projectId) DO UPDATE SET
      channel = excluded.channel,
      rawWebhook = excluded.rawWebhook,
      data = excluded.data;
  `).run(p.id, ps.slack.channel ?? '', ps.slack.rawWebhook ?? null, JSON.stringify(ps.slack));

  // Save token
  db.prepare(`
    INSERT INTO project_tokens (projectId, tokenHash, data)
    VALUES (?, ?, ?)
    ON CONFLICT(projectId) DO UPDATE SET
      tokenHash = excluded.tokenHash,
      data = excluded.data;
  `).run(p.id, ps.token.hash ?? '', JSON.stringify(ps.token));

  // Save budget
  db.prepare(`
    INSERT INTO budgets (projectId, capUsdMicros, softLimitPercent, slackChannel, periodStartMs)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(projectId) DO UPDATE SET
      capUsdMicros = excluded.capUsdMicros,
      softLimitPercent = excluded.softLimitPercent,
      slackChannel = excluded.slackChannel,
      periodStartMs = excluded.periodStartMs;
  `).run(p.id, ps.budget.capUsdMicros ?? 0, ps.budget.softLimitPercent ?? 80, ps.budget.slackChannel ?? '', ps.budget.periodStartMs ?? 0);

  // Save Integrations
  const saveIntegration = db.prepare(`
    INSERT INTO integrations (projectId, id, enabled, data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      enabled = excluded.enabled,
      data = excluded.data;
  `);
  for (const i of ps.integrations) {
    saveIntegration.run(p.id, i.id, i.enabled ? 1 : 0, JSON.stringify(i));
  }

  // Save Vault Keys
  const saveVault = db.prepare(`
    INSERT INTO vault_keys (projectId, name, data)
    VALUES (?, ?, ?)
    ON CONFLICT(projectId, name) DO UPDATE SET data = excluded.data;
  `);
  for (const v of ps.vault) {
    saveVault.run(p.id, v.name, JSON.stringify(v));
  }

  // Save Epics
  const saveEpic = db.prepare(`
    INSERT INTO epics (projectId, id, title, status, createdAt, data, dagNodes, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      data = excluded.data,
      dagNodes = excluded.dagNodes,
      meta = excluded.meta;
  `);
  for (const epic of ps.epics) {
    const meta = ps.epicMeta.get(epic.id) ?? {};
    const dags = ps.dags.get(epic.id) ?? [];
    saveEpic.run(
      p.id,
      epic.id,
      epic.title,
      epic.status,
      epic.createdAt,
      JSON.stringify(epic),
      JSON.stringify(dags),
      JSON.stringify(meta)
    );
  }

  // Save Contracts
  const saveContract = db.prepare(`
    INSERT INTO contracts (projectId, id, kind, locked, data, attachedWorkpackIds)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      kind = excluded.kind,
      locked = excluded.locked,
      data = excluded.data,
      attachedWorkpackIds = excluded.attachedWorkpackIds;
  `);
  for (const c of ps.contracts) {
    const attached = [...ps.attached.entries()].filter(([, contracts]) => contracts.includes(c.id)).map(([wId]) => wId);
    saveContract.run(p.id, c.id, c.kind, c.locked ? 1 : 0, JSON.stringify(c), JSON.stringify(attached));
  }

  // Save Workpacks
  const saveWp = db.prepare(`
    INSERT INTO workpacks (projectId, id, title, status, priority, epicId, archived, version, createdAt, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      priority = excluded.priority,
      epicId = excluded.epicId,
      archived = excluded.archived,
      version = excluded.version,
      data = excluded.data;
  `);
  for (const wp of ps.workpacks) {
    saveWp.run(
      p.id,
      wp.id,
      wp.title,
      wp.status,
      wp.priority,
      wp.epicId ?? null,
      wp.archived ? 1 : 0,
      wp.version ?? 1,
      wp.createdAt,
      JSON.stringify(wp)
    );
  }

  // Save Runs
  const saveRun = db.prepare(`
    INSERT INTO runs (projectId, id, workpackId, agentId, status, startedAt, endedAt, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      status = excluded.status,
      endedAt = excluded.endedAt,
      data = excluded.data;
  `);
  for (const run of ps.runs) {
    saveRun.run(
      p.id,
      run.id,
      run.workpackId,
      run.agentId,
      run.status,
      run.startedAt,
      run.endedAt ?? null,
      JSON.stringify(run)
    );
  }

  // Save Files
  const saveFile = db.prepare(`
    INSERT INTO files (projectId, workpackId, path, original, modified, finalContent, lockedBy, writing)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(projectId, workpackId, path) DO UPDATE SET
      original = excluded.original,
      modified = excluded.modified,
      finalContent = excluded.finalContent,
      lockedBy = excluded.lockedBy,
      writing = excluded.writing;
  `);
  for (const [wId, files] of ps.files.entries()) {
    for (const f of files) {
      saveFile.run(p.id, wId, f.path, f.original ?? '', f.modified ?? '', f.final ?? '', f.lockedBy ?? null, f.writing ? 1 : 0);
    }
  }

  // Save Steering Suggestions
  const saveSuggestion = db.prepare(`
    INSERT INTO steering_suggestions (projectId, id, runId, status, createdAt, data)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      status = excluded.status,
      data = excluded.data;
  `);
  for (const s of ps.suggestions) {
    saveSuggestion.run(p.id, s.id, s.runId, s.status, s.createdAt, JSON.stringify(s));
  }

  // Save Steering Hints
  const saveHint = db.prepare(`
    INSERT INTO steering_hints (projectId, id, runId, approvedAt, data)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET data = excluded.data;
  `);
  for (const h of ps.hints) {
    saveHint.run(p.id, h.id, h.runId, h.approvedAt, JSON.stringify(h));
  }

  // Save Agents
  const saveAgent = db.prepare(`
    INSERT INTO agents (projectId, id, name, status, data)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      name = excluded.name,
      status = excluded.status,
      data = excluded.data;
  `);
  const saveAgentVer = db.prepare(`
    INSERT INTO agent_versions (projectId, agentId, version, data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(projectId, agentId, version) DO UPDATE SET data = excluded.data;
  `);
  for (const ag of ps.agents) {
    saveAgent.run(p.id, ag.id, ag.name, ag.status ?? 'idle', JSON.stringify(ag));
    for (const v of ag.versions) {
      saveAgentVer.run(p.id, ag.id, v.version, JSON.stringify(v));
    }
  }

  // Save Intake
  const saveIntake = db.prepare(`
    INSERT INTO intake_events (projectId, id, createdAt, data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET data = excluded.data;
  `);
  for (const inEvent of ps.intake) {
    saveIntake.run(p.id, inEvent.id, inEvent.createdAt, JSON.stringify(inEvent));
  }

  // Save Issues
  const saveIssue = db.prepare(`
    INSERT INTO issues (projectId, number, data)
    VALUES (?, ?, ?)
    ON CONFLICT(projectId, number) DO UPDATE SET data = excluded.data;
  `);
  for (const issue of ps.issues) {
    saveIssue.run(p.id, issue.number, JSON.stringify(issue));
  }

  // Save Audit Log
  const saveAudit = db.prepare(`
    INSERT INTO audit_log (projectId, id, createdAt, actor, action, prevHash, hash, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(projectId, id) DO UPDATE SET
      hash = excluded.hash,
      data = excluded.data;
  `);
  for (const entry of ps.audit) {
    saveAudit.run(
      p.id,
      entry.id,
      entry.createdAt,
      entry.actor ?? '',
      entry.action ?? '',
      entry.prevHash ?? '',
      entry.hash ?? '',
      JSON.stringify(entry)
    );
  }

  // Save Spend Ledger
  const saveSpend = db.prepare(`
    INSERT INTO spend_ledger (projectId, at, usdMicros, source, epicId, workpackId, agentId)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `);
  const spendCountRow = db.prepare('SELECT COUNT(*) as count FROM spend_ledger WHERE projectId = ?').get(p.id) as { count: number };
  if (spendCountRow.count === 0 && ps.spend.length > 0) {
    for (const s of ps.spend) {
      saveSpend.run(p.id, s.at, s.usdMicros, s.source, s.epicId ?? null, s.workpackId ?? null, s.agentId ?? null);
    }
  }
}

export function saveIdempotency(db: DatabaseSync, key: string, resp: StoredResponse): void {
  db.prepare(`
    INSERT INTO idempotency_cache (key, fingerprint, status, body, contentType, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      fingerprint = excluded.fingerprint,
      status = excluded.status,
      body = excluded.body,
      contentType = excluded.contentType,
      createdAt = excluded.createdAt;
  `).run(key, resp.fingerprint, resp.status, resp.body, resp.contentType, Date.now());
}

export function getIdempotency(db: DatabaseSync, key: string): StoredResponse | null {
  const row = db.prepare('SELECT fingerprint, status, body, contentType FROM idempotency_cache WHERE key = ?').get(key) as {
    fingerprint: string;
    status: number;
    body: string;
    contentType: string;
  } | undefined;
  if (!row) return null;
  return {
    fingerprint: row.fingerprint,
    status: row.status,
    body: row.body,
    contentType: row.contentType,
  };
}
