import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type Handler = (req: { method?: string; body: string }, res: unknown) => Promise<void>;

/**
 * Mounts `/api/search` on the dev and preview servers, calling the same handler Vercel runs
 * (`api/search.js`). It reads TYPESAFE_API_KEY from the environment; without it the handler answers 503 no_key.
 */
function searchApi(): Plugin {
  let handler: Promise<Handler> | null = null;
  const load = () => (handler ??= import(pathToFileURL(fileURLToPath(new URL('./api/search.js', import.meta.url))).href).then((m: { default: Handler }) => m.default));

  const middleware: Connect.NextHandleFunction = async (req: IncomingMessage, res: ServerResponse, next) => {
    if (req.method !== 'POST') return next();
    let body = '';
    for await (const chunk of req) body += chunk;
    // Vercel's response helpers, as far as the handler uses them.
    const shim = {
      status(code: number) {
        res.statusCode = code;
        return shim;
      },
      json(obj: unknown) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(obj));
      },
    };
    try {
      await (await load())({ method: req.method, body }, shim);
    } catch (err) {
      console.error('[search] handler failed', err);
      shim.status(400).json({ error: 'bad_request', message: String((err as Error)?.message ?? err) });
    }
  };

  return {
    name: 'search-api',
    configureServer: (server) => void server.middlewares.use('/api/search', middleware),
    configurePreviewServer: (server) => void server.middlewares.use('/api/search', middleware),
  };
}

export default defineConfig({
  plugins: [react(), searchApi()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
