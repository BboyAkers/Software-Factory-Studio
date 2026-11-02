import type { z } from 'zod';
import { ProblemSchema, type FieldError, type Role } from '../contracts';
import { connectionStore, sessionStore, setSessionToken, syncServerClock } from './state';

/** Base URL of the factory API. Mock mode and the real backend differ only by this (spec Appendix H). */
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** The server answered with `application/problem+json` (spec §10.1). */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: FieldError[];
  readonly requiredRole: Role | undefined;
  readonly allowed: string[] | undefined;
  readonly requestId: string | null;

  constructor(problem: { status: number; type: string; title: string; detail?: string; errors?: FieldError[]; requiredRole?: Role; allowed?: string[] }, requestId: string | null) {
    super(problem.detail ? `${problem.title} ${problem.detail}` : problem.title);
    this.name = 'ApiError';
    this.status = problem.status;
    this.type = problem.type;
    this.title = problem.title;
    this.detail = problem.detail;
    this.errors = problem.errors ?? [];
    this.requiredRole = problem.requiredRole;
    this.allowed = problem.allowed;
    this.requestId = requestId;
  }
}

/** The request never reached the server (offline, dropped, blocked). */
export class NetworkError extends Error {
  constructor(message = 'The request did not reach the server.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** A response did not match its contract. This is a bug in the client or the backend, never a user error. */
export class ContractError extends Error {
  readonly path: string;
  constructor(path: string, cause: z.ZodError) {
    super(`Response from ${path} did not match its contract: ${cause.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
    this.name = 'ContractError';
    this.path = path;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isNetworkError = (e: unknown): e is NetworkError => e instanceof NetworkError;
export const isStale = (e: unknown): boolean => isApiError(e) && e.type === 'stale_version';
export const isForbidden = (e: unknown): boolean => isApiError(e) && e.status === 403;

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  /** Project for `X-Project`. Defaults to the current one; pass `null` for `/me` and `/projects`. */
  project?: string | null;
  /** Sent as `If-Match` on a versioned write. */
  ifMatch?: number | string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Validates the response. Omit for 204 and for responses that are not JSON. */
  schema?: z.ZodType<T>;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(`${API_BASE}${path}`, globalThis.location?.origin ?? 'http://localhost');
  for (const [key, value] of Object.entries(query ?? {})) if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  // Keep relative URLs relative so the dev server proxy, or MSW, sees the same path the page asked for.
  return API_BASE.startsWith('http') ? url.toString() : `${url.pathname}${url.search}`;
}

export const newIdempotencyKey = (): string => globalThis.crypto.randomUUID();

/** Send a request and return the response if it succeeded: auth, project scope, headers, clock sync and problem+json errors. */
async function fetchOk(path: string, options: Omit<RequestOptions<unknown>, 'schema'>, accept: string): Promise<Response> {
  const session = sessionStore.get();
  const project = options.project === undefined ? session.projectId : options.project;
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept, ...options.headers };
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  if (project) headers['x-project'] = project;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.ifMatch !== undefined) headers['if-match'] = String(options.ifMatch);
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    connectionStore.set((s) => (s.requestFailed ? s : { ...s, requestFailed: true }));
    throw new NetworkError();
  }
  connectionStore.set((s) => (s.requestFailed ? { ...s, requestFailed: false } : s));
  syncServerClock(response.headers.get('x-server-time'));

  if (!response.ok) {
    // The session is gone (expired, revoked, signed out elsewhere): the shell shows the signed-out screen.
    if (response.status === 401) setSessionToken(null);
    const requestId = response.headers.get('x-request-id');
    const parsed = ProblemSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      parsed.success ? parsed.data : { status: response.status, type: 'http_error', title: response.statusText || `Request failed (${response.status})` },
      requestId,
    );
  }
  return response;
}

/** One typed call to the factory API: auth, project scope, idempotency, versioning, clock sync and problem+json handled in one place. */
export async function request<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const response = await fetchOk(path, options, 'application/json');
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const json: unknown = text === '' ? undefined : JSON.parse(text);
  if (!options.schema) return json as T;
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) throw new ContractError(path, parsed.error);
  return parsed.data;
}

export interface TextDownload {
  text: string;
  /** The file name the server suggested in `Content-Disposition`, if any. */
  filename: string | null;
  contentType: string;
}

/** A text download such as the audit export. It needs the auth header, so it cannot be a plain link. */
export async function requestText(path: string, options: Omit<RequestOptions<never>, 'schema' | 'body' | 'method'> = {}): Promise<TextDownload> {
  const response = await fetchOk(path, options, '*/*');
  const disposition = response.headers.get('content-disposition') ?? '';
  return {
    text: await response.text(),
    filename: /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? null,
    contentType: response.headers.get('content-type') ?? 'text/plain',
  };
}
