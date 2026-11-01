import { readFileSync } from 'node:fs';
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

/**
 * Preload hints for what the first screen needs, written into index.html: the library and the conversation, the KTX2 transcoder (js and wasm) and the two
 * atlases (their names carry a hash and come from public/data/books.json). The browser starts these fetches with the HTML, not after the scripts have run
 * and the scene has asked for them, and the transcoder no longer waits for the first atlas to arrive.
 */
function preloadHints(): Plugin {
  return {
    name: 'preload-hints',
    transformIndexHtml() {
      const lib = JSON.parse(readFileSync(new URL('./public/data/books.json', import.meta.url), 'utf8')) as { atlas: { url: string }[]; coverAtlas: { url: string }[] };
      const urls = ['/data/books.json', '/data/agentic.json', '/basis/basis_transcoder.js', '/basis/basis_transcoder.wasm', ...lib.atlas.map((a) => a.url), ...lib.coverAtlas.map((a) => a.url)];
      return urls.map((href) => ({ tag: 'link', attrs: { rel: 'preload', as: 'fetch', href, crossorigin: '' }, injectTo: 'head' as const }));
    },
  };
}

export default defineConfig({
  plugins: [react(), searchApi(), preloadHints()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
