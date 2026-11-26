// The local web view: the page, and the scan as JSON. A thin client of the core, like the CLI:
// what to scan comes in through `open`. Nothing is stored.
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { skillLink } from './core/model.ts';
import { scan, type ScanResult, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
};

const PAGE = readFileSync(new URL('./web/index.html', import.meta.url), 'utf8');

/** Only this machine: a page on another host must not reach the server through DNS rebinding. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The scan, with the links the page shows. */
export function scanJson({ repository, skills, warnings }: ScanResult) {
  return {
    repository,
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      path: skill.path,
      link: skillLink(repository, skill),
      alternateLinks: skill.alternatePaths.map((path) => skillLink(repository, { ...skill, path })),
      contents: skill.contents,
    })),
    warnings,
  };
}

export function createWebServer(options: WebOptions): Server {
  return createServer((request, response) => {
    handle(request, response, options).catch((error) => {
      send(response, 500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    });
  });
}

/** Listens on 127.0.0.1; resolves with the page's address, or rejects with a clear message. */
export function listen(server: Server, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(new AtlasError(error.code === 'EADDRINUSE' ? `Port ${port} is in use; try --port <port>` : `Cannot serve: ${error.message}`));
    });
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://localhost:${typeof address === 'object' && address ? address.port : port}`);
    });
  });
}

async function handle(request: IncomingMessage, response: ServerResponse, { open }: WebOptions) {
  if (!LOCAL_HOSTS.has(hostname(request.headers.host ?? ''))) return send(response, 403, { error: 'Forbidden host' });
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method !== 'GET') return send(response, 404, { error: 'Not found' });
  if (url.pathname === '/') return send(response, 200, PAGE, 'text/html; charset=utf-8');
  if (url.pathname !== '/api/scan') return send(response, 404, { error: 'Not found' });
  const repo = url.searchParams.get('repo')?.trim();
  if (!repo) return send(response, 400, { error: 'Enter a GitHub repository URL or a local directory' });
  try {
    send(response, 200, scanJson(await scan(await open(repo))));
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    send(response, 400, { error: error.message });
  }
}

/** `localhost:4173` → `localhost`; `[::1]:4173` → `[::1]`. */
function hostname(host: string): string {
  return host.toLowerCase().replace(/:\d*$/, '');
}

function send(response: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
  });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}
