import { useSyncExternalStore } from 'react';

type Listener = () => void;

/** A tiny external store: state that lives outside React, so the HTTP client and streams can read and write it. */
export interface Store<T> {
  get(): T;
  set(next: T | ((previous: T) => T)): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set: (next) => {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useStoreSelector<T, S>(store: Store<T>, select: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}

// ---------------------------------------------------------------------------
// Session: who is calling, and which project they are looking at
// ---------------------------------------------------------------------------

export interface SessionState {
  /** Sent as `Authorization: Bearer <token>`. In mock mode the dev panel sets it. */
  token: string | null;
  /** Sent as `X-Project` on every project-scoped request. */
  projectId: string | null;
}

const TOKEN_KEY = 'factory.token';

function readToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export const sessionStore = createStore<SessionState>({ token: readToken(), projectId: null });

export function setSessionToken(token: string | null): void {
  try {
    if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
    else globalThis.localStorage?.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session still works for this tab.
  }
  sessionStore.set((s) => ({ ...s, token }));
}

export function setCurrentProject(projectId: string | null): void {
  sessionStore.set((s) => (s.projectId === projectId ? s : { ...s, projectId }));
}

// ---------------------------------------------------------------------------
// Server clock: relative times use the server's time, not the laptop's (spec §16.2)
// ---------------------------------------------------------------------------

export const clockStore = createStore<{ offsetMs: number }>({ offsetMs: 0 });

/** Milliseconds since the epoch according to the server. */
export const serverNow = (): number => Date.now() + clockStore.get().offsetMs;

export function syncServerClock(header: string | null): void {
  if (!header) return;
  const server = Date.parse(header);
  if (!Number.isFinite(server)) return;
  // Ignore sub-second jitter so the displayed times do not shimmer on every response.
  const offset = server - Date.now();
  if (Math.abs(offset - clockStore.get().offsetMs) > 1_000) clockStore.set({ offsetMs: offset });
}

// ---------------------------------------------------------------------------
// Connection: what the shell's pill says (spec §16.2)
// ---------------------------------------------------------------------------

export type StreamState = 'connecting' | 'open' | 'reconnecting';

export interface ConnectionInputs {
  /** `navigator.onLine`. */
  browserOnline: boolean;
  /** The last request failed before getting any response, and none has succeeded since. */
  requestFailed: boolean;
  stream: StreamState;
  /** When the stream last stopped being open, or `null` while it is open. */
  streamDownSince: number | null;
  /** The last event or heartbeat from the project stream. */
  lastStreamMessageAt: number | null;
}

export const connectionStore = createStore<ConnectionInputs>({
  browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  requestFailed: false,
  stream: 'connecting',
  streamDownSince: null,
  lastStreamMessageAt: null,
});

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

/** Offline when the browser says so, a request failed outright, or the stream has been down for more than 10 s. */
export function deriveConnection(inputs: ConnectionInputs, nowMs: number): ConnectionState {
  if (!inputs.browserOnline || inputs.requestFailed) return 'offline';
  if (inputs.stream === 'open') return 'live';
  if (inputs.streamDownSince !== null && nowMs - inputs.streamDownSince > 10_000) return 'offline';
  return 'reconnecting';
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => connectionStore.set((s) => ({ ...s, browserOnline: true })));
  window.addEventListener('offline', () => connectionStore.set((s) => ({ ...s, browserOnline: false })));
}
