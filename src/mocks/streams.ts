import { sse } from 'msw/sse';
import { ws } from 'msw/ws';
import {
  STREAM_TOPICS,
  TerminalClientFrameSchema,
  topicOf,
  type Envelope,
  type StreamTopic,
  type TerminalServerFrame,
} from '../contracts';
import { eventsSince, nowIso, runStreamBuffer } from './backend/runtime';
import type { ProjectState, Store, StreamClient } from './backend/store';
import { appendTerminal, handleInput, readyFrame, scrollback, subscribeTerminal } from './backend/terminal';
import { api, parseMockToken } from './http';

/**
 * SSE and WebSocket interception work in the browser only (Node has no EventSource), so these
 * handlers live apart from the REST ones and are registered by the browser entry point alone.
 */

/** The server sends a heartbeat every 15 s (spec §10.3). The mock uses a named event: MSW cannot emit comments. */
export const HEARTBEAT_MS = 15_000;
/** Reconnect quickly: the browser retries after this long following a dropped stream. */
const RETRY_MS = 1_500;
const TERMINAL_STEP_MS = 60;

// A type alias, not an interface: MSW constrains the event map with an index signature.
type Events = { message: string; heartbeat: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type SseClient = Parameters<Parameters<typeof sse<Events>>[1]>[0]['client'];

function parseTopics(raw: string | null): Set<StreamTopic> | null {
  if (!raw) return null;
  const wanted = raw.split(',').map((t) => t.trim()).filter((t): t is StreamTopic => (STREAM_TOPICS as readonly string[]).includes(t));
  return wanted.length > 0 ? new Set(wanted) : null;
}

function openStream(store: Store, ps: ProjectState, runId: string | null, client: SseClient, request: Request): void {
  const url = new URL(request.url);
  const lastEventId = request.headers.get('last-event-id') ?? url.searchParams.get('lastEventId');
  const topics = runId === null ? parseTopics(url.searchParams.get('topics')) : null;
  const buffer = runId === null ? ps.events : runStreamBuffer(ps, runId);

  client.send({ retry: RETRY_MS });

  const send = (envelope: Envelope) => {
    if (topics && !topics.has(topicOf(envelope.event.type))) return;
    client.send({ id: envelope.id, data: JSON.stringify(envelope) });
  };

  // Replay what was missed, or tell the client to refetch everything when that range is gone.
  if (lastEventId !== null) {
    const missed = eventsSince(buffer, lastEventId);
    if (missed === null) {
      const resync: Envelope = { id: String(buffer.seq), ts: nowIso(store), projectId: ps.project.id, event: { type: 'stream.resync' } };
      client.send({ id: resync.id, data: JSON.stringify(resync) });
    } else {
      for (const envelope of missed) send(envelope);
    }
  }

  // Dropping a stream is a network error, so the browser reconnects and resumes with Last-Event-ID.
  const entry: StreamClient = { projectId: ps.project.id, runId, send, close: () => client.error() };
  store.streams.add(entry);
  const beat = setInterval(() => client.send({ event: 'heartbeat', data: JSON.stringify({ ts: nowIso(store) }) }), HEARTBEAT_MS);

  // However the connection ends (the page closes it, the request aborts, or we drop it), stop writing to it.
  const cleanup = () => {
    clearInterval(beat);
    store.streams.delete(entry);
  };
  const close = client.close.bind(client);
  const error = client.error.bind(client);
  client.close = () => {
    cleanup();
    close();
  };
  client.error = () => {
    cleanup();
    error();
  };
  request.signal.addEventListener('abort', cleanup, { once: true });
}

export function streamHandlers(getStore: () => Store) {
  const projectStream = sse<Events>(api('/stream'), ({ client, request }) => {
    const store = getStore();
    const ps = store.projects.get(new URL(request.url).searchParams.get('project') ?? '');
    if (!ps || store.net.offline) return client.error();
    openStream(store, ps, null, client, request);
  });

  const runStream = sse<Events, { id: string }>(api('/runs/:id/stream'), ({ client, request, params }) => {
    const store = getStore();
    const ps = store.projects.get(new URL(request.url).searchParams.get('project') ?? '');
    const runId = String(params.id);
    if (!ps || store.net.offline || !ps.runs.some((r) => r.id === runId)) return client.error();
    openStream(store, ps, runId, client, request);
  });

  const link = ws.link(api('/runs/:id/terminal'));
  const terminal = link.addEventListener('connection', ({ client, params }) => {
    const store = getStore();
    const url = client.url;
    const ps = store.projects.get(url.searchParams.get('project') ?? '');
    const run = ps?.runs.find((r) => r.id === String(params.id));
    const wp = run ? ps?.workpacks.find((w) => w.id === run.workpackId) : undefined;
    if (!ps || !run || !wp || store.net.offline) {
      client.close(4404, 'Run not found');
      return;
    }
    // Browsers cannot set headers on a WebSocket, so the mock token rides in the query string.
    const actor = parseMockToken(url.searchParams.get('token'));
    if (!actor) {
      client.close(4401, 'Sign in to continue');
      return;
    }

    const frame = (f: TerminalServerFrame) => client.send(JSON.stringify(f));
    frame(readyFrame(wp, run, actor.role));
    for (const line of scrollback(ps, run.id)) frame({ type: 'line', line });
    const leave = subscribeTerminal(ps, run.id, (line) => frame({ type: 'line', line }));
    client.addEventListener('close', leave);

    client.addEventListener('message', async (event) => {
      let input: { data: string };
      try {
        input = TerminalClientFrameSchema.parse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      const result = handleInput(ps, wp, run, actor, input.data);
      if (result.rejected) return frame(result.rejected);
      appendTerminal(ps, run.id, 'command', `$ ${result.normalized}`);
      for (const line of result.output?.lines ?? []) {
        await sleep(TERMINAL_STEP_MS);
        appendTerminal(ps, run.id, line.stream, line.text);
      }
      frame({ type: 'exit', command: result.normalized ?? input.data, code: result.output?.exitCode ?? 0 });
    });
  });

  return { handlers: [projectStream, runStream, terminal], terminalClients: link.clients };
}
