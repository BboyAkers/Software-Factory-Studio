import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { z } from 'zod';
import type { Role } from '../src/contracts';
import { can, type Capability } from '../src/domain/rbac';
import { longHash } from '../src/mocks/backend/codegen';
import { nowIso } from '../src/mocks/backend/runtime';
import { SYSTEM_ACTOR, type Actor, type ProjectState, type Store } from '../src/mocks/backend/store';
import { ApiProblem, forbiddenFor, invalid, parseAuth, parseMockToken } from '../src/mocks/http';
import { getIdempotency, saveIdempotency, saveProject } from './db/sync';

export interface ServerRouteContext<B = any> {
  store: Store;
  ps: ProjectState;
  actor: Actor;
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: B;
  db: DatabaseSync;
}

export type ServerRouteHandler<B = any> = (ctx: ServerRouteContext<B>) => unknown | Promise<unknown>;

export interface ServerRouteOptions<B = any> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pattern: string; // e.g. "/epics/:id"
  capability?: Capability;
  body?: z.ZodType<B>;
  scope?: 'project' | 'global';
  auth?: 'user' | 'none';
  status?: number;
  handler: ServerRouteHandler<B>;
}

export interface CompiledRoute {
  method: string;
  regex: RegExp;
  paramNames: string[];
  options: ServerRouteOptions;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function compileRoute(options: ServerRouteOptions): CompiledRoute {
  const paramNames: string[] = [];
  // Convert e.g. /runs/:id/logs to ^/runs/([^/]+)/logs$
  const regexStr = options.pattern
    .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    })
    .replace(/\//g, '\\/');

  return {
    method: options.method,
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
    options,
  };
}

export function sendJson(res: ServerResponse, status: number, data: unknown, store: Store, extraHeaders: Record<string, string> = {}): void {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'x-server-time': nowIso(store),
    'x-request-id': crypto.randomUUID(),
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  };
  res.writeHead(status, headers);
  if (data === undefined || data === null) {
    res.end();
  } else {
    res.end(JSON.stringify(data));
  }
}

export function sendProblem(res: ServerResponse, error: ApiProblem, store: Store): void {
  const payload = {
    type: error.type,
    title: error.title,
    status: error.status,
    ...error.extra,
  };
  sendJson(res, error.status, payload, store, {
    'Content-Type': 'application/problem+json; charset=utf-8',
  });
}

export async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Project, If-Match, Idempotency-Key, Last-Event-ID, x-github-event, x-github-delivery, x-hub-signature-256');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'x-server-time, x-request-id, idempotent-replayed, If-Match');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}
