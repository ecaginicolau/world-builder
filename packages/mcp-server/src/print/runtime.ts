import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { chromium, type Page } from 'playwright';

export const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export const artifactRoot = path.resolve(
  process.env.WORLD_BUILDER_ARTIFACT_DIR ?? path.join(projectRoot, 'output', 'mcp-print'),
);

export async function withPrintBrowser<T>(run: (page: Page) => Promise<T>): Promise<T> {
  const token = randomUUID();
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@': path.join(projectRoot, 'src') } },
    server: {
      host: '127.0.0.1', port: 0, strictPort: false,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.mcp.json', '**/.codex/**'] },
    },
    plugins: [{
      name: 'private-print-session',
      configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          if (req.headers['x-world-builder-print'] === token) return next();
          res.statusCode = 403;
          res.end('Private print session');
        });
      },
    }],
    esbuild: { jsx: 'automatic' },
  });
  let browser;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ extraHTTPHeaders: { 'x-world-builder-print': token } });
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Print server did not start');
    // No app scripts, authentication, or service-role credentials enter this page.
    const origin = `http://127.0.0.1:${address.port}`;
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(origin + '/')) return route.continue();
      return route.abort();
    });
    await page.route(origin + '/__print', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      }),
    );
    await page.goto(origin + '/__print');
    return await Promise.race([
      run(page),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Print operation exceeded 180 seconds')),
          180_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await browser?.close();
    await server.close();
  }
}

export async function inspectImage(src: string) {
  return withPrintBrowser((page) =>
    page.evaluate(async (src) => {
      const modulePath = '/src/features/chapters/mcpPrintBridge.ts';
      const bridge = await import(/* @vite-ignore */ modulePath);
      return bridge.inspectImage(src) as Promise<{ width: number; height: number }>;
    }, src),
  );
}
