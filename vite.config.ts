import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, type Plugin } from 'vite'

function githubWebhookPlugin(): Plugin {
  return {
    name: 'github-webhook-ingress',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const isWebhook =
          url.startsWith('/api/v1/webhooks/github') ||
          url.startsWith('/webhooks/github');

        if (req.method === 'POST' && isWebhook) {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            let body: Record<string, unknown> = {};
            try {
              body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
            } catch {
              // fallback
            }

            const event =
              (req.headers['x-github-event'] as string) ||
              (body.zen ? 'ping' : 'unknown');
            const delivery = (req.headers['x-github-delivery'] as string) || '';

            // Broadcast to connected frontend clients via Vite HMR WebSocket
            server.ws.send({
              type: 'custom',
              event: 'github-webhook',
              data: {
                headers: req.headers,
                body,
                url,
                event,
                delivery,
              },
            });

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                event,
                delivery,
                message: 'GitHub webhook accepted by endpoint and broadcast to active factory sessions.',
                received: true,
              }),
            );
          });
          return;
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    githubWebhookPlugin(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
      '/webhooks': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
