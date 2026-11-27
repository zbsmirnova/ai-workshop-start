// Integration tests for spec/pr-notifications.md: scripts/pr-notify.py against a fake Slack server.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'pr-notify.py');
const CHANNEL = 'CTEST';

class FakeSlack {
  server: Server;
  url = '';
  posts: Record<string, unknown>[] = [];
  history: Record<string, unknown>[] = [];
  postResponse: Record<string, unknown> | null = null;

  constructor() {
    this.server = createServer((req, res) => {
      const method = new URL(req.url!, 'http://x').pathname.slice(1);
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        if (method === 'chat.postMessage') {
          this.posts.push(JSON.parse(raw));
          res.end(JSON.stringify(this.postResponse ?? { ok: true, ts: `${2000 + this.posts.length}.0` }));
        } else if (method === 'conversations.history') {
          res.end(JSON.stringify({ ok: true, messages: this.history }));
        } else {
          res.end(JSON.stringify({ ok: false, error: 'unknown_method' }));
        }
      });
    });
  }
  async start() {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    const addr = this.server.address();
    this.url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  }
}

async function setup(t: TestContext) {
  const slack = new FakeSlack();
  await slack.start();
  t.after(() => slack.server.close());
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SLACK_API_BASE: slack.url,
    SLACK_BOT_TOKEN: 'xoxb-test',
    SLACK_CHANNEL_ID: CHANNEL,
    PR_NUMBER: '7',
    PR_TITLE: 'Add <b>bold & nice</b> filter',
    PR_URL: 'https://github.com/o/r/pull/7',
    PR_AUTHOR: 'zina',
  };
  return { slack, env };
}

function run(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile('python3', [SCRIPT, ...args], { env }, (err, stdout, stderr) =>
      resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, stdout, stderr }));
  });
}

test('opened posts the thread root: author, escaped title, URL, marker, no unfurl', async (t) => {
  const { slack, env } = await setup(t);
  const res = await run(['opened'], env);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /delivered ts=/);
  assert.equal(slack.posts.length, 1);
  const post = slack.posts[0];
  assert.equal(post.channel, CHANNEL);
  assert.equal(post.text,
    'PR #7 opened by zina: Add &lt;b&gt;bold &amp; nice&lt;/b&gt; filter\nhttps://github.com/o/r/pull/7\n[pr:7]');
  assert.equal(post.parse, 'none');
  assert.equal(post.unfurl_links, false);
  assert.equal(post.thread_ts, undefined);
});

test('review events thread under the root found by marker, with state wording', async (t) => {
  const { slack, env } = await setup(t);
  slack.history = [
    { ts: '50.0', text: 'noise' },
    { ts: '42.0', text: 'PR #7 opened by zina: t\nurl\n[pr:7]' },
  ];
  for (const [state, expected] of [
    ['approved', '✅ rev approved #7'],
    ['changes_requested', '❌ rev requested changes on #7'],
    ['commented', '💬 rev reviewed #7'],
  ]) {
    slack.posts = [];
    const res = await run(['review'], { ...env, REVIEW_AUTHOR: 'rev', REVIEW_STATE: state });
    assert.equal(res.code, 0, res.stderr);
    assert.equal(slack.posts[0].thread_ts, '42.0');
    assert.equal(slack.posts[0].text, expected);
  }
  // The review body's first line is quoted, capped at 200 characters.
  slack.posts = [];
  await run(['review'], { ...env, REVIEW_AUTHOR: 'rev', REVIEW_STATE: 'approved',
    REVIEW_BODY: `${'x'.repeat(300)}\nsecond line` });
  assert.equal(slack.posts[0].text, `✅ rev approved #7\n> ${'x'.repeat(200)}`);
});

test('merged posts into the thread', async (t) => {
  const { slack, env } = await setup(t);
  slack.history = [{ ts: '42.0', text: 'root [pr:7]' }];
  const res = await run(['merged'], { ...env, MERGED_BY: 'zina' });
  assert.equal(res.code, 0, res.stderr);
  assert.deepEqual(
    [slack.posts[0].thread_ts, slack.posts[0].text], ['42.0', '🟣 #7 merged by zina']);
});

test('an event without a findable root becomes a new marked root instead of being dropped', async (t) => {
  const { slack, env } = await setup(t);
  slack.history = [{ ts: '42.0', text: 'some other [pr:77] thread' }]; // not #7
  const res = await run(['merged'], { ...env, MERGED_BY: 'zina' });
  assert.equal(res.code, 0, res.stderr);
  assert.equal(slack.posts[0].thread_ts, undefined);
  assert.equal(slack.posts[0].text, '🟣 #7 merged by zina\nhttps://github.com/o/r/pull/7\n[pr:7]');
});

test('missing configuration fails clearly with exit 1; API errors exit 3', async (t) => {
  const { slack, env } = await setup(t);
  const noChannel = await run(['opened'], { ...env, SLACK_CHANNEL_ID: '' });
  assert.deepEqual([noChannel.code, /missing SLACK_CHANNEL_ID/.test(noChannel.stderr)], [1, true]);

  const noNumber = await run(['opened'], { ...env, PR_NUMBER: '' });
  assert.equal(noNumber.code, 1);

  const noToken = { ...env, HOME: mkdtempSync(join(tmpdir(), 'no-home-')) };
  delete noToken.SLACK_BOT_TOKEN;
  const tokenless = await run(['opened'], noToken);
  assert.deepEqual([tokenless.code, /no Slack token/.test(tokenless.stderr)], [1, true]);

  const usage = await run(['closed'], env);
  assert.deepEqual([usage.code, /usage:/.test(usage.stderr)], [1, true]);

  slack.postResponse = { ok: false, error: 'not_in_channel' };
  const apiError = await run(['opened'], env);
  assert.deepEqual([apiError.code, /not_in_channel/.test(apiError.stderr)], [3, true]);
});
