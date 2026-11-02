import { HttpResponse, http, type HttpHandler } from 'msw/http';
import type { z } from 'zod';
import type { FieldError, Role } from '../contracts';
import { ROLES } from '../contracts';
import { ROLE_LABEL, can, requiredRole, type Capability } from '../domain/rbac';
import { longHash } from './backend/codegen';
import { nowIso } from './backend/runtime';
import type { Actor, ProjectState, Store } from './backend/store';

/** Build a matcher that works for any origin, in the browser and in Node tests. */
export const api = (path: string): string => `*/api/v1${path}`;

export class ApiProblem extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly extra: { detail?: string; errors?: FieldError[]; requiredRole?: Role; allowed?: string[] };

  constructor(status: number, type: string, title: string, extra: ApiProblem['extra'] = {}) {
    super(title);
    this.status = status;
    this.type = type;
    this.title = title;
    this.extra = extra;
  }
}

export const notFound = (what: string, id: string) => new ApiProblem(404, 'not_found', `${what} ${id} was not found.`);
export const invalid = (errors: FieldError[], title = 'The request body is invalid.') =>
  new ApiProblem(422, 'validation_failed', title, { errors });
export const conflict = (type: string, title: string, extra: ApiProblem['extra'] = {}) => new ApiProblem(409, type, title, extra);

export function forbiddenFor(capability: Capability): ApiProblem {
  const needed = requiredRole(capability);
  return new ApiProblem(403, 'forbidden', `Requires ${ROLE_LABEL[needed]}.`, { requiredRole: needed });
}

export function requireCapability(actor: Actor, capability: Capability): void {
  if (!can(actor.role, capability)) throw forbiddenFor(capability);
}

