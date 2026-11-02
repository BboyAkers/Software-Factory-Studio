import { setupWorker } from 'msw/browser';
import { createStore } from './backend/store';
import { startSimulator } from './backend/simulator';
import { createControl, type MockControl } from './control';
import { createHandlers } from './handlers';
import { seedWorld } from './seeds';
import { streamHandlers } from './streams';

declare global {
  interface Window {
    /** The dev-panel controls of the simulated backend, also handy from the console. */
    __factoryMock?: MockControl;
  }
}

let started: Promise<MockControl> | null = null;

/**
 * Start the simulated backend in the browser: REST, both event streams and the terminal are served by
 * MSW from an in-memory world that a simulator keeps moving. Safe to call more than once.
 */
export function startMocks(): Promise<MockControl> {
  started ??= (async () => {
    const store = createStore();
    await seedWorld(store, 'healthy');
    const streams = streamHandlers(() => store);
    const worker = setupWorker(...createHandlers(() => store, { latencyMs: [60, 240] }), ...streams.handlers);
    await worker.start({
      onUnhandledFrame: 'bypass',
      quiet: true,
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    });
    startSimulator(store);
    const control = createControl(store, { terminalClients: () => streams.terminalClients });
    window.__factoryMock = control;
    return control;
  })();
  return started;
}

export type { MockControl, MockState, SpeedOption } from './control';
export { PERSONAS, DEFAULT_ROLE, mockToken } from './personas';
export { SCENARIOS, DOGFOOD_PROJECT_ID, SANDBOX_PROJECT_ID } from './seeds';
