import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * POST /api/llm {baseURL, apiKey, body} → forwards `body` to `${baseURL}/chat/completions`.
 * Runs only in the local dev/preview server: the browser can't call most model APIs directly (CORS),
 * and the key never leaves this machine except to the model provider.
 */
function llmProxy(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const { baseURL, apiKey, body } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const url = new URL(`${String(baseURL).replace(/\/+$/, '')}/chat/completions`);
      if (!/^https?:$/.test(url.protocol)) throw new Error('baseURL must be http(s)');
      const upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          // OpenRouter uses these to show the app in its dashboard.
          'HTTP-Referer': 'https://github.com/kubek80/jz-motion',
          'X-Title': 'jz-motion',
        },
        body: JSON.stringify(body),
      });
      res.statusCode = upstream.status;
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
      res.end(await upstream.text());
    } catch (e) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  };
  return {
    name: 'jzm-llm-proxy',
    configureServer: (server) => void server.middlewares.use('/api/llm', handle),
    configurePreviewServer: (server) => void server.middlewares.use('/api/llm', handle),
  };
}

export default defineConfig({
  plugins: [react(), llmProxy()],
  test: { environment: 'node' },
});
