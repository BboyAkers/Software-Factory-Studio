import type { EpicMode, Priority } from '../../contracts';

/**
 * Seed content for the dogfood project: the Studio building itself. Times are minutes before "now".
 * Epics are listed oldest first so ids come out in the order things happened.
 */

export interface EpicSeed {
  key: string;
  title: string;
  mode: EpicMode;
  priority: Priority;
  areas: string[];
  acceptance: string[];
  prose: string;
  origin: 'spec-studio' | 'github-ui' | 'sentry';
  author: string;
  issue: number;
  ageMin: number;
  /** Where the Epic is at "now". Everything else is derived from its workpacks. */
  state: 'delivered' | 'executing' | 'stage-2' | 'intake';
}

export type WpState = 'merged' | 'awaiting-review' | 'verification' | 'in-progress' | 'planning' | 'queued' | 'failed' | 'cancelled';

export interface WpSeed {
  key: string;
  epic: string;
  title: string;
  files: string[];
  priority: Priority;
  category: string;
  /** Minutes ago the workpack was created. */
  ageMin: number;
  state: WpState;
  /** For merged work: minutes from creation to merge. */
  cycleMin?: number;
  /** For in-progress work: how far through its turns it is. */
  progress?: number;
  /** For ended work: minutes ago it ended. */
  endedMin?: number;
  dependsOn?: string[];
  attempt?: number;
  human?: boolean;
  costUsd?: number;
  /** Gate outcomes for work that reached review. */
  gates?: 'clean' | 'warn' | 'quarantine' | 'failed-unit';
  paused?: boolean;
  /** Merged work that should show the full gate run and screenshots. */
  withGates?: boolean;
  forkOf?: string;
}

const H = 60;
const D = 24 * H;

