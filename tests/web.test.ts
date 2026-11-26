// The decisions in spec/web.md: the server answered over HTTP, the page run in jsdom against it, and
// the real `skill-atlas serve` command.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest, createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { createWebServer, listen, type WebOptions } from '../src/web.ts';
import { BIG_ORG_SIZE, CLI, EXAMPLE_COMMIT, FIXTURE, open, scanOrg } from './helpers.ts';

const EXAMPLE_SKILL = '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n';

/** A server with GitHub answering from tests/helpers.ts; closed after the test. */
async function serve(t: TestContext, options: WebOptions = { open, scanOrganization: scanOrg }): Promise<string> {
  const server = createWebServer(options);
  t.after(() => server.close());
  return listen(server, 0);
}

async function scanApi(base: string, repo: string, page?: number) {
  const response = await fetch(`${base}/api/scan?repo=${encodeURIComponent(repo)}${page === undefined ? '' : `&page=${page}`}`);
  return { status: response.status, type: response.headers.get('content-type'), body: await response.json() };
}

function temporaryRepository(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-web-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeSkill(root: string, path: string, contents: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}

/** A raw request, so the test can send any Host header. */
function get(base: string, path: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(new URL(path, base), { method, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8').on('data', (chunk) => (body += chunk)).on('end', () => resolve({ status: response.statusCode!, body }));
    });
    request.on('error', reject).end();
  });
}

test('GET / is the page, with a field for the repository link', async (t) => {
  const base = await serve(t);
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  const { document } = new JSDOM(await response.text()).window;
  assert.equal(document.querySelector('input#repo')?.getAttribute('aria-label'), 'Repository link');
  assert.equal(document.querySelector('button[type=submit]')?.textContent, 'Scan');
  assert.equal(document.querySelector('input#filter')?.getAttribute('aria-label'), 'Filter skills');
});

test('the API returns the repository, each skill with its pinned link and full SKILL.md, and the warnings', async (t) => {
  const base = await serve(t);
  const result = await scanApi(base, 'https://github.com/JetBrains/example');
  assert.equal(result.status, 200);
  assert.equal(result.type, 'application/json; charset=utf-8');
  assert.deepEqual(result.body, {
    repository: {
      id: 'JetBrains/example',
      organization: 'JetBrains',
      name: 'example',
      url: 'https://github.com/JetBrains/example',
      commit: EXAMPLE_COMMIT,
    },
    skills: [{
      id: 'JetBrains/example:.claude/skills/commits/SKILL.md',
      name: 'commits',
      description: 'Write commit messages the way this repository does. Use for every commit.',
      path: '.claude/skills/commits/SKILL.md',
      link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      alternateLinks: [],
      contents: EXAMPLE_SKILL,
    }],
    warnings: [],
  });
});

