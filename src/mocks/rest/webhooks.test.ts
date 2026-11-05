import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addWorkpack, createWorld, type World } from '../testing';

const VALID_DSL = `---
title: "Multi-tenant Stripe webhook retry"
mode: feature
priority: P1
areas: [billing, webhooks]
acceptance:
  - "Stripe events retry on 429"
---
Implement exponential backoff retry logic for Stripe webhooks.`;

describe('GitHub Webhooks Ingress Endpoint', () => {
  let w: World;

  beforeEach(() => {
    w = createWorld({ platform: true });
  });

  afterEach(() => {
    w.close();
  });

  it('accepts a ping webhook event and marks repository webhookActive', async () => {
    // Start with webhook inactive
    if (w.ps.repository) w.ps.repository.webhookActive = false;

    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        'x-github-event': 'ping',
        'x-github-delivery': 'deliv-001',
      },
      body: {
        zen: 'Approachable is better than simple.',
        hook_id: 1099234,
        repository: {
          full_name: w.ps.project.repo,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      event: 'ping',
      received: true,
    });
    expect(w.ps.repository?.webhookActive).toBe(true);
    expect(w.ps.integrations.find((i) => i.id === 'github')?.enabled).toBe(true);
  });

  it('accepts webhooks without an authorization header (external caller)', async () => {
    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        authorization: '',
        'x-github-event': 'ping',
      },
      body: {
        hook_id: 999,
        repository: {
          full_name: w.ps.project.repo,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, event: 'ping' });
  });

  it('rejects a malformed X-Hub-Signature-256', async () => {
    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        'x-github-event': 'ping',
        'x-hub-signature-256': 'invalid-signature-format',
      },
      body: {
        hook_id: 1,
        repository: { full_name: w.ps.project.repo },
      },
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ type: 'invalid_signature' });
  });

  it('intakes a newly opened issue with the factory label and creates an Epic', async () => {
    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        'x-github-event': 'issues',
        'x-github-delivery': 'deliv-002',
      },
      body: {
        action: 'opened',
        issue: {
          number: 105,
          title: 'Multi-tenant Stripe webhook retry',
          body: VALID_DSL,
          labels: [{ name: 'factory' }],
          html_url: `https://github.com/${w.ps.project.repo}/issues/105`,
          user: { login: 'octocat' },
        },
        repository: {
          full_name: w.ps.project.repo,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      event: 'issues',
      action: 'opened',
      issueNumber: 105,
      outcome: 'accepted',
    });

    // Verify Epic was created
    const epic = w.ps.epics.find((e) => e.issueNumber === 105);
    expect(epic).toBeDefined();
    expect(epic?.title).toBe('Multi-tenant Stripe webhook retry');
    expect(epic?.priority).toBe('P1 High');

    // Verify GitHub issue comment & label
    const issue = w.ps.issues.find((i) => i.number === 105);
    expect(issue?.labels).toContain('factory:accepted');
    expect(issue?.comments[0]?.body).toContain('Accepted as EPIC-');
  });

  it('ignores issues that do not carry the factory label', async () => {
    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        'x-github-event': 'issues',
      },
      body: {
        action: 'opened',
        issue: {
          number: 106,
          title: 'Unrelated question',
          body: 'How do I use this repo?',
          labels: [{ name: 'question' }],
          html_url: `https://github.com/${w.ps.project.repo}/issues/106`,
          user: { login: 'external_user' },
        },
        repository: {
          full_name: w.ps.project.repo,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      event: 'issues',
      outcome: 'ignored_unlabeled',
    });

    // No Epic should be created
    expect(w.ps.epics.some((e) => e.issueNumber === 106)).toBe(false);
  });

  it('rejects an issue with invalid DSL and comments the errors back on the issue', async () => {
    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        'x-github-event': 'issues',
      },
      body: {
        action: 'opened',
        issue: {
          number: 107,
          title: 'Missing required frontmatter',
          body: 'Just plain text without YAML frontmatter',
          labels: [{ name: 'factory' }],
          html_url: `https://github.com/${w.ps.project.repo}/issues/107`,
          user: { login: 'dev' },
        },
        repository: {
          full_name: w.ps.project.repo,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      event: 'issues',
      outcome: 'rejected',
    });

    const issue = w.ps.issues.find((i) => i.number === 107);
    expect(issue?.labels).toContain('factory:rejected');
    expect(issue?.comments[0]?.body).toContain('Rejected: this issue could not be accepted');
  });

  it('handles interactive steering via @factory steer comments', async () => {
    // Set up a mock running workpack
    const wp = addWorkpack(w.ps, { status: 'in-progress' });
    wp.prNumber = 201;
    const runId = wp.run!.id;

    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        'x-github-event': 'issue_comment',
      },
      body: {
        action: 'created',
        issue: {
          number: 201,
          title: `[Factory] ${wp.title}`,
          pull_request: { url: 'https://api.github.com/repos/...' },
        },
        comment: {
          body: '@factory steer constraint Keep the exponential backoff jitter below 300ms',
          user: { login: 'mira-maintainer' },
        },
        repository: {
          full_name: w.ps.project.repo,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      event: 'issue_comment',
      steered: true,
      runId,
    });

    // Verify hint was added to steering inbox
    const hint = w.ps.hints.find((h) => h.runId === runId);
    expect(hint).toBeDefined();
    expect(hint?.kind).toBe('constraint');
    expect(hint?.text).toContain('Keep the exponential backoff jitter below 300ms');
  });

  it('marks workpack as done when PR closed and merged via pull_request webhook', async () => {
    const wp = addWorkpack(w.ps, { status: 'awaiting-review' });
    wp.prNumber = 305;

    const res = await w.call('POST', '/webhooks/github', {
      headers: {
        'x-github-event': 'pull_request',
      },
      body: {
        action: 'closed',
        pull_request: {
          number: 305,
          merged: true,
          head: { ref: wp.branch },
        },
        repository: {
          full_name: w.ps.project.repo,
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      event: 'pull_request',
      action: 'merged',
      workpackId: wp.id,
    });
    expect(wp.status).toBe('done');
  });

  it('routes webhook by project parameter /webhooks/github/:projectId', async () => {
    const res = await w.call('POST', `/webhooks/github/${w.ps.project.id}`, {
      headers: {
        'x-github-event': 'ping',
      },
      body: {
        hook_id: 1234,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, event: 'ping' });
  });
});
