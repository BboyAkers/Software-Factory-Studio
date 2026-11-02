import type { HttpHandler } from 'msw/http';
import { auditPage, exportAudit, verifyAudit } from '../backend/audit';
import type { Router } from '../http';

export function auditHandlers(r: Router): HttpHandler[] {
  return [
    r.get('/audit', ({ ps, query }) => auditPage(ps, query)),

    r.get('/audit/verify', ({ ps, query }) => verifyAudit(ps, query)),

    r.get('/audit/export', { capability: 'audit.export' }, ({ ps, query }) => exportAudit(ps, query)),
  ];
}
