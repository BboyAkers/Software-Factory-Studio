import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { EnvelopeSchema, type Envelope } from '../contracts';
import { applyFactoryEvent, type CacheOps } from '../domain/streamReducer';
import { useNow } from '../app/useNow';
import { buildUrl } from './client';
import { useProjectId } from './queries';
import { connectionStore, deriveConnection, serverNow, useStore, type ConnectionState, type StreamState } from './state';

/** The slice of the query client the stream reducer drives (spec §10.3: "no parallel store"). */
export function cacheOps(client: QueryClient): CacheOps {
  return {
    update: (prefix, updater) => {
      client.setQueriesData({ queryKey: prefix }, (old: unknown) => (old === undefined ? old : updater(old)));
    },
    invalidate: (prefix) => {
      void client.invalidateQueries({ queryKey: prefix });
    },
  };
}

// ---------------------------------------------------------------------------
// A reconnecting EventSource
// ---------------------------------------------------------------------------

const HEARTBEAT_MS = 15_000;
/** Two missed heartbeats and the stream counts as down (spec §10.3). */
const WATCHDOG_MS = 2 * HEARTBEAT_MS + 5_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

interface SseOptions {
  /** Build the URL; `lastEventId` is the id to resume from, or `null` on the first connection. */
  url: (lastEventId: string | null) => string;
  onEnvelope: (envelope: Envelope) => void;
  onState: (state: StreamState) => void;
}

/** Open an event stream and keep it open: back off 1 s → 15 s, resume from the last event id, treat silence as a drop. */
function connectSse(options: SseOptions): () => void {
  let source: EventSource | null = null;
  let lastEventId: string | null = null;
  let lastMessageAt = Date.now();
  let attempt = 0;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;

  const touch = () => {
    lastMessageAt = Date.now();
  };

  const scheduleReconnect = () => {
    source?.close();
    source = null;
    if (stopped || retry) return;
    attempt += 1;
    options.onState('reconnecting');
    retry = setTimeout(() => {
      retry = null;
      connect();
    }, Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (attempt - 1)));
  };

  const connect = () => {
    if (stopped) return;
    options.onState(attempt === 0 ? 'connecting' : 'reconnecting');
    const es = new EventSource(options.url(lastEventId));
    source = es;
    touch();
    es.onopen = () => {
      attempt = 0;
      touch();
      options.onState('open');
    };
    es.onmessage = (event) => {
      touch();
      if (event.lastEventId) lastEventId = event.lastEventId;
      try {
        const parsed = EnvelopeSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) options.onEnvelope(parsed.data as Envelope);
      } catch {
        // A frame that is not JSON is ignored; the next one will be fine.
      }
    };
    es.addEventListener('heartbeat', touch);
    // The browser would retry on its own, but with a fixed delay and the old URL. We close and back off instead.
    es.onerror = () => scheduleReconnect();
  };

  connect();
  watchdog = setInterval(() => {
    if (source && Date.now() - lastMessageAt > WATCHDOG_MS) scheduleReconnect();
  }, 5_000);

  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    if (watchdog) clearInterval(watchdog);
    source?.close();
  };
}

// ---------------------------------------------------------------------------
// Events other than cache patches: toasts, banners, "benchmark finished"
// ---------------------------------------------------------------------------

const handlers = new Set<(envelope: Envelope) => void>();

/** React to project-stream events that are not just cache updates. The latest handler is always the one called. */
export function useFactoryEvents(handler: (envelope: Envelope) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const listener = (envelope: Envelope) => ref.current(envelope);
    handlers.add(listener);
    return () => {
      handlers.delete(listener);
    };
  }, []);
}

/** Mount once, in the shell: holds the project stream open and applies every event to the query cache. */
export function useFactoryStream(): void {
  const projectId = useProjectId();
  const client = useQueryClient();
  useEffect(() => {
    if (!projectId) return;
    connectionStore.set((s) => ({ ...s, stream: 'connecting', streamDownSince: null }));
    const ops = cacheOps(client);
    return connectSse({
      url: (lastEventId) => buildUrl('/stream', { project: projectId, lastEventId }),
      onEnvelope: (envelope) => {
        connectionStore.set((s) => ({ ...s, lastStreamMessageAt: serverNow() }));
        applyFactoryEvent(ops, projectId, envelope);
        handlers.forEach((h) => h(envelope));
      },
      onState: (stream) =>
        connectionStore.set((s) => ({ ...s, stream, streamDownSince: stream === 'open' ? null : (s.streamDownSince ?? serverNow()) })),
    });
  }, [projectId, client]);
}

/** Hold a run's high-volume stream open (tokens, logs, reasoning, tool calls) while a view is focused on that run. */
export function useRunStream(runId: string | null): StreamState {
  const projectId = useProjectId();
  const client = useQueryClient();
  const [state, setState] = useState<StreamState>('connecting');
  useEffect(() => {
    if (!projectId || !runId) return;
    const ops = cacheOps(client);
    return connectSse({
      url: (lastEventId) => buildUrl(`/runs/${runId}/stream`, { project: projectId, lastEventId }),
      onEnvelope: (envelope) => {
        applyFactoryEvent(ops, projectId, envelope);
        handlers.forEach((h) => h(envelope));
      },
      onState: setState,
    });
  }, [projectId, runId, client]);
  return state;
}

/** What the shell's connection pill shows. Offline also covers a stream that has been down for more than 10 s. */
export function useConnection(): { state: ConnectionState; stream: StreamState } {
  const inputs = useStore(connectionStore);
  const now = useNow();
  return { state: deriveConnection(inputs, now), stream: inputs.stream };
}
