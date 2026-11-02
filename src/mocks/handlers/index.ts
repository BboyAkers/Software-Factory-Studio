import type { HttpHandler } from 'msw/http';
import type { Store } from '../backend/store';
import { createRouter, type RouterOptions } from '../http';
import { auditHandlers } from './audit';
import { epicHandlers } from './epics';
import { fleetHandlers } from './fleet';
import { overviewHandlers } from './overview';
import { qualityHandlers, budgetHandlers } from './quality';
import { runHandlers } from './runs';
import { searchHandlers } from './search';
import { sessionHandlers } from './session';
import { settingsHandlers } from './settings';
import { workpackHandlers } from './workpacks';

/** Every REST handler of spec §10.2, bound to one store. */
export function createHandlers(getStore: () => Store, options: RouterOptions = {}): HttpHandler[] {
  const r = createRouter(getStore, options);
  return [
    ...sessionHandlers(r),
    ...workpackHandlers(r),
    ...epicHandlers(r),
    ...runHandlers(r),
    ...qualityHandlers(r),
    ...budgetHandlers(r),
    ...fleetHandlers(r),
    ...settingsHandlers(r),
    ...auditHandlers(r),
    ...overviewHandlers(r),
    ...searchHandlers(r),
  ];
}
