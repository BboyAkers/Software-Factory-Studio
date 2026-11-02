import type { HttpHandler } from 'msw/http';
import type { Me } from '../../contracts';
import type { Router } from '../http';

const emailFor = (name: string): string => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'user'}@example.dev`;

export function sessionHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/me', { scope: 'global' }, ({ store, actor }): Me => ({
      id: actor.id,
      name: actor.name,
      email: emailFor(actor.name),
      role: actor.role,
      projects: [...store.projects.values()].map((ps) => ps.project),
    })),

    r.get('/projects', { scope: 'global' }, ({ store }) => [...store.projects.values()].map((ps) => ps.project)),
  ];
}
