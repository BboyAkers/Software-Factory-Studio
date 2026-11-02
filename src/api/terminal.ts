import { useCallback, useEffect, useReducer, useRef } from 'react';
import { TerminalServerFrameSchema, type TerminalLine, type TerminalServerFrame } from '../contracts';
import { useProjectId } from './queries';
import { buildUrl } from './client';
import { sessionStore } from './state';

export type TerminalStatus = 'idle' | 'connecting' | 'open' | 'closed';

type Ready = Extract<TerminalServerFrame, { type: 'ready' }>;
type Rejected = Extract<TerminalServerFrame, { type: 'rejected' }>;

export interface TerminalState {
  status: TerminalStatus;
  /** Whether this person may type, and what the run is, from the server's first frame. */
  ready: Ready | null;
  lines: TerminalLine[];
  /** A command is running and its `exit` frame has not arrived. */
  running: boolean;
  /** The server turned the last input down: the command grammar or a role check. */
  rejection: Rejected | null;
  lastExit: { command: string; code: number } | null;
}

type Action = { type: 'status'; status: TerminalStatus } | { type: 'frame'; frame: TerminalServerFrame } | { type: 'sent' } | { type: 'reset' };

const MAX_LINES = 500;
const INITIAL: TerminalState = { status: 'idle', ready: null, lines: [], running: false, rejection: null, lastExit: null };

function reduce(state: TerminalState, action: Action): TerminalState {
  switch (action.type) {
    case 'reset':
      return INITIAL;
    case 'status':
      return { ...state, status: action.status };
    case 'sent':
      return { ...state, running: true, rejection: null };
    case 'frame': {
      const frame = action.frame;
      if (frame.type === 'ready') return { ...state, ready: frame };
      if (frame.type === 'rejected') return { ...state, rejection: frame, running: false };
      if (frame.type === 'exit') return { ...state, running: false, lastExit: { command: frame.command, code: frame.code } };
      if (state.lines.some((l) => l.id === frame.line.id)) return state;
      return { ...state, lines: [...state.lines, frame.line].slice(-MAX_LINES) };
    }
  }
}

/**
 * The sandbox terminal of a run over WebSocket (spec §7.3). Anyone can watch; only Engineer and above can
 * send input. Check the command with `checkCommand` from `domain/terminalPolicy` first for instant feedback;
 * the server enforces the same grammar.
 */
export function useTerminal(runId: string | null): TerminalState & { send: (command: string) => void } {
  const projectId = useProjectId();
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!runId || !projectId) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    dispatch({ type: 'reset' });

    const connect = () => {
      if (stopped) return;
      dispatch({ type: 'status', status: 'connecting' });
      // Browsers cannot set headers on a WebSocket, so the token travels in the query string.
      const url = new URL(buildUrl(`/runs/${runId}/terminal`, { project: projectId, token: sessionStore.get().token }), globalThis.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        dispatch({ type: 'status', status: 'open' });
      };
      ws.onmessage = (event) => {
        try {
          const parsed = TerminalServerFrameSchema.safeParse(JSON.parse(String(event.data)));
          if (parsed.success) dispatch({ type: 'frame', frame: parsed.data });
        } catch {
          // Ignore a frame that is not JSON.
        }
      };
      ws.onclose = () => {
        socket.current = null;
        dispatch({ type: 'status', status: 'closed' });
        if (stopped) return;
        attempt += 1;
        retry = setTimeout(connect, Math.min(10_000, 1_000 * 2 ** (attempt - 1)));
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [runId, projectId]);

  const send = useCallback((command: string) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    dispatch({ type: 'sent' });
    ws.send(JSON.stringify({ type: 'input', data: command }));
  }, []);

  return { ...state, send };
}