test('the API scans a local directory: sorted skills, their contents, and the malformed front matter warning', async (t) => {
  const base = await serve(t);
  const { status, body } = await scanApi(base, FIXTURE);
  assert.equal(status, 200);
  const root = pathToFileURL(FIXTURE).href;
  assert.deepEqual(
    body.skills.map((skill: { name: string; link: string; contents: string; path: string }) => [skill.name, skill.link, skill.contents === readFileSync(join(FIXTURE, skill.path), 'utf8')]),
    [
      ['code-style', `${root}/.github/skills/code-style/SKILL.md`, true],
      ['commits', `${root}/.claude/skills/commits/SKILL.md`, true],
      ['release-checklist', `${root}/.agents/skills/release-checklist/SKILL.md`, true],
    ],
  );
  assert.equal(body.warnings.length, 1);
  assert.match(body.warnings[0], /^\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('verified equivalents come with alternate links and the shared contents', async (t) => {
  const root = temporaryRepository(t);
  const contents = '---\nname: Same task\ndescription: Check changes.\n---\nReview every changed line.\n';
  writeSkill(root, '.agents/skills/alpha/SKILL.md', contents);
  writeSkill(root, '.claude/skills/renamed/SKILL.md', contents);
  const base = await serve(t);
  const { body } = await scanApi(base, root);
  const url = pathToFileURL(root).href;
  assert.equal(body.skills.length, 1);
  assert.equal(body.skills[0].link, `${url}/.agents/skills/alpha/SKILL.md`);
  assert.deepEqual(body.skills[0].alternateLinks, [`${url}/.claude/skills/renamed/SKILL.md`]);
  assert.equal(body.skills[0].contents, contents);
});

test('the API answers an owner URL with one page: repositories by name, zero-skill ones included', async (t) => {
  const base = await serve(t);
  const result = await scanApi(base, 'https://github.com/Acme');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.organization, { name: 'Acme', url: 'https://github.com/Acme' });
  assert.equal(result.body.repositoryCount, 4);
  assert.equal(result.body.page, 1);
  assert.equal(result.body.pageCount, 1);
  assert.deepEqual(
    result.body.repositories.map((entry: { repository: { id: string }; skills: { name: string }[]; warnings: string[] }) =>
      [entry.repository.id, entry.skills.map(({ name }) => name), entry.warnings]),
    [
      ['Acme/empty', [], []],
      ['Acme/tools', ['deploy'], []],
      ['Acme/widgets', ['assemble', 'paint'], []],
    ],
  );
  assert.equal(
    result.body.repositories[1].skills[0].link,
    'https://github.com/Acme/tools/blob/tools-commit/.claude/skills/deploy/SKILL.md',
  );
  assert.deepEqual(result.body.warnings, ['Acme/broken: Repository not found: https://github.com/Acme/broken']);
});

test('the API pages an organization 20 repositories at a time', async (t) => {
  const base = await serve(t);
  const page1 = await scanApi(base, 'https://github.com/BigOrg');
  assert.equal(page1.body.pageCount, 2);
  assert.equal(page1.body.repositories.length, 20);

  const page2 = await scanApi(base, 'https://github.com/BigOrg', 2);
  assert.equal(page2.body.page, 2);
  assert.equal(page2.body.repositories.length, BIG_ORG_SIZE - 20);
  assert.deepEqual(page2.body.repositories.at(-1).skills.map(({ name }: { name: string }) => name), ['finale']);

  const beyond = await scanApi(base, 'https://github.com/BigOrg', 3);
  assert.equal(beyond.status, 200);
  assert.deepEqual(beyond.body.repositories, []);

  for (const page of ['0', 'abc', '-1']) {
    const response = await fetch(`${base}/api/scan?repo=${encodeURIComponent('https://github.com/BigOrg')}&page=${page}`);
    assert.equal(response.status, 400, page);
    assert.deepEqual(await response.json(), { error: `Not a page: ${page}` });
  }
});

test('an unknown owner → 400 with the clear message', async (t) => {
  const base = await serve(t);
  const result = await scanApi(base, 'https://github.com/not-answered-owner');
  assert.equal(result.status, 400);
  assert.equal(
    result.body.error,
    'Cannot reach GitHub: not recorded: https://api.github.com/users/not-answered-owner/repos?per_page=100&page=1',
  );
});

test('a missing or blank repo → 400 with a message', async (t) => {
  const base = await serve(t);
  for (const path of ['/api/scan', '/api/scan?repo=', '/api/scan?repo=%20%20']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 400, path);
    assert.deepEqual(await response.json(), { error: 'Enter a GitHub repository URL or a local directory' });
  }
});

test('an unreachable repository → 400 with the scan\'s clear message', async (t) => {
  const base = await serve(t);
  const missing = await scanApi(base, join(FIXTURE, 'no-such-directory'));
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /^Not a GitHub URL or a readable directory: .*no-such-directory$/);
  const offline = await scanApi(base, 'https://github.com/JetBrains/not-answered');
  assert.deepEqual(offline, {
    status: 400,
    type: 'application/json; charset=utf-8',
    body: { error: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered' },
  });
});

test('any other failure → 500, an unexpected error', async (t) => {
  const base = await serve(t, { open: async () => { throw new Error('boom'); } });
  const result = await scanApi(base, 'anything');
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'Unexpected error: boom' });
});

