import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import {
  createServerSideWindmillReadOnlyTransport,
  dispatchWindmillProxyRoute,
  MAX_INTAKE_VALIDATE_BODY_BYTES,
} from './src/shared/adapters/windmillLocalReadOnlyAdapter';

function readBoundedRequestBody(
  req: IncomingMessage,
  maxBytes: number = MAX_INTAKE_VALIDATE_BODY_BYTES
): Promise<{ ok: true; body: string } | { ok: false; byteLength: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let exceeded = false;

    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      totalBytes += buf.byteLength;
      if (totalBytes > maxBytes) {
        exceeded = true;
      } else {
        chunks.push(buf);
      }
    });

    req.on('end', () => {
      if (exceeded) {
        resolve({ ok: false, byteLength: totalBytes });
      } else {
        resolve({ ok: true, body: Buffer.concat(chunks).toString('utf8') });
      }
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

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

    const method = (req.method ?? 'GET').toUpperCase();
    const parsed = new URL(rawUrl, 'http://127.0.0.1:3000');
    const pathname = parsed.pathname.replace(/\/+$/, '');

    let rawBody: string | undefined;
    if (method === 'POST' && pathname === '/api/windmill/intake/validate') {
      const bodyRead = await readBoundedRequestBody(req, MAX_INTAKE_VALIDATE_BODY_BYTES);
      if (!bodyRead.ok) {
        res.statusCode = 413;
        res.end(
          JSON.stringify({
            ok: false,
            outcome: 'REJECTED',
            valid: false,
            errors: {
              _payload: `Intake validation request body (${bodyRead.byteLength} bytes) exceeds maximum limit of ${MAX_INTAKE_VALIDATE_BODY_BYTES} bytes.`,
            },
            validatedAt: new Date().toISOString(),
            sideEffectsExecuted: false,
            workspace: 'uor-offline-foundry',
            diagnostic: {
              timestamp: new Date().toISOString(),
              endpoint: '/api/windmill/intake/validate',
              workspace: 'uor-offline-foundry',
              code: 'SANDBOX_ISOLATED',
              message: `Intake validation request body (${bodyRead.byteLength} bytes) exceeds maximum limit of ${MAX_INTAKE_VALIDATE_BODY_BYTES} bytes.`,
              browserNavigatorOnline: false,
            },
          })
        );
        return;
      }
      rawBody = bodyRead.body;
    }

    const dispatched = await dispatchWindmillProxyRoute({
      method,
      url: rawUrl,
      rawBody,
      transport,
    });

    res.statusCode = dispatched.statusCode;
    res.end(JSON.stringify(dispatched.body));
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
