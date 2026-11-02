import { ROLE_LABEL } from '../domain/rbac';
import { isApiError, isNetworkError } from './client';

/** The action needs the network and there is none (spec §16.2: "Needs a connection"). */
export class OfflineBlockedError extends Error {
  constructor() {
    super('Needs a connection');
    this.name = 'OfflineBlockedError';
  }
}

/** A person-readable title and detail for any error a call can raise. Forms use it for inline messages. */
export function describeError(error: unknown, subject = 'This item'): { title: string; detail?: string } {
  if (error instanceof OfflineBlockedError) return { title: 'Needs a connection', detail: 'Reconnect to do this.' };
  if (isNetworkError(error)) return { title: 'Could not reach the server', detail: 'Check the connection and try again.' };
  if (isApiError(error)) {
    if (error.type === 'stale_version') return { title: `${subject} changed while you were acting`, detail: 'Showing the latest. Try again.' };
    if (error.status === 403) return { title: error.requiredRole ? `Requires ${ROLE_LABEL[error.requiredRole]}` : error.title };
    const detail = error.errors[0] ? `${error.errors[0].path}: ${error.errors[0].message}` : error.detail;
    return { title: error.title, ...(detail ? { detail } : {}) };
  }
  return { title: error instanceof Error ? error.message : 'Something went wrong' };
}
