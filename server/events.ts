import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  STREAM_TOPICS,
  topicOf,
  type Envelope,
  type StreamTopic,
} from '../src/contracts';
import { eventsSince, nowIso, runStreamBuffer } from '../src/mocks/backend/runtime';
import type { ProjectState, Store, StreamClient } from '../src/mocks/backend/store';

export const HEARTBEAT_MS = 15_000;
const RETRY_MS = 1_500;

function parseTopics(raw: string | null): Set<StreamTopic> | null {
  if (!raw) return null;
  const wanted = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is StreamTopic => (STREAM_TOPICS as readonly string[]).includes(t));
  return wanted.length > 0 ? new Set(wanted) : null;
}

export function handleSseStream(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  ps: ProjectState,
  runId: string | null,
  url: URL
): void {
  const lastEventId = req.headers['last-event-id'] as string || url.searchParams.get('lastEventId');
  const topics = runId === null ? parseTopics(url.searchParams.get('topics')) : null;
  const buffer = runId === null ? ps.events : runStreamBuffer(ps, runId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'X-Accel-Buffering': 'no',
  });

  res.write(`retry: ${RETRY_MS}\n\n`);

  const send = (envelope: Envelope) => {
    if (topics && !topics.has(topicOf(envelope.event.type))) return;
    res.write(`id: ${envelope.id}\ndata: ${JSON.stringify(envelope)}\n\n`);
  };

  // Replay missed events or signal resync
  if (lastEventId) {
    const missed = eventsSince(buffer, lastEventId);
    if (missed === null) {
      const resync: Envelope = {
        id: String(buffer.seq),
        ts: nowIso(store),
        projectId: ps.project.id,
        event: { type: 'stream.resync' },
      };
      res.write(`id: ${resync.id}\ndata: ${JSON.stringify(resync)}\n\n`);
    } else {
      for (const envelope of missed) send(envelope);
    }
  }

  const clientEntry: StreamClient = {
    projectId: ps.project.id,
    runId,
    send,
    close: () => res.end(),
  };

  store.streams.add(clientEntry);

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: nowIso(store) })}\n\n`);
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    store.streams.delete(clientEntry);
  });
}
