import type { HttpHandler } from 'msw/http';
import { searchProject } from '../backend/search';
import type { Router } from '../http';

export function searchHandlers(r: Router): HttpHandler[] {
  return [r.get('/search', ({ ps, query }) => searchProject(ps, query.get('q'), query.get('scope')))];
}
