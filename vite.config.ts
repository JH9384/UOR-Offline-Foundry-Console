import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { createServerSideWindmillReadOnlyTransport } from './src/shared/adapters/windmillLocalReadOnlyAdapter';

function windmillLocalReadOnlyServerPlugin(): Plugin {
  const transport = createServerSideWindmillReadOnlyTransport();

  const handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith('/api/windmill')) {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end(
        JSON.stringify({
          ok: false,
          code: 'SANDBOX_ISOLATED',
          message:
            'Only read-only GET requests are permitted on /api/windmill/*. Compiler execution, workflow dispatch, triggers, and release remain disabled.',
        })
      );
      return;
    }

    const parsed = new URL(rawUrl, 'http://127.0.0.1:3000');
    const pathname = parsed.pathname.replace(/\/+$/, '');

    if (pathname === '/api/windmill/health') {
      const health = await transport.probeHealth();
      res.statusCode = 200;
      res.end(JSON.stringify(health));
      return;
    }

    if (pathname === '/api/windmill/jobs') {
      const projectId = parsed.searchParams.get('projectId') ?? undefined;
      const listResult = await transport.listJobs!(projectId);
      res.statusCode = 200;
      res.end(JSON.stringify(listResult));
      return;
    }

    const jobMatch = pathname.match(/^\/api\/windmill\/jobs\/([^/]+)$/);
    if (jobMatch) {
      const jobId = decodeURIComponent(jobMatch[1]);
      const jobResult = await transport.fetchJobById(jobId);
      res.statusCode = 200;
      res.end(JSON.stringify(jobResult));
      return;
    }

    res.statusCode = 404;
    res.end(
      JSON.stringify({
        ok: false,
        code: 'NOT_CONNECTED',
        message: `Unknown read-only Windmill adapter endpoint: ${pathname}`,
      })
    );
  };

  return {
    name: 'uor-windmill-local-readonly-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next);
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), windmillLocalReadOnlyServerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