export const EPICS: EpicSeed[] = [
  {
    key: 'tokens',
    title: 'Fluent 2 design tokens and shell layout',
    mode: 'feature',
    priority: 'P1 High',
    areas: ['design-system', 'shell'],
    acceptance: ['Surfaces, borders and accents come from tokens, not literals', 'Navigation collapses to an icon rail below 1024 px'],
    prose: 'Replace ad-hoc colors with the Fluent 2 dark tokens and build the shell every page sits in.',
    origin: 'spec-studio',
    author: 'Austin Akers',
    issue: 14,
    ageMin: 21 * D,
    state: 'delivered',
  },
  {
    key: 'overview',
    title: 'Overview KPI cards and sparklines',
    mode: 'feature',
    priority: 'P2 Normal',
    areas: ['overview'],
    acceptance: ['KPIs follow the §15 definitions', 'Every card has loading, empty and error states'],
    prose: 'The Overview page shows four KPIs with real sparklines instead of placeholders.',
    origin: 'github-ui',
    author: 'Mira Okafor',
    issue: 18,
    ageMin: 18 * D,
    state: 'delivered',
  },
  {
    key: 'palette',
    title: 'Command palette and global search',
    mode: 'feature',
    priority: 'P2 Normal',
    areas: ['command-palette', 'search'],
    acceptance: ['Cmd+K opens the palette from any page', 'Results come from the search API, not a client list'],
    prose: 'One keyboard entry point for navigation, actions and finding Epics, workpacks, files and logs.',
    origin: 'spec-studio',
    author: 'Jonas Weber',
    issue: 21,
    ageMin: 15 * D,
    state: 'delivered',
  },
  {
    key: 'budget',
    title: 'Budget modal with attribution',
    mode: 'feature',
    priority: 'P1 High',
    areas: ['budget'],
    acceptance: ['Raising the cap resumes paused work and says how many', 'Non-admins see every field disabled'],
    prose: 'Make the cap, the soft limit and where the money went visible and editable in one place.',
    origin: 'spec-studio',
    author: 'Austin Akers',
    issue: 27,
    ageMin: 13 * D,
    state: 'delivered',
  },
  {
    key: 'spec',
    title: 'Spec Studio editor and decomposition preview',
    mode: 'feature',
    priority: 'P1 High',
    areas: ['spec-studio'],
    acceptance: ['Missing required fields show a field error', 'Preview and Dispatch are disabled while the text is invalid'],
    prose: 'Write a spec, see its contracts and workpack graph, then file it as a GitHub issue.',
    origin: 'spec-studio',
    author: 'Mira Okafor',
    issue: 31,
    ageMin: 11 * D,
    state: 'delivered',
  },
  {
    key: 'matrix-a11y',
    title: 'Task Matrix: keyboard Move menu and drawer accessibility',
    mode: 'feature',
    priority: 'P1 High',
    areas: ['task-matrix', 'a11y'],
    acceptance: ['Every legal move is reachable from the keyboard', 'The task drawer announces status changes and traps focus'],
    prose: 'Drag and drop is the only way to move a card today. Add a Move menu and make the drawer usable without a pointer.',
    origin: 'github-ui',
    author: 'Jonas Weber',
    issue: 38,
    ageMin: 14 * H,
    state: 'executing',
  },
  {
    key: 'steering',
    title: 'Mission Control steering console',
    mode: 'feature',
    priority: 'P0 Blocker',
    areas: ['mission-control', 'steering'],
    acceptance: ['Viewers can suggest and engineers can approve or reject', 'A hint shows Queued, Delivered and Acknowledged as the agent reads it'],
    prose: 'Humans need a dependable way to steer a live run. This is blocking the pilot with the payments team.',
    origin: 'spec-studio',
    author: 'Austin Akers',
    issue: 41,
    ageMin: 3 * H + 5,
    state: 'executing',
  },
  {
    key: 'offline',
    title: 'Offline queue with conflict replay',
    mode: 'feature',
    priority: 'P1 High',
    areas: ['offline', 'api'],
    acceptance: ['Steering and Kanban moves queue while offline and replay in order', 'A stale replay is dropped with a toast naming the item'],
    prose: 'Losing the network for a minute should not lose a steering hint.',
    origin: 'github-ui',
    author: 'Mira Okafor',
    issue: 44,
    ageMin: 16 * H + 30,
    state: 'executing',
  },
  {
    key: 'quality',
    title: 'Quality: screenshot lightbox and signed URLs',
    mode: 'feature',
    priority: 'P2 Normal',
    areas: ['quality'],
    acceptance: ['The matrix filters by viewport and browser', 'A lightbox shows the viewport label and when the signed URL expires'],
    prose: 'Reviewers need to inspect captures at full size without leaving the Quality page.',
    origin: 'spec-studio',
    author: 'Jonas Weber',
    issue: 47,
    ageMin: 17 * H,
    state: 'executing',
  },
  {
    key: 'audit',
    title: 'Audit log: verify chain and export',
    mode: 'security',
    priority: 'P2 Normal',
    areas: ['audit-log'],
    acceptance: ['Verify names the first broken entry', 'Maintainers can export the filtered range as NDJSON or CSV'],
    prose: 'Security wants to prove the log has not been altered and to pull it into their SIEM.',
    origin: 'github-ui',
    author: 'Austin Akers',
    issue: 49,
    ageMin: 21 * H,
    state: 'executing',
  },
  {
    key: 'fleet',
    title: 'Fleet tuning drawer with eval gate',
    mode: 'feature',
    priority: 'P1 High',
    areas: ['fleet-tuning'],
    acceptance: ['Saving a version never changes what runs', 'Only a passed version can be promoted'],
    prose: 'Tune an agent safely: every behavioral change is evaluated before it can become active.',
    origin: 'spec-studio',
    author: 'Mira Okafor',
    issue: 52,
    ageMin: 4,
    state: 'stage-2',
  },
  {
    key: 'connect',
    title: 'Connect repository wizard',
    mode: 'feature',
    priority: 'P2 Normal',
    areas: ['settings'],
    acceptance: ['Preflight shows each check with its fix', 'Connect stays disabled until required checks pass'],
    prose: 'Admins connect a repository with a fine-grained token and see exactly what is missing.',
    origin: 'github-ui',
    author: 'Austin Akers',
    issue: 55,
    ageMin: 0.3,
    state: 'intake',
  },
];

