import type { ConnectRequest, FieldError, PreflightCheck, PreflightResult, Project } from '../../contracts';
import { REQUIRED_PAT_PERMISSIONS } from '../../contracts';
import { ApiProblem, conflict, notFound } from '../http';
import { nowMs, recordAudit } from './runtime';
import { createProjectState, type Actor, type Store } from './store';
import { seedPlatform } from '../seeds/platform';

// ---------------------------------------------------------------------------
// Repository names
// ---------------------------------------------------------------------------

const GITHUB_URL = /^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s?#]+)/i;
const OWNER_REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/;

/** `owner/repo`, a GitHub URL, or an SSH remote, all as `owner/repo`. Anything else comes back trimmed. */
export function normalizeRepo(input: string): string {
  const text = input.trim();
  const url = GITHUB_URL.exec(text);
  return (url ? `${url[1]}/${url[2]}` : text).replace(/\.git$/i, '');
}

const LANGUAGE_OF: Record<string, string> = { python: 'Python', django: 'Python', rails: 'Ruby', java: 'Java', golang: 'Go', rust: 'Rust' };

/**
 * The preflight's stand-in for language detection: a name with a word that starts like another ecosystem's
 * name. "javascript" is not Java, and "trust" is not Rust, because only the start of a word counts.
 */