/** Optimistic concurrency for versioned resources (spec §10.1). */
export function checkIfMatch(request: Request, currentVersion: number, label: string): void {
  const header = request.headers.get('if-match');
  if (header === null) {
    throw new ApiProblem(428, 'precondition_required', `Send If-Match with ${label}'s current version.`);
  }
  if (Number(header.replace(/"/g, '')) !== currentVersion) {
    throw conflict('stale_version', `${label} changed since you loaded it (now version ${currentVersion}).`, {
      detail: `If-Match was ${header}, current version is ${currentVersion}.`,
    });
  }
}

export interface RouteContext<B = undefined> {
  store: Store;
  /** Present for project-scoped routes. */
  ps: ProjectState;
  actor: Actor;
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  body: B;
}

export type RouteHandler<B> = (ctx: RouteContext<B>) => unknown | Promise<unknown>;

export interface RouteOptions<B> {
  capability?: Capability;
  body?: z.ZodType<B>;
  /** `global` routes (`/me`, `/projects`, `/projects/connect*`) take no project. Default `project`. */
  scope?: 'project' | 'global';
  /** Success status for a returned value. Default 200. */
  status?: number;
}

interface Registrar {
  <B = undefined>(path: string, handler: RouteHandler<B>): HttpHandler;
  <B = undefined>(path: string, options: RouteOptions<B>, handler: RouteHandler<B>): HttpHandler;
}

export interface Router {
  get: Registrar;
  post: Registrar;
  put: Registrar;
  patch: Registrar;
  delete: Registrar;
  store: () => Store;
}

export interface RouterOptions {
  /** Artificial latency range in ms. `0` disables it (tests). */
  latencyMs?: [min: number, max: number] | 0;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** `mock:<role>:<userId>:<url-encoded name>`, as carried in a bearer header or, for sockets, a `?token=` parameter. */
export function parseMockToken(token: string | null): Actor | null {
  const match = /^mock:([a-z]+):([^:]+):(.*)$/.exec(token ?? '');
  if (!match) return null;
  const role = match[1] as Role;
  if (!(ROLES as readonly string[]).includes(role)) return null;
  let name = match[3] ?? 'User';
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the raw name
  }
  return { id: match[2]!, name, role, type: 'user' };
}

export function parseAuth(header: string | null): Actor | null {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  return match ? parseMockToken(match[1]!) : null;
}

function headersFor(store: Store, extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-server-time': nowIso(store), 'x-request-id': crypto.randomUUID(), ...extra };
}

function problemResponse(store: Store, error: ApiProblem): Response {
  return HttpResponse.json(
    { type: error.type, title: error.title, status: error.status, ...error.extra },
    { status: error.status, headers: headersFor(store, { 'content-type': 'application/problem+json' }) },
  );
}

function issuesToErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || 'body',
    message: issue.message,
    code: issue.code,
  }));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRouter(getStore: () => Store, options: RouterOptions = {}): Router {
  const latency = options.latencyMs ?? 0;

  const make = (method: 'get' | 'post' | 'put' | 'patch' | 'delete'): Registrar =>
    ((path: string, a: RouteOptions<unknown> | RouteHandler<unknown>, b?: RouteHandler<unknown>) => {
      const opts: RouteOptions<unknown> = typeof a === 'function' ? {} : a;
      const handler = (typeof a === 'function' ? a : b) as RouteHandler<unknown>;

      return http[method](api(path), async ({ request, params }) => {
        const store = getStore();
        if (store.net.offline) return HttpResponse.error();
        if (latency !== 0) await sleep(latency[0] + Math.random() * (latency[1] - latency[0]));

        try {
          const actor = parseAuth(request.headers.get('authorization'));
          if (!actor) throw new ApiProblem(401, 'unauthorized', 'Sign in to continue.');

          const url = new URL(request.url);
          let ps: ProjectState | undefined;
          if (opts.scope !== 'global') {
            const projectId = request.headers.get('x-project') ?? url.searchParams.get('project');
            if (!projectId) throw new ApiProblem(400, 'project_required', 'Send X-Project with the project id.');
            ps = store.projects.get(projectId);
            if (!ps) throw new ApiProblem(404, 'project_not_found', `Project ${projectId} was not found.`);
          }

          if (opts.capability && !can(actor.role, opts.capability)) throw forbiddenFor(opts.capability);

          const rawBody = MUTATING.has(request.method) ? await request.clone().text() : '';
          const idemKey = MUTATING.has(request.method) ? request.headers.get('idempotency-key') : null;
          const storeKey = idemKey ? `${actor.id}|${idemKey}` : null;
          // Only a digest is kept: request bodies can carry vault values and provider keys.
          const fingerprint = longHash(`${request.method} ${url.pathname} ${rawBody}`);
          if (storeKey) {
            const prior = store.idempotency.get(storeKey);
            if (prior) {
              if (prior.fingerprint !== fingerprint) {
                throw new ApiProblem(422, 'idempotency_conflict', 'This Idempotency-Key was already used with a different request.');
              }
              return new Response(prior.body || null, {
                status: prior.status,
                headers: headersFor(store, { 'content-type': prior.contentType, 'idempotent-replayed': 'true' }),
              });
            }
          }

          let body: unknown;
          if (opts.body) {
            let parsedJson: unknown;
            try {
              parsedJson = rawBody === '' ? {} : JSON.parse(rawBody);
            } catch {
              throw new ApiProblem(400, 'invalid_json', 'The request body is not valid JSON.');
            }
            const parsed = opts.body.safeParse(parsedJson);
            if (!parsed.success) throw invalid(issuesToErrors(parsed.error));
            body = parsed.data;
          }

          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) ? (v[0] ?? '') : String(v);

          const result = await handler({
            store,
            ps: ps as ProjectState,
            actor,
            request,
            params: flat,
            query: url.searchParams,
            body,
          });

          let response: Response;
          if (result instanceof Response) response = result;
          else if (result === undefined) response = new HttpResponse(null, { status: 204, headers: headersFor(store) });
          else response = HttpResponse.json(result as object, { status: opts.status ?? 200, headers: headersFor(store) });

          if (storeKey && response.status < 500) {
            store.idempotency.set(storeKey, {
              fingerprint,
              status: response.status,
              body: await response.clone().text(),
              contentType: response.headers.get('content-type') ?? 'application/json',
            });
          }
          return response;
        } catch (error) {
          if (error instanceof ApiProblem) return problemResponse(store, error);
          const message = error instanceof Error ? error.message : 'Unexpected error';
          return problemResponse(store, new ApiProblem(500, 'internal_error', 'The mock backend hit an error.', { detail: message }));
        }
      });
    }) as Registrar;

  return { get: make('get'), post: make('post'), put: make('put'), patch: make('patch'), delete: make('delete'), store: getStore };
}
