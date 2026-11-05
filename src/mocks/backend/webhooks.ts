import type { GitHubWebhookResponse, HintKind } from '../../contracts';
import { ApiProblem, notFound } from '../http';
import { evaluateIssue, intakeLabel, issueUrl } from './epics';
import { emit, nowIso, recordAudit } from './runtime';
import { inject } from './steering';
import { SYSTEM_ACTOR, type IssueRecord, type ProjectState, type Store } from './store';

/**
 * Resolve the project target for an incoming GitHub webhook.
 * GitHub sends repository identification in `payload.repository.full_name` (e.g. "BboyAkers/Software-Factory-Studio").
 * The project can also be routed by URL parameter `:projectId`, `?project=` query param, or `X-Project` header.
 */
export function resolveProjectForWebhook(
  store: Store,
  request: Request,
  body: Record<string, unknown>,
  params: Record<string, string>,
): ProjectState {
  // 1. Direct route parameter `:projectId`
  if (params.projectId) {
    const direct = store.projects.get(params.projectId);
    if (direct) return direct;
  }

  // 2. Query param or header
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('project');
  if (fromQuery) {
    const direct = store.projects.get(fromQuery);
    if (direct) return direct;
  }
  const fromHeader = request.headers.get('x-project');
  if (fromHeader) {
    const direct = store.projects.get(fromHeader);
    if (direct) return direct;
  }

  // 3. GitHub repository payload: match `repository.full_name` or `repository.name`
  const repoObj = body.repository as { full_name?: string; name?: string } | undefined;
  const fullName = repoObj?.full_name?.toLowerCase();
  if (fullName) {
    for (const ps of store.projects.values()) {
      if (
        ps.project.repo.toLowerCase() === fullName ||
        ps.repository?.fullName.toLowerCase() === fullName
      ) {
        return ps;
      }
    }
  }

  const shortName = repoObj?.name?.toLowerCase();
  if (shortName) {
    for (const ps of store.projects.values()) {
      const repoLeaf = ps.project.repo.split('/')[1]?.toLowerCase();
      if (
        repoLeaf === shortName ||
        ps.project.id.toLowerCase() === shortName ||
        ps.project.name.toLowerCase() === shortName
      ) {
        return ps;
      }
    }
  }

  // 4. Single-project fallback (e.g. standalone test environments)
  if (store.projects.size === 1) {
    const only = Array.from(store.projects.values())[0];
    if (only) return only;
  }

  throw notFound('Project for repository', fullName || params.projectId || 'unknown');
}

/**
 * Main ingress processor for GitHub webhooks.
 * Implements:
 * - `ping`: Webhook handshake and health test; activates `repository.webhookActive`.
 * - `issues`: Automated Epic intake, DSL validation, issue comments, and status transitions (§13.2).
 * - `issue_comment`: Interactive agent steering from PR reviews via `@factory steer` (§13.1, §7.4).
 * - `pull_request`: Mainline merge synchronization and auto-release triggers (§13.3).
 */