/** Titles for the delivered Epics, one merged workpack each. */
const DELIVERED: Record<string, { category: string; dir: string; titles: string[] }> = {
  tokens: {
    category: 'Frontend',
    dir: 'src/components/ui',
    titles: [
      'Define dark surface and accent tokens in index.css',
      'Add fluent-card and acrylic utility classes',
      'Build the left navigation with an icon rail',
      'Add the header with breadcrumb and state pills',
      'Create Button and IconButton primitives',
      'Create Badge and ProgressBar primitives',
      'Create Dialog and Drawer with a focus trap',
      'Add Tooltip and Kbd primitives',
      'Add Skeleton and EmptyState components',
      'Wire the global banners strip',
      'Collapse navigation below 1024 px',
    ],
  },
  overview: {
    category: 'Frontend',
    dir: 'src/pages/overview',
    titles: [
      'KPI card with delta and tooltip',
      'Real sparkline from hourly buckets',
      'Window toggle for 24h and 7d',
      'Spend attribution bars',
      'Quality warn-gate tile',
      'Health card for specialists and providers',
      'Active pipeline list with the Attention filter',
      'Empty and error states for every card',
      'Run benchmark button with progress',
    ],
  },
  palette: {
    category: 'Frontend',
    dir: 'src/components/palette',
    titles: [
      'Palette shell opened with Cmd+K',
      'Navigation and action groups',
      'Debounced search client',
      'Epic and workpack results',
      'File results open the workspace',
      'Log results open the run log',
      'Offline message for entity results',
      'Scope prefixes epic: wp: file: log:',
    ],
  },
  budget: {
    category: 'Frontend',
    dir: 'src/components/budget',
    titles: [
      'Cap and soft-limit inputs',
      'Read-only hard cap line',
      'Runway and projection',
      'State banner for soft limit and hard cap',
      'Attribution tabs by Epic, agent and source',
      'Raise cap flow with a resume count',
      'Confirm when the cap is below spend',
      'Admin-only disabled state',
      'Block saving while offline',
      'Header budget pill',
    ],
  },
  spec: {
    category: 'Frontend',
    dir: 'src/pages/spec-studio',
    titles: [
      'Frontmatter editor with line numbers',
      'Inline problems list that jumps to the line',
      'Fill defaults as a diff dialog',
      'Template picker',
      'Contracts preview tabs',
      'Workpack graph preview',
      'Estimate panel',
      'Dispatch confirmation dialog',
      'Intake feed',
      'Out-of-date preview marker',
    ],
  },
};

const pascal = (text: string) =>
  text
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join('');

/** When each delivered Epic's workpacks merged, in days ago (first merge, last merge), so both KPI windows have data. */
const MERGE_WINDOW: Record<string, [first: number, last: number]> = {
  tokens: [20.0, 14.2],
  overview: [16.5, 9.0],
  palette: [12.5, 3.5],
  budget: [10.0, 1.8],
  spec: [7.5, 0.2],
};

/** The delivered Epics' merged work, spread over each Epic's merge window, with a few humans and a few retries mixed in. */
function deliveredWork(): WpSeed[] {
  const out: WpSeed[] = [];
  for (const epic of EPICS.filter((e) => e.state === 'delivered')) {
    const spec = DELIVERED[epic.key]!;
    const [first, last] = MERGE_WINDOW[epic.key]!;
    const n = spec.titles.length;
    spec.titles.forEach((title, i) => {
      const mergedAgoDays = first + ((last - first) * i) / Math.max(1, n - 1);
      const cycle = 55 + ((i * 37 + epic.issue * 11) % 170);
      const component = pascal(title);
      out.push({
        key: `${epic.key}-${i}`,
        epic: epic.key,
        title,
        files: [`${spec.dir}/${component}.tsx`, `${spec.dir}/${component}.test.ts`],
        priority: epic.priority === 'P1 High' && i % 4 === 0 ? 'P1 High' : 'P2 Normal',
        category: spec.category,
        ageMin: mergedAgoDays * D + cycle,
        state: 'merged',
        cycleMin: cycle,
        human: (i * 7 + epic.issue) % 9 === 0,
        attempt: (i * 5 + epic.issue) % 11 === 0 ? 2 : 1,
        costUsd: 1.6 + ((i * 53 + epic.issue * 7) % 41) / 10,
        // The last few merges keep their full gate run and screenshots, so the Quality page has history to open.
        withGates: epic.key === 'spec' && i >= n - 4,
        forkOf: epic.key === 'palette' && i === n - 1 ? 'prefix-v1' : undefined,
      });
    });
  }
  return out;
}

