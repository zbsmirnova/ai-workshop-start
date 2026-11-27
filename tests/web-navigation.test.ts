import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { createWebServer, listen } from '../src/web.ts';
import { FIXTURE, open, scanOrg } from './helpers.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

/** Real page and HTTP API, with parsed responses held to control race ordering. */
async function browser(t: TestContext) {
  const server = createWebServer({ open, scanOrganization: scanOrg });
  const base = await listen(server, 0);
  t.after(() => server.close());
  const html = await (await fetch(base)).text();
  const holds: { matches: (url: URL) => boolean; ready: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }[] = [];
  const requests: string[] = [];
  const dom = new JSDOM(html, {
    url: base, runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = async (input: string) => {
        const url = new URL(input, base);
        requests.push(url.href);
        const hold = holds.find(h => h.matches(url));
        if (hold) holds.splice(holds.indexOf(hold), 1);
        const response = await fetch(url);
        const data = await response.json();
        if (hold) { hold.ready.resolve(); await hold.release.promise; }
        response.json = async () => data;
        return response;
      };
    },
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const document = window.document;
  const input = (id: string) => document.getElementById(id) as HTMLInputElement;
  const button = document.getElementById('scan') as HTMLButtonElement;
  const text = (id: string) => document.getElementById(id)!.textContent;
  function hold(matches: (url: URL) => boolean) {
    const h = { matches, ready: deferred(), release: deferred() };
    holds.push(h);
    t.after(() => h.release.resolve());
    return { ready: h.ready.promise, release: async () => { h.release.resolve(); await flush(); } };
  }
  function submit(repo: string) {
    input('repo').value = repo;
    document.getElementById('form')!.dispatchEvent(new window.Event('submit', { cancelable: true }));
  }
  async function navigate(direction: 'back' | 'forward') {
    const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history[direction]();
    await popped;
  }
  function empty() {
    assert.equal(window.location.search, '');
    assert.equal(input('repo').value, '');
    assert.equal(text('summary'), '');
    assert.equal(document.querySelectorAll('#skills > li, #warnings > li').length, 0);
    for (const id of ['details', 'error', 'badge', 'progress', 'digest', 'count']) {
      assert.equal(document.getElementById(id)!.hidden, true, id);
    }
    assert.equal(button.disabled, false);
  }
  return { window, document, input, button, text, hold, submit, navigate, empty, requests };
}

for (const kind of ['repository', 'error', 'organization listing', 'organization page'] as const) {
  test(`Back ignores an abandoned ${kind}`, async t => {
    const b = await browser(t);
    const org = kind.startsWith('organization');
    const pending = b.hold(url => kind === 'organization page' ? url.searchParams.get('page') === '1' : true);
    b.submit(org ? 'https://github.com/BigOrg' : kind === 'error' ? 'https://github.com/JetBrains/missing' : FIXTURE);
    await pending.ready;
    assert.equal(b.button.disabled, true);
    await b.navigate('back');
    b.empty();
    const count = b.requests.length;
    await pending.release();
    b.empty();
    assert.equal(b.requests.length, count, 'abandoned organization stops requesting pages');
    const fresh = b.hold(() => true);
    await b.navigate('forward');
    await fresh.ready;
    assert.equal(b.button.disabled, true);
    assert.equal(b.text('summary'), 'Scanning…');
    await fresh.release();
  });
}

test('an abandoned response cannot finish or overwrite a newer scan', async t => {
  const b = await browser(t);
  const old = b.hold(() => true);
  b.submit(FIXTURE);
  await old.ready;
  await b.navigate('back');
  const fresh = b.hold(() => true);
  b.submit('https://github.com/JetBrains/example');
  await fresh.ready;
  await old.release();
  assert.equal(b.button.disabled, true);
  assert.equal(b.text('summary'), 'Scanning…');
  await fresh.release();
  assert.equal(b.button.disabled, false);
  assert.equal(b.text('summary'), 'JetBrains/example · 1 skill');
});

function filter(b: Awaited<ReturnType<typeof browser>>, value: string) {
  b.input('filter').value = value;
  b.input('filter').dispatchEvent(new b.window.Event('input'));
}

for (const repo of [FIXTURE, 'https://github.com/JetBrains/missing']) {
  test(`filtering preserves the submitted source through loading and completion: ${repo}`, async t => {
    const b = await browser(t);
    b.input('repo').value = 'unsubmitted-before-first-scan';
    filter(b, 'commits');
    assert.equal(b.window.location.search, '?filter=commits');
    const pending = b.hold(() => true);
    b.submit(repo);
    await pending.ready;
    b.input('repo').value = 'unsubmitted-edit';
    filter(b, 'style');
    assert.equal(new URLSearchParams(b.window.location.search).get('repo'), repo);
    await pending.release();
    filter(b, 'commits');
    assert.equal(new URLSearchParams(b.window.location.search).get('repo'), repo);
    if (repo === FIXTURE) assert.equal(b.text('summary'), 'fixture · 1 of 3 skills');
    else assert.equal(b.document.getElementById('error')!.hidden, false);
    filter(b, '');
    assert.equal(new URLSearchParams(b.window.location.search).get('repo'), repo);
    assert.equal(new URLSearchParams(b.window.location.search).has('filter'), false);

    const next = b.hold(() => true);
    b.submit('https://github.com/JetBrains/example');
    await next.ready;
    await next.release();
    const restored = b.hold(() => true);
    await b.navigate('back');
    await restored.ready;
    assert.equal(b.input('repo').value, repo);
    await restored.release();
    b.input('repo').value = 'another-draft';
    filter(b, 'commits');
    assert.equal(new URLSearchParams(b.window.location.search).get('repo'), repo);
  });
}