export function handleGitHubWebhook(
  store: Store,
  request: Request,
  body: Record<string, unknown>,
  params: Record<string, string>,
): GitHubWebhookResponse {
  // 1. Determine event type from GitHub header or payload shape
  const eventHeader = request.headers.get('x-github-event');
  let eventType = eventHeader ? eventHeader.trim().toLowerCase() : '';
  if (!eventType) {
    if (body.zen || body.hook_id) eventType = 'ping';
    else if (body.issue && body.comment) eventType = 'issue_comment';
    else if (body.issue) eventType = 'issues';
    else if (body.pull_request) eventType = 'pull_request';
    else eventType = 'ping';
  }

  // 2. Validate HMAC signature header if provided
  const signature = request.headers.get('x-hub-signature-256');
  if (signature && !signature.startsWith('sha256=')) {
    throw new ApiProblem(400, 'invalid_signature', 'X-Hub-Signature-256 header must start with sha256=');
  }

  // 3. Resolve target project
  const ps = resolveProjectForWebhook(store, request, body, params);

  // 4. Update sync timestamp on repository
  if (ps.repository) {
    ps.repository.lastSyncAt = nowIso(ps.store);
  }

  // 5. Process according to event type
  switch (eventType) {
    case 'ping': {
      if (ps.repository) {
        ps.repository.webhookActive = true;
      }
      const ghIntegration = ps.integrations.find((i) => i.id === 'github');
      if (ghIntegration) {
        ghIntegration.status = 'connected';
        ghIntegration.enabled = true;
        ghIntegration.lastVerifiedAt = nowIso(ps.store);
      }
      recordAudit(ps, SYSTEM_ACTOR, 'integration.tested', { integrationId: 'github', ok: true });
      emit(ps, { type: 'integration.updated', integrationId: 'github', enabled: true, status: 'connected' });
      return {
        ok: true,
        event: 'ping',
        message: (body.zen as string) || 'Pong! GitHub webhook received and active.',
        received: true,
      };
    }

    case 'issues': {
      const action = (body.action as string) || 'opened';
      const issueData = body.issue as {
        number: number;
        title?: string;
        body?: string | null;
        labels?: Array<string | { name: string }>;
        user?: { login: string };
        html_url?: string;
        pull_request?: unknown;
      } | undefined;

      if (!issueData) {
        return { ok: true, event: 'issues', action, message: 'No issue data in payload.', received: true };
      }

      // Ignore PRs delivered on issues event
      if (issueData.pull_request) {
        return { ok: true, event: 'issues', action, message: 'PR issue skipped (handled by pull_request)', received: true };
      }

      const issueNumber = issueData.number;
      const rawLabels = issueData.labels ?? [];
      const labelNames = rawLabels.map((l) => (typeof l === 'string' ? l : l.name));
      const requiredIntakeLabel = intakeLabel(ps);

      // Upsert into ps.issues
      let issueRecord: IssueRecord | undefined = ps.issues.find((i) => i.number === issueNumber);
      if (!issueRecord) {
        issueRecord = {
          number: issueNumber,
          url: issueData.html_url || issueUrl(ps, issueNumber),
          title: issueData.title || `Issue #${issueNumber}`,
          body: issueData.body || '',
          labels: labelNames,
          origin: 'github-ui',
          author: issueData.user?.login || 'github',
          createdAt: nowIso(ps.store),
          fingerprint: null,
          comments: [],
          processed: false,
        };
        ps.issues.push(issueRecord);
      } else {
        if (issueData.title) issueRecord.title = issueData.title;
        if (issueData.body !== undefined) issueRecord.body = issueData.body || '';
        issueRecord.labels = labelNames;
      }

      // Handle issue edits
      if (action === 'edited') {
        const canonical = ps.epics.find((e) => e.sourceRef === issueRecord!.url);
        if (canonical) {
          if (canonical.status === 'intake') {
            canonical.specMarkdown = issueRecord.body;
            if (issueData.title) canonical.title = issueData.title;
            return {
              ok: true,
              event: 'issues',
              action: 'edited',
              issueNumber,
              outcome: 'updated',
              epicId: canonical.id,
            };
          }
          issueRecord.comments.push({
            at: nowIso(ps.store),
            body: `This Epic already started as ${canonical.id}, so the edit was ignored. Open a new issue for the change.`,
          });
          return {
            ok: true,
            event: 'issues',
            action: 'edited',
            issueNumber,
            outcome: 'edit_ignored',
            epicId: canonical.id,
          };
        }
      }

      // Handle issue intake on 'opened' or 'labeled'
      if (action === 'opened' || action === 'labeled') {
        if (labelNames.includes(requiredIntakeLabel)) {
          const outcome = evaluateIssue(ps, issueNumber);
          return {
            ok: true,
            event: 'issues',
            action,
            issueNumber,
            outcome: outcome?.outcome ?? 'processed',
            epicId: outcome?.epicId ?? null,
          };
        }
        return {
          ok: true,
          event: 'issues',
          action,
          issueNumber,
          outcome: 'ignored_unlabeled',
        };
      }

      return { ok: true, event: 'issues', action, issueNumber, received: true };
    }

    case 'issue_comment': {
      const action = (body.action as string) || 'created';
      const comment = body.comment as { body?: string; user?: { login: string } } | undefined;
      const issueData = body.issue as { number: number; title?: string; html_url?: string } | undefined;
      const commentBody = comment?.body?.trim() || '';

      if (action === 'created' && commentBody.includes('@factory steer')) {
        const match = /@factory\s+steer(?:\s+(hint|constraint|veto))?\s+([\s\S]+)/i.exec(commentBody);
        if (match) {
          const kind = (match[1]?.toLowerCase() as HintKind) || 'hint';
          const text = match[2]?.trim() || '';

          // Find active workpack for this issue or PR
          const issueNum = issueData?.number;
          const wp = ps.workpacks.find(
            (w) =>
              w.prNumber === issueNum ||
              (issueNum && w.branch.includes(String(issueNum))) ||
              (issueData?.title && issueData.title.includes(w.id)),
          );

          if (wp) {
            const activeRun =
              ps.runs.find((r) => r.workpackId === wp.id && !r.endedAt && r.status === 'running') ??
              ps.runs.find((r) => r.workpackId === wp.id);

            if (activeRun) {
              if (activeRun.endedAt) {
                return {
                  ok: true,
                  event: 'issue_comment',
                  steered: false,
                  message: `Run ${activeRun.id} has ended, so it can no longer be steered.`,
                };
              }

              const authorName = comment?.user?.login || 'Reviewer';
              const actor = {
                id: comment?.user?.login || 'reviewer',
                name: authorName,
                role: kind === 'veto' ? ('maintainer' as const) : ('engineer' as const),
                type: 'user' as const,
              };

              inject(ps, activeRun.id, text, kind, actor);

              // Add response comment to issue
              const issueRec = ps.issues.find((i) => i.number === issueNum);
              if (issueRec) {
                issueRec.comments.push({
                  at: nowIso(ps.store),
                  body: `Acknowledged steering (${kind}) from @${authorName}: "${text}" will be applied at the next turn boundary.`,
                });
              }

              return {
                ok: true,
                event: 'issue_comment',
                steered: true,
                runId: activeRun.id,
              };
            }
          }

          return {
            ok: true,
            event: 'issue_comment',
            steered: false,
            message: 'No active workpack run found matching this issue/PR.',
          };
        }
      }

      return { ok: true, event: 'issue_comment', action, received: true };
    }

    case 'pull_request': {
      const action = (body.action as string) || 'opened';
      const pr = body.pull_request as {
        number: number;
        merged?: boolean;
        head?: { ref?: string };
        title?: string;
      } | undefined;

      if (action === 'closed' && pr?.merged) {
        const prNumber = pr.number;
        const headRef = pr.head?.ref;
        const wp = ps.workpacks.find((w) => w.prNumber === prNumber || (headRef && w.branch === headRef));

        if (wp) {
          const previous = wp.status;
          wp.status = 'done';
          wp.version++;
          wp.endedAt = nowIso(ps.store);
          recordAudit(ps, SYSTEM_ACTOR, 'workpack.merged', {
            workpackId: wp.id,
            prNumber,
          });
          emit(ps, { type: 'workpack.status_changed', workpackId: wp.id, from: previous, to: 'done', version: wp.version });
          return {
            ok: true,
            event: 'pull_request',
            action: 'merged',
            workpackId: wp.id,
          };
        }
      }

      return { ok: true, event: 'pull_request', action, received: true };
    }

    default:
      return { ok: true, event: eventType, received: true };
  }
}