function otherLanguage(repoName: string): string | undefined {
  for (const word of repoName.toLowerCase().split(/[^a-z]+/)) {
    if (word.startsWith('javascript')) continue;
    const keyword = Object.keys(LANGUAGE_OF).find((k) => word.startsWith(k));
    if (keyword) return keyword;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Preflight (spec §13.1, step 5)
// ---------------------------------------------------------------------------

export interface PreflightRequest {
  repo: string;
  token: string;
  defaultBranch?: string | undefined;
}

const PERMISSIONS_MISSING_FROM_LIMITED_TOKENS = ['Issues: Read and write', 'Deployments: Read'] as const;

const check = (id: string, label: string, required: boolean, status: PreflightCheck['status'], detail: string, fix: string | null = null): PreflightCheck => ({
  id,
  label,
  status,
  required,
  detail,
  fix,
});

/** Eight deterministic checks. A required check that does not pass blocks Connect. */
export function runPreflight(request: PreflightRequest): PreflightResult {
  const repo = normalizeRepo(request.repo);
  const token = request.token;
  const branch = request.defaultBranch?.trim() || 'main';
  const repoName = repo.split('/')[1] ?? repo;
  const language = otherLanguage(repoName);

  const tokenValid = token.startsWith('github_pat_') && token.length >= 20;
  const limited = token.endsWith('-limited');
  const wellFormed = OWNER_REPO.test(repo);
  const reachable = wellFormed && !repo.toLowerCase().includes('missing');

  const checks: PreflightCheck[] = [
    tokenValid
      ? check('token-valid', 'Token is valid', true, 'pass', 'A fine-grained personal access token, accepted by GitHub.')
      : check(
          'token-valid',
          'Token is valid',
          true,
          'fail',
          'GitHub did not accept this token. It must be a fine-grained personal access token (it starts with github_pat_).',
          'Create a fine-grained token scoped to this repository',
        ),
    limited
      ? check(
          'permissions',
          'Required permissions granted',
          true,
          'fail',
          `The token lacks: ${PERMISSIONS_MISSING_FROM_LIMITED_TOKENS.join(', ')}.`,
          `Edit the token on GitHub and grant ${PERMISSIONS_MISSING_FROM_LIMITED_TOKENS.join(' and ')}.`,
        )
      : check('permissions', 'Required permissions granted', true, 'pass', `Granted: ${REQUIRED_PAT_PERMISSIONS.join(', ')}.`),
    reachable
      ? check('repo-access', 'Repository is reachable', true, 'pass', `Read and write access to ${repo}.`)
      : wellFormed
        ? check(
            'repo-access',
            'Repository is reachable',
            true,
            'fail',
            `${repo} was not found, or the token cannot see it.`,
            'Grant the token access to this repository under Repository access, or check the name.',
          )
        : check(
            'repo-access',
            'Repository is reachable',
            true,
            'fail',
            `"${repo}" is not an owner/repo pair or a GitHub URL.`,
            'Enter the repository as owner/repo, or paste its GitHub URL.',
          ),
    branch === 'nonexistent'
      ? check('default-branch', 'Default branch exists', true, 'fail', `Branch ${branch} does not exist in ${repo}.`, "Use the repository's default branch, for example main.")
      : check('default-branch', 'Default branch exists', true, 'pass', `Branch ${branch} exists in ${repo}.`),
    language
      ? check(
          'language',
          'TypeScript or JavaScript detected',
          true,
          'fail',
          `unsupported_language: ${repo} looks like a ${LANGUAGE_OF[language]} project. Only TypeScript and JavaScript repositories are supported in v1.`,
          'Connect a TypeScript or JavaScript repository.',
        )
      : check('language', 'TypeScript or JavaScript detected', true, 'pass', 'TypeScript is the primary language.'),
    check(
      'webhook',
      'Webhook can be created',
      false,
      'warn',
      'Created automatically when the token has Webhooks: Read and write; otherwise follow the manual steps',
      'Without that permission, add a webhook for Issues and Issue comments that points to https://studio.factory.dev/api/v1/hooks/github.',
    ),
    check('label', 'Intake label', false, 'pass', 'The factory label exists or will be created'),
    check('index', 'Code index', false, 'pass', 'Initial code index queued'),
  ];

  return { repo, ok: checks.every((c) => !c.required || c.status === 'pass'), checks };
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

const FIELD_OF_CHECK: Record<string, string> = {
  'token-valid': 'token',
  permissions: 'token',
  'repo-access': 'repo',
  'default-branch': 'defaultBranch',
  language: 'repo',
};

/** One field error per failed required check; an unsupported language has its own problem type. */
function preflightProblem(result: PreflightResult): ApiProblem {
  const failed = result.checks.filter((c) => c.required && c.status !== 'pass');
  const errors: FieldError[] = failed.map((c) => ({
    path: FIELD_OF_CHECK[c.id] ?? 'repo',
    message: c.detail,
    code: c.id === 'language' ? 'unsupported_language' : c.id,
  }));
  if (failed.some((c) => c.id === 'language')) {
    return new ApiProblem(422, 'unsupported_language', 'Only TypeScript and JavaScript repositories are supported in v1.', { errors });
  }
  return new ApiProblem(422, 'validation_failed', 'The repository could not be connected. Fix the failing checks and try again.', { errors });
}

const slugOf = (repo: string): string =>
  repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function freeProjectId(store: Store, repo: string): string {
  const base = slugOf(repo);
  let id = base;
  for (let n = 2; store.projects.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Create a project from a repository that passes preflight: bare, with its own audit chain. */
export function connectProject(store: Store, request: ConnectRequest, actor: Actor): Project {
  const result = runPreflight({ repo: request.repo, token: request.token, defaultBranch: request.defaultBranch });
  if (!result.ok) throw preflightProblem(result);

  const existing = [...store.projects.values()].find((p) => p.project.repo.toLowerCase() === result.repo.toLowerCase());
  if (existing) throw conflict('already_connected', `${result.repo} is already connected as ${existing.project.name}.`);

  const now = nowMs(store);
  const project: Project = {
    id: freeProjectId(store, result.repo),
    name: result.repo.split('/')[1]!,
    repo: result.repo,
    defaultBranch: request.defaultBranch,
    createdAt: new Date(now).toISOString(),
  };
  const ps = createProjectState(store, project, now);
  seedPlatform(ps, { populated: false });

  const cap = Math.round(request.monthlyCapUsd * 1_000_000);
  ps.budget.capUsdMicros = cap;
  ps.budget.ledger.setCap(cap);
  ps.budget.softLimitPercent = request.softLimitPercent;
  ps.policies.autoMergeVerifiedPRs = request.autoMergeVerifiedPRs;
  ps.policies.humanSignoffP0P1Schema = request.humanSignoffP0P1Schema;
  ps.token.info.createdBy = actor.name;

  // The GitHub token is not kept. Its last four characters stay on the card, so a person can tell which one it was.
  const github = ps.integrations.find((i) => i.id === 'github');
  if (github) github.details = `${project.repo} · fine-grained token ending ${request.token.slice(-4)} · webhook active`;

  store.projects.set(project.id, ps);
  recordAudit(ps, actor, 'project.connected', {
    repo: project.repo,
    defaultBranch: project.defaultBranch,
    monthlyCapUsd: request.monthlyCapUsd,
    softLimitPercent: request.softLimitPercent,
  });
  return project;
}

/** Disconnect and remove a project repository from Software Factory Studio. */
export function disconnectProject(store: Store, projectId: string, actor: Actor): { ok: boolean; projectId: string } {
  const ps = store.projects.get(projectId);
  if (!ps) throw notFound('Project', projectId);

  recordAudit(ps, actor, 'project.disconnected', {
    projectId,
    repo: ps.project.repo,
  });

  store.projects.delete(projectId);
  return { ok: true, projectId };
}

