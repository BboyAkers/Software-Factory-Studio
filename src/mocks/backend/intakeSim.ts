import { evaluateIssue, fileIssue, scheduleIntake } from './epics';
import { nowMs, pace, rngOf } from './runtime';
import type { IssueRecord, ProjectState } from './store';

export type IssueKind = 'accepted' | 'duplicate' | 'rejected' | 'unsupported-language';

export interface Topic {
  title: string;
  mode: 'feature' | 'refactor' | 'bug' | 'security';
  areas: string[];
  acceptance: string[];
  body: string;
}

/** Plausible issues for the dogfood project: improvements to this Studio. */
const TOPICS: Topic[] = [
  {
    title: 'Persist Task Matrix filters in the URL',
    mode: 'feature',
    areas: ['task-matrix', 'routing'],
    acceptance: ['Filters survive a reload', 'A shared link opens the same filtered view'],
    body: 'People lose their filters when they refresh or share a link. Keep the search, agent, priority and Epic filters in the query string.',
  },
  {
    title: 'Show an estimated cost in the New Workpack dialog',
    mode: 'feature',
    areas: ['task-matrix', 'budget'],
    acceptance: ['The dialog shows a cost range before submit', 'The estimate updates when target files change'],
    body: 'Engineers create workpacks without knowing what they cost. Reuse the preview estimate.',
  },
  {
    title: 'Highlight policy violations in the run log',
    mode: 'feature',
    areas: ['mission-control', 'a11y'],
    acceptance: ['Violation lines are visually distinct and announced', 'A count badge sits on the Run log tab'],
    body: 'A blocked write to a locked file is easy to miss in a long log.',
  },
  {
    title: 'Retry control for failed staging deployments',
    mode: 'feature',
    areas: ['quality', 'deployments'],
    acceptance: ['A failed deployment offers Retry and Roll back', 'Retry reports the new status without a reload'],
    body: 'When staging fails the only option is to roll back. Re-running the deployment is often enough.',
  },
  {
    title: 'Fix stale spend figure after raising the cap',
    mode: 'bug',
    areas: ['budget'],
    acceptance: ['The banner clears as soon as the cap is raised', 'Paused workpacks resume in priority order'],
    body: 'After an Admin raises the cap the header still shows the hard-cap banner until the next refetch.',
  },
  {
    title: 'Export the audit log range as CSV from the toolbar',
    mode: 'feature',
    areas: ['audit-log'],
    acceptance: ['Export is available to Maintainers', 'The file respects the current filters'],
    body: 'Security asked for a CSV they can open in a spreadsheet.',
  },
  {
    title: 'Trap focus inside the Epic drawer',
    mode: 'bug',
    areas: ['a11y', 'task-matrix'],
    acceptance: ['Tab never leaves the drawer while it is open', 'Escape closes it and restores focus to the chip'],
    body: 'Keyboard users can tab into the page behind the drawer.',
  },
  {
    title: 'Sanitize PR body Markdown in the release preview',
    mode: 'security',
    areas: ['quality'],
    acceptance: ['Raw HTML in a PR body is never rendered', 'Links open with rel noopener'],
    body: 'The preview renders PR bodies authored by agents from untrusted issue text.',
  },
  {
    title: 'Add a fleet cost-per-PR trend to the tuning drawer',
    mode: 'feature',
    areas: ['fleet-tuning', 'overview'],
    acceptance: ['The drawer shows 14 days of cost per PR', 'The baseline for the eval gate is marked'],
    body: 'Maintainers tuning an agent cannot see whether a change moved the cost.',
  },
  {
    title: 'Deduplicate steering suggestions with identical text',
    mode: 'refactor',
    areas: ['mission-control'],
    acceptance: ['Identical pending suggestions collapse into one with a count', 'Approving one resolves the group'],
    body: 'Several viewers often suggest the same thing within a minute.',
  },
];

const AUTHORS = ['octocat', 'BboyAkers', 'mona-lisa', 'hubot-eng', 'ada-dev'];
const PRIORITIES: ('P0' | 'P1' | 'P2')[] = ['P2', 'P2', 'P2', 'P1', 'P1', 'P0'];

const quote = (text: string): string => JSON.stringify(text);

/** A complete Spec Studio document (Appendix C) for a topic, as an issue body. */
export function specDocument(topic: Topic, priority: string, extra: string[] = [], omitAcceptance = false): string {
  return [
    '---',
    `title: ${quote(topic.title)}`,
    `mode: ${topic.mode}`,
    `priority: ${priority}`,
    `areas: [${topic.areas.map(quote).join(', ')}]`,
    ...(omitAcceptance ? [] : ['acceptance:', ...topic.acceptance.map((a) => `  - ${quote(a)}`)]),
    ...extra,
    '---',
    '',
    topic.body,
    '',
  ].join('\n');
}

function nextTopic(ps: ProjectState): Topic {
  const used = new Set(ps.issues.map((i) => i.title));
  const fresh = TOPICS.filter((t) => !used.has(t.title));
  const pool = fresh.length > 0 ? fresh : TOPICS;
  return rngOf(ps.store).pick(pool);
}

/**
 * Simulate a GitHub-UI issue arriving, as the dev panel and the idle simulator do. `duplicate`
 * re-delivers the newest Epic's issue; the other kinds file a new labeled issue.
 */
export function fileSimulatedIssue(ps: ProjectState, kind: IssueKind): IssueRecord | null {
  const rng = rngOf(ps.store);
  if (kind === 'duplicate') {
    const epic = ps.epics.at(-1);
    const issue = epic ? ps.issues.find((i) => i.url === epic.sourceRef) : undefined;
    if (!issue) return fileSimulatedIssue(ps, 'accepted');
    // A re-delivery of an issue that already became an Epic is a duplicate.
    evaluateIssue(ps, issue.number);
    return issue;
  }
  const topic = nextTopic(ps);
  const priority = rng.pick(PRIORITIES);
  const body =
    kind === 'rejected' ? specDocument(topic, priority, [], true) : kind === 'unsupported-language' ? specDocument(topic, priority, ['language: python']) : specDocument(topic, priority);
  const issue = fileIssue(ps, { title: topic.title, body, origin: 'github-ui', author: rng.pick(AUTHORS) });
  scheduleIntake(ps, issue.number, 900);
  return issue;
}

/** Every few minutes a new issue arrives, so the factory looks alive while someone is watching. */
export function simulateIntakeTick(ps: ProjectState): void {
  const store = ps.store;
  if (!store.sim.running || store.sim.scenario === 'quiet') return;
  const now = nowMs(store);
  if (now - ps.lastIssueMs < pace(store, store.tuning.intakeEveryMs)) return;
  ps.lastIssueMs = now;
  const open = ps.epics.filter((e) => e.status !== 'completed' && e.status !== 'failed' && e.status !== 'cancelled').length;
  if (open >= 4) return;
  const roll = rngOf(store).next();
  fileSimulatedIssue(ps, roll < 0.82 ? 'accepted' : roll < 0.9 ? 'rejected' : roll < 0.95 ? 'duplicate' : 'unsupported-language');
}
