import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { TerminalClientFrameSchema, type TerminalServerFrame } from '../src/contracts';
import { appendTerminal, handleInput, readyFrame, scrollback, subscribeTerminal } from '../src/mocks/backend/terminal';
import type { Store } from '../src/mocks/backend/store';
import { parseMockToken } from '../src/mocks/http';

const TERMINAL_STEP_MS = 60;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function setupTerminalWebSocket(wss: WebSocketServer, getStore: () => Store): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    // Match /api/v1/runs/:id/terminal or /runs/:id/terminal
    const match = pathname.match(/^(?:\/api\/v1)?\/runs\/([^/]+)\/terminal$/);
    if (!match) {
      ws.close(4404, 'Invalid terminal endpoint');
      return;
    }

    const runId = match[1];
    const store = getStore();
    const projectId = url.searchParams.get('project') ?? '';
    const ps = store.projects.get(projectId);
    const run = ps?.runs.find((r) => r.id === runId);
    const wp = run ? ps?.workpacks.find((w) => w.id === run.workpackId) : undefined;

    if (!ps || !run || !wp || store.net.offline) {
      ws.close(4404, 'Run not found');
      return;
    }

    const token = url.searchParams.get('token');
    const actor = parseMockToken(token);
    if (!actor) {
      ws.close(4401, 'Sign in to continue');
      return;
    }

    const frame = (f: TerminalServerFrame) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(f));
      }
    };

    // Send ready frame and scrollback
    frame(readyFrame(wp, run, actor.role));
    for (const line of scrollback(ps, run.id)) {
      frame({ type: 'line', line });
    }

    const unsubscribe = subscribeTerminal(ps, run.id, (line) => {
      frame({ type: 'line', line });
    });

    ws.on('close', unsubscribe);

    ws.on('message', async (data: Buffer | string) => {
      let input: { data: string };
      try {
        input = TerminalClientFrameSchema.parse(JSON.parse(data.toString('utf-8')));
      } catch {
        return;
      }

      const result = handleInput(ps, wp, run, actor, input.data);
      if (result.rejected) {
        return frame(result.rejected);
      }

      appendTerminal(ps, run.id, 'command', `$ ${result.normalized}`);
      for (const line of result.output?.lines ?? []) {
        await sleep(TERMINAL_STEP_MS);
        appendTerminal(ps, run.id, line.stream, line.text);
      }
      frame({
        type: 'exit',
        command: result.normalized ?? input.data,
        code: result.output?.exitCode ?? 0,
      });
    });
  });
}