test('only local Host headers are answered', async (t) => {
  const base = await serve(t);
  const { port } = new URL(base);
  for (const host of ['localhost', `localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, `LOCALHOST:${port}`]) {
    assert.equal((await get(base, '/', { host })).status, 200, host);
  }
  for (const host of [`evil.example:${port}`, 'localhost.evil.example', `127.0.0.2:${port}`]) {
    const response = await get(base, '/api/scan?repo=.', { host });
    assert.equal(response.status, 403, host);
    assert.deepEqual(JSON.parse(response.body), { error: 'Forbidden host' });
  }
});

test('the server listens on 127.0.0.1 only; other paths and methods → 404', async (t) => {
  const server = createWebServer({ open });
  t.after(() => server.close());
  await listen(server, 0);
  assert.equal((server.address() as AddressInfo).address, '127.0.0.1');
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  assert.equal((await get(base, '/index.html')).status, 404);
  assert.equal((await get(base, '/api/scan/x?repo=.')).status, 404);
  assert.equal((await get(base, '/', {}, 'POST')).status, 404);
  assert.equal((await get(base, '/api/scan?repo=.', {}, 'DELETE')).status, 404);
});

/** The page in jsdom, at `path`, talking to the real server. */
async function page(t: TestContext, path: string) {
  const base = await serve(t);
  const html = await (await fetch(`${base}/`)).text();
  const dom = new JSDOM(html, {
    url: new URL(path, base).href,
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = (url: string) => fetch(new URL(url, base));
    },
  });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const text = (selector: string) => document.querySelector(selector)?.textContent ?? '';
  const settled = async () => {
    // The scan is over when the button is enabled again and the summary is not "Scanning…".
    for (let i = 0; i < 200 && (text('#summary') === 'Scanning…' || (document.getElementById('scan') as HTMLButtonElement).disabled); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  await settled();
  return { window: dom.window, document, text, settled };
}

test('the page: opening ?repo= scans it and shows the skills, their links, warnings and the first SKILL.md', async (t) => {
  const { document, text } = await page(t, `/?repo=${encodeURIComponent(FIXTURE)}`);
  assert.equal((document.getElementById('repo') as HTMLInputElement).value, FIXTURE);
  assert.equal(text('#summary'), 'fixture · 3 skills');
  const items = [...document.querySelectorAll('#skills > li')];
  assert.deepEqual(items.map((item) => item.querySelector('.name')?.textContent), ['code-style', 'commits', 'release-checklist']);
  assert.equal(items[0].querySelector('.description')?.textContent, "Follow the project's code style. Use before committing Kotlin or Java changes.");
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(items[1].querySelector('a')?.getAttribute('href'), `${root}/.claude/skills/commits/SKILL.md`);
  assert.equal(items[2].querySelector('.description'), null);
  assert.match(text('#warnings'), /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
  assert.equal(items[0].getAttribute('aria-selected'), 'true');
  assert.equal(text('#title'), 'code-style');
  assert.equal(document.getElementById('error')?.hidden, true);
});

test('the page: selecting a skill shows its SKILL.md, front matter above the instructions', async (t) => {
  const { document, text } = await page(t, `/?repo=${encodeURIComponent(FIXTURE)}`);
  const commits = document.querySelectorAll<HTMLElement>('#skills > li')[1];
  commits.click();
  assert.equal(commits.getAttribute('aria-selected'), 'true');
  assert.equal(document.querySelectorAll('#skills > li[aria-selected="true"]').length, 1);
  assert.equal(text('#title'), 'commits');
  const [, frontMatter, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(readFileSync(join(FIXTURE, '.claude/skills/commits/SKILL.md'), 'utf8'))!;
  assert.equal(document.getElementById('frontMatter')?.hidden, false);
  assert.equal(text('#frontMatter'), frontMatter);
  assert.equal(text('#body'), body.replace(/^\s*\n/, ''));
});

test('the page: a SKILL.md without front matter is shown whole', async (t) => {
  const root = temporaryRepository(t);
  writeSkill(root, '.claude/skills/plain/SKILL.md', '# Plain\nJust instructions.\n');
  const { document, text } = await page(t, `/?repo=${encodeURIComponent(root)}`);
  assert.equal(text('#title'), 'plain');
  assert.equal(document.getElementById('frontMatter')?.hidden, true);
  assert.equal(text('#body'), '# Plain\nJust instructions.\n');
});

test('the page: submitting the field scans it and keeps it in the address', async (t) => {
  const { window, document, text, settled } = await page(t, '/');
  assert.equal(text('#summary'), '');
  assert.equal(document.getElementById('details')?.hidden, true);
  (document.getElementById('repo') as HTMLInputElement).value = 'https://github.com/JetBrains/example';
  document.getElementById('form')!.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settled();
  assert.equal(window.location.search, `?repo=${encodeURIComponent('https://github.com/JetBrains/example')}`);
  assert.equal(text('#summary'), 'JetBrains/example · 1 skill');
  assert.equal(text('#skills .link'), `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`);
  assert.equal(text('#body'), '# Commits\n');
});

test('the page: opening ?filter= applies it after the scan: hidden entries, M of N, a visible selection', async (t) => {
  // AND, case-insensitive substrings: "COMMIT style" keeps only code-style.
  const { document, text } = await page(t, `/?repo=${encodeURIComponent(FIXTURE)}&filter=${encodeURIComponent('COMMIT style')}`);
  assert.equal((document.getElementById('filter') as HTMLInputElement).value, 'COMMIT style');
  assert.equal(text('#summary'), 'fixture · 1 of 3 skills');
  const visible = [...document.querySelectorAll<HTMLElement>('#skills > li:not([hidden])')];
  assert.deepEqual(visible.map((item) => item.querySelector('.name')?.textContent), ['code-style']);
  assert.equal(visible[0].getAttribute('aria-selected'), 'true');
  assert.equal(text('#title'), 'code-style');
});

test('the page: the filter field filters live, client-side, and keeps its value in the address', async (t) => {
  const { window, document, text } = await page(t, `/?repo=${encodeURIComponent(FIXTURE)}`);
  const filter = document.getElementById('filter') as HTMLInputElement;
  const type = (value: string) => {
    filter.value = value;
    filter.dispatchEvent(new window.Event('input'));
  };

  type('RELEASE');
  assert.equal(text('#summary'), 'fixture · 1 of 3 skills');
  assert.deepEqual(
    [...document.querySelectorAll('#skills > li:not([hidden]) .name')].map((name) => name.textContent),
    ['release-checklist'],
  );
  assert.equal(new URLSearchParams(window.location.search).get('filter'), 'RELEASE');
  assert.equal(text('#title'), 'release-checklist');

  // No matches: a 0 of N header and no selection.
  type('no-such-words');
  assert.equal(text('#summary'), 'fixture · 0 of 3 skills');
  assert.equal(document.querySelectorAll('#skills > li:not([hidden])').length, 0);
  assert.equal(document.querySelectorAll('#skills > li[aria-selected="true"]').length, 0);
  assert.equal(document.getElementById('details')?.hidden, true);

  // A blank filter keeps every skill and drops the parameter.
  type('');
  assert.equal(text('#summary'), 'fixture · 3 skills');
  assert.equal(document.querySelectorAll('#skills > li:not([hidden])').length, 3);
  assert.equal(new URLSearchParams(window.location.search).get('filter'), null);
  assert.equal(new URLSearchParams(window.location.search).get('repo'), FIXTURE);
});

test('the page: a filter typed before a scan is kept in the address and applied by the next scan', async (t) => {
  const { window, document, text, settled } = await page(t, '/');
  const filter = document.getElementById('filter') as HTMLInputElement;
  filter.value = 'commit style';
  filter.dispatchEvent(new window.Event('input'));
  assert.equal(new URLSearchParams(window.location.search).get('filter'), 'commit style');

  (document.getElementById('repo') as HTMLInputElement).value = FIXTURE;
  document.getElementById('form')!.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await settled();
  assert.equal(text('#summary'), 'fixture · 1 of 3 skills');
  assert.deepEqual(
    [...document.querySelectorAll('#skills > li:not([hidden]) .name')].map((name) => name.textContent),
    ['code-style'],
  );
});

test('the page: an owner URL loads every page and shows repository sections', async (t) => {
  const { document, text } = await page(t, `/?repo=${encodeURIComponent('https://github.com/BigOrg')}`);
  assert.equal(text('#summary'), `BigOrg · ${BIG_ORG_SIZE} repositories · 1 skill`);
  assert.deepEqual(
    [...document.querySelectorAll('#skills > li.repo')].map((heading) => heading.textContent),
    ['BigOrg/r24 · 1 skill'],
  );
  assert.equal(text('#skills li.skill .name'), 'finale');
  assert.equal(text('#skills li.skill .link'), 'https://github.com/BigOrg/r24/blob/commit-r24/.claude/skills/finale/SKILL.md');
  assert.equal(text('#title'), 'finale');
});

test('the page: the filter counts matching skills across the organization and hides empty sections', async (t) => {
  const { window, document, text } = await page(t, `/?repo=${encodeURIComponent('https://github.com/Acme')}`);
  assert.equal(text('#summary'), 'Acme · 4 repositories · 3 skills');
  assert.deepEqual(
    [...document.querySelectorAll('#skills > li.repo')].map((heading) => heading.textContent),
    ['Acme/tools · 1 skill', 'Acme/widgets · 2 skills'],
  );
  assert.match(text('#warnings'), /warning: Acme\/broken: Repository not found: https:\/\/github\.com\/Acme\/broken/);

  const filter = document.getElementById('filter') as HTMLInputElement;
  filter.value = 'paint';
  filter.dispatchEvent(new window.Event('input'));
  assert.equal(text('#summary'), 'Acme · 4 repositories · 1 of 3 skills');
  assert.deepEqual(
    [...document.querySelectorAll<HTMLElement>('#skills > li.repo:not([hidden])')].map((heading) => heading.textContent),
    ['Acme/widgets · 1 skill'],
  );
  assert.deepEqual(
    [...document.querySelectorAll('#skills > li.skill:not([hidden]) .name')].map((name) => name.textContent),
    ['paint'],
  );
  assert.equal(text('#title'), 'paint');
});

test('the page: an error is a clear message in place of the result', async (t) => {
  const { document, text } = await page(t, '/?repo=https://github.com/JetBrains/not-answered');
  assert.equal(document.getElementById('error')?.hidden, false);
  assert.equal(text('#error'), 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/not-answered');
  assert.equal(text('#summary'), '');
  assert.equal(document.querySelectorAll('#skills > li').length, 0);
});

test('the page: repository text is shown as text, never as HTML', async (t) => {
  const root = temporaryRepository(t);
  const html = '<img src=x onerror="window.injected=1">';
  writeSkill(root, '.claude/skills/tricky/SKILL.md', `---\nname: '${html}'\ndescription: '${html}'\n---\n${html}\n`);
  const { window, document, text } = await page(t, `/?repo=${encodeURIComponent(root)}`);
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.equal(text('#skills .name'), html);
  assert.equal(text('#skills .description'), html);
  assert.equal(text('#title'), html);
  assert.equal(text('#body'), `${html}\n`);
  assert.equal((window as unknown as { injected?: number }).injected, undefined);
});

/** `skill-atlas serve <args>`; resolves with its address once it listens. */
async function startCli(t: TestContext, args: string[], cwd?: string) {
  const child = spawn(process.execPath, [CLI, 'serve', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let stdout = '';
  child.stdout.setEncoding('utf8');
  for await (const chunk of child.stdout) {
    stdout += chunk;
    const match = /^Skill Atlas at (http:\/\/localhost:\d+)\n/.exec(stdout);
    if (match) return match[1];
  }
  throw new Error(`serve exited without listening: ${stdout}`);
}

test('./skill-atlas serve prints its address, serves the page and the scan, and stores nothing', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const base = await startCli(t, ['--port', '0'], cwd);
  assert.equal((await fetch(`${base}/`)).status, 200);
  const result = await scanApi(base, FIXTURE);
  assert.equal(result.status, 200);
  assert.equal(result.body.skills.length, 3);
  assert.deepEqual(readdirSync(cwd), []);
});

test('./skill-atlas serve --port=<port> uses that port', async (t) => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  assert.equal(await startCli(t, [`--port=${port}`]), `http://localhost:${port}`);
});

test('a port in use → a clear message, exit code 1', async (t) => {
  const busy: Server = createServer();
  t.after(() => busy.close());
  busy.listen(0, '127.0.0.1');
  await once(busy, 'listening');
  const { port } = busy.address() as AddressInfo;
  const result = spawnSync(process.execPath, [CLI, 'serve', '--port', String(port)], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, `Port ${port} is in use; try --port <port>\n`);
});

test('bad serve arguments → usage, exit code 1', () => {
  for (const [args, message] of [
    [['--port'], 'Usage: skill-atlas serve [--port <port>]\n'],
    [['--port', '1', 'extra'], 'Usage: skill-atlas serve [--port <port>]\n'],
    [['8080'], 'Usage: skill-atlas serve [--port <port>]\n'],
    [['--port', 'abc'], 'Not a port: abc\n\nUsage: skill-atlas serve [--port <port>]\n'],
    [['--port=70000'], 'Not a port: 70000\n\nUsage: skill-atlas serve [--port <port>]\n'],
  ] as const) {
    const result = spawnSync(process.execPath, [CLI, 'serve', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, args.join(' '));
    assert.equal(result.stderr, message, args.join(' '));
  }
});

test('help lists serve', () => {
  const result = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.match(result.stdout, /^ {2}serve \[--port <port>\] +the same, in a local web view \(port 4173 by default\)$/m);
});