/** Work that is happening, or recently happened, in the executing Epics. */
const LIVE_WORK: WpSeed[] = [
  // --- Task Matrix: keyboard Move menu and drawer accessibility (P1) ---
  { key: 'move-menu', epic: 'matrix-a11y', title: 'Add a Move… menu to Kanban cards', files: ['src/pages/task-matrix/components/MoveMenu.tsx', 'src/pages/task-matrix/hooks/useMoveCard.ts'], priority: 'P1 High', category: 'Frontend', ageMin: 13 * H + 30, state: 'verification' },
  { key: 'drawer-live', epic: 'matrix-a11y', title: 'Announce status changes with aria-live in the task drawer', files: ['src/pages/task-matrix/components/TaskDrawer.tsx'], priority: 'P1 High', category: 'Frontend', ageMin: 13 * H, state: 'in-progress', progress: 62 },
  { key: 'focus-trap', epic: 'matrix-a11y', title: 'Trap focus and restore it on drawer close', files: ['src/pages/task-matrix/components/TaskDrawer.tsx', 'src/pages/task-matrix/hooks/useFocusTrap.ts'], priority: 'P1 High', category: 'Frontend', ageMin: 12 * H + 50, state: 'queued' },
  { key: 'sensors', epic: 'matrix-a11y', title: 'Keyboard sensors for drag and drop', files: ['src/pages/task-matrix/hooks/useKanbanSensors.ts'], priority: 'P1 High', category: 'Frontend', ageMin: 13 * H, state: 'awaiting-review', endedMin: 9 * H, gates: 'clean', costUsd: 3.4, withGates: true },
  { key: 'matrix-e2e', epic: 'matrix-a11y', title: 'Cover keyboard flows with Playwright', files: ['tests/e2e/task-matrix.spec.ts'], priority: 'P1 High', category: 'Tests', ageMin: 12 * H + 45, state: 'queued', dependsOn: ['move-menu', 'sensors'] },

  // --- Mission Control steering console (P0) ---
  { key: 'composer', epic: 'steering', title: 'Steering composer with a kind control', files: ['src/pages/mission-control/components/SteeringComposer.tsx', 'src/pages/mission-control/hooks/useSteer.ts'], priority: 'P0 Blocker', category: 'Frontend', ageMin: 3 * H, state: 'in-progress', progress: 45, human: true },
  { key: 'pills', epic: 'steering', title: 'Steering state pills and the next-turn hint', files: ['src/pages/mission-control/components/SteeringPills.tsx'], priority: 'P0 Blocker', category: 'Frontend', ageMin: 3 * H, state: 'in-progress', progress: 71, paused: true },
  { key: 'suggestions', epic: 'steering', title: 'Pending suggestions with approve and reject', files: ['src/pages/mission-control/components/SuggestionList.tsx'], priority: 'P0 Blocker', category: 'Frontend', ageMin: 2 * H + 50, state: 'awaiting-review', endedMin: 12, gates: 'clean', costUsd: 2.2, withGates: true },
  { key: 'log-viewer', epic: 'steering', title: 'Run log viewer with a level filter and Load earlier', files: ['src/pages/mission-control/components/RunLogViewer.tsx'], priority: 'P0 Blocker', category: 'Frontend', ageMin: 2 * H + 40, state: 'planning' },

  // --- Offline queue with conflict replay (P1) ---
  { key: 'persist', epic: 'offline', title: 'Persist the offline queue per project', files: ['src/app/offline/storage.ts', 'src/app/offline/storage.test.ts'], priority: 'P1 High', category: 'Frontend', ageMin: 16 * H, state: 'merged', cycleMin: 205, costUsd: 3.2, withGates: true },
  { key: 'replay', epic: 'offline', title: 'Replay FIFO on reconnect with conflict toasts', files: ['src/app/offline/replay.ts', 'src/app/offline/queue.ts'], priority: 'P1 High', category: 'Frontend', ageMin: 15 * H + 30, state: 'in-progress', progress: 80, attempt: 2 },
  { key: 'offline-banner', epic: 'offline', title: 'Shell banner and queued-actions popover', files: ['src/components/shell/OfflineBanner.tsx'], priority: 'P1 High', category: 'Frontend', ageMin: 15 * H + 20, state: 'queued', dependsOn: ['replay'], paused: true },
  { key: 'block-offline', epic: 'offline', title: 'Block non-queueable actions while offline', files: ['src/app/offline/queue.ts'], priority: 'P1 High', category: 'Frontend', ageMin: 15 * H + 10, state: 'queued' },
  { key: 'schema-marker', epic: 'offline', title: 'Persist a schema version marker for the queue', files: ['migrations/0044_queue_schema_version.sql', 'src/app/offline/schema.ts'], priority: 'P2 Normal', category: 'Database', ageMin: 15 * H, state: 'awaiting-review', endedMin: 7 * H, gates: 'clean', costUsd: 2.6, withGates: true },

  // --- Quality: screenshot lightbox and signed URLs (P2) ---
  { key: 'shot-matrix', epic: 'quality', title: 'Screenshot matrix with viewport and browser filters', files: ['src/pages/quality-sandboxes/components/ScreenshotMatrix.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 16 * H, state: 'awaiting-review', endedMin: 11 * H, gates: 'quarantine', costUsd: 3.8, withGates: true },
  { key: 'lightbox', epic: 'quality', title: 'Lightbox with the viewport label and expiry note', files: ['src/pages/quality-sandboxes/components/Lightbox.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 15 * H + 20, state: 'in-progress', progress: 24 },
  { key: 'repro', epic: 'quality', title: 'Download the repro bundle as JSON', files: ['src/pages/quality-sandboxes/components/ReproBundle.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 15 * H, state: 'failed', endedMin: 1.5, attempt: 3, gates: 'failed-unit', costUsd: 3.6 },

  // --- Audit log: verify chain and export (P2) ---
  { key: 'verify', epic: 'audit', title: 'Verify chain banner with the first broken entry', files: ['src/pages/audit/components/VerifyBanner.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 17 * H, state: 'in-progress', progress: 85 },
  { key: 'export', epic: 'audit', title: 'NDJSON and CSV export for Maintainers', files: ['src/pages/audit/components/ExportMenu.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 20 * H, state: 'merged', cycleMin: 190, costUsd: 3.0, withGates: true },
  { key: 'entry-drawer', epic: 'audit', title: 'Entry detail drawer with both hashes', files: ['src/pages/audit/components/EntryDrawer.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 16 * H, state: 'cancelled', endedMin: 0.7 },
  { key: 'audit-filters', epic: 'audit', title: 'Reflect audit filters in the URL', files: ['src/pages/audit/hooks/useAuditFilters.ts'], priority: 'P2 Normal', category: 'Frontend', ageMin: 16 * H, state: 'queued' },
];

/** Older ended work that is already archived, one of which was forked into the version that shipped. */
const ARCHIVED: WpSeed[] = [
  { key: 'prefix-v1', epic: 'palette', title: 'Scope prefix parser (first attempt)', files: ['src/components/palette/ScopePrefix.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 14 * D + 3 * H, state: 'failed', endedMin: 14 * D + 1 * H, attempt: 3, gates: 'failed-unit', costUsd: 5.1 },
  { key: 'templates-12', epic: 'spec', title: 'Template picker with twelve starters', files: ['src/pages/spec-studio/components/TemplateGallery.tsx'], priority: 'P2 Normal', category: 'Frontend', ageMin: 10 * D, state: 'cancelled', endedMin: 10 * D - 40 },
];

export const WORKPACKS: WpSeed[] = [...deliveredWork(), ...ARCHIVED, ...LIVE_WORK].sort((a, b) => b.ageMin - a.ageMin);
