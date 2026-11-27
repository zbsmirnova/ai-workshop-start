// Integration tests for the issue-to-pr skill's Slack Q&A scripts
// (.claude/skills/issue-to-pr/scripts), run against a fake Slack HTTP server.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPTS = join(import.meta.dirname, '..', '.claude', 'skills', 'issue-to-pr', 'scripts');
const CHANNEL = 'CTEST';
const BOT = 'UBOT';

type Handler = (method: string, body: Record<string, unknown>) => unknown;

/** Fake Slack: records chat.postMessage calls, serves scripted method responses. */
class FakeSlack {
  server: Server;
  url = '';
  posts: Record<string, unknown>[] = [];
  handlers = new Map<string, Handler>();
  failures = 0; // serve this many HTTP 500s before answering

  constructor() {
    this.handlers.set('auth.test', () => ({ ok: true, user_id: BOT }));
    this.handlers.set('chat.postMessage', (_m, body) => {
      this.posts.push(body);
      return { ok: true, ts: `${1000 + this.posts.length}.000000` };
    });
    this.handlers.set('conversations.history', () => ({ ok: true, messages: [] }));
    this.handlers.set('conversations.replies', () => ({ ok: true, messages: [{ ts: '1001.000000' }] }));
    this.server = createServer((req, res) => {
      if (this.failures > 0) { this.failures--; res.writeHead(500); res.end('boom'); return; }
      const method = new URL(req.url!, 'http://x').pathname.slice(1);
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : {};
        const handler = this.handlers.get(method);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(handler ? handler(method, body) : { ok: false, error: 'unknown_method' }));
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
  const stateDir = mkdtempSync(join(tmpdir(), 'issue-to-pr-'));
  const env = {
    ...process.env,
    SLACK_API_BASE: slack.url,
    SLACK_BOT_TOKEN: 'xoxb-test',
    ISSUE_TO_PR_CHANNEL: CHANNEL,
    ISSUE_TO_PR_STATE_DIR: stateDir,
    ISSUE_TO_PR_POLL_INTERVAL: '0.05',
  };
  return { slack, stateDir, env };
}

function run(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(join(SCRIPTS, script), args, { env }, (err, stdout, stderr) =>
      resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, stdout, stderr }));
  });
}

test('ask posts once and refuses to re-ask', async (t) => {
  const { slack, stateDir, env } = await setup(t);
  const first = await run('ask.sh', ['my-issue', 'A or B?'], env);
  assert.equal(first.code, 0);
  assert.match(first.stdout, /asked ts=/);
  assert.equal(slack.posts.length, 1);
  assert.match(String(slack.posts[0].text), /\[issue-to-pr:my-issue\]/);
  const state = JSON.parse(readFileSync(join(stateDir, 'my-issue.json'), 'utf8'));
  assert.equal(state.channel, CHANNEL);
  const second = await run('ask.sh', ['my-issue', 'A or B?'], env);
  assert.equal(second.code, 0);
  assert.match(second.stdout, /already-asked/);
  assert.equal(slack.posts.length, 1, 'no duplicate post');
});

test('ask recovers the thread from Slack history after a fresh clone', async (t) => {
  const { slack, stateDir, env } = await setup(t);
  slack.handlers.set('conversations.history', () => ({
    ok: true,
    messages: [
      { ts: '900.1', user: 'U1', text: 'unrelated' },
      { ts: '800.5', user: BOT, text: 'A or B?\n_[issue-to-pr:lost-issue]_' },
    ],
  }));
  const res = await run('ask.sh', ['lost-issue', 'A or B?'], env);
  assert.equal(res.code, 0);
  assert.match(res.stdout, /recovered-from-slack/);
  assert.equal(slack.posts.length, 0, 'recovery must not post');
  const state = JSON.parse(readFileSync(join(stateDir, 'lost-issue.json'), 'utf8'));
  assert.equal(state.ts, '800.5');
});

test('wait returns the human reply, ignoring the bot and other bots', async (t) => {
  const { slack, stateDir, env } = await setup(t);
  writeFileSync(join(stateDir, 'i.json'), JSON.stringify(
    { issue: 'i', channel: CHANNEL, ts: '100.0', last_ts: '100.0', answer: null }));
  slack.handlers.set('conversations.replies', () => ({
    ok: true,
    messages: [
      { ts: '100.0', user: BOT, text: 'the question' },
      { ts: '101.0', user: BOT, text: 'bot follow-up' },
      { ts: '102.0', user: 'UAPP', bot_id: 'B1', text: 'another integration' },
      { ts: '103.0', user: 'U2', subtype: 'channel_join', text: 'joined' },
      { ts: '104.0', user: 'UHUMAN', text: 'B &amp; a &lt;tweak&gt;' },
    ],
  }));
  const res = await run('wait-reply.sh', ['i', '5'], env);
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'ANSWER: B & a <tweak>', 'unescaped human answer');
  const state = JSON.parse(readFileSync(join(stateDir, 'i.json'), 'utf8'));
  assert.equal(state.answer, 'B & a <tweak>');
});

test('wait returns a recorded answer immediately and skips replies older than last_ts', async (t) => {
  const { stateDir, env, slack } = await setup(t);
  writeFileSync(join(stateDir, 'done.json'), JSON.stringify(
    { issue: 'done', channel: CHANNEL, ts: '100.0', last_ts: '105.0', answer: 'A' }));
  const res = await run('wait-reply.sh', ['done', '5'], env);
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), 'ANSWER: A');

  // After a follow-up (last_ts moved), an older human reply must not count.
  writeFileSync(join(stateDir, 'fu.json'), JSON.stringify(
    { issue: 'fu', channel: CHANNEL, ts: '100.0', last_ts: '105.0', answer: null }));
  slack.handlers.set('conversations.replies', () => ({
    ok: true,
    messages: [{ ts: '100.0', user: BOT, text: 'q' }, { ts: '104.0', user: 'UHUMAN', text: 'old' }],
  }));
  const timedOut = await run('wait-reply.sh', ['fu', '0.3'], env);
  assert.equal(timedOut.code, 2, 'old reply ignored, so it times out');
});

test('wait exits 2 on timeout and keeps the state pending', async (t) => {
  const { stateDir, env } = await setup(t);
  writeFileSync(join(stateDir, 'quiet.json'), JSON.stringify(
    { issue: 'quiet', channel: CHANNEL, ts: '100.0', last_ts: '100.0', answer: null }));
  const res = await run('wait-reply.sh', ['quiet', '0.3'], env);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /timeout/);
  assert.equal(JSON.parse(readFileSync(join(stateDir, 'quiet.json'), 'utf8')).answer, null);
});

test('wait exits 3 on a fatal API error', async (t) => {
  const { slack, stateDir, env } = await setup(t);
  writeFileSync(join(stateDir, 'bad.json'), JSON.stringify(
    { issue: 'bad', channel: CHANNEL, ts: '100.0', last_ts: '100.0', answer: null }));
  slack.handlers.set('auth.test', () => ({ ok: false, error: 'invalid_auth' }));
  const res = await run('wait-reply.sh', ['bad', '5'], env);
  assert.equal(res.code, 3);
  assert.match(res.stderr, /invalid_auth/);
});

test('wait survives transient HTTP errors and still gets the answer', async (t) => {
  const { slack, stateDir, env } = await setup(t);
  writeFileSync(join(stateDir, 'flaky.json'), JSON.stringify(
    { issue: 'flaky', channel: CHANNEL, ts: '100.0', last_ts: '100.0', answer: null }));
  slack.handlers.set('conversations.replies', () => ({
    ok: true,
    messages: [{ ts: '100.0', user: BOT, text: 'q' }, { ts: '101.0', user: 'UHUMAN', text: 'C' }],
  }));
  slack.failures = 2; // first two requests get HTTP 500
  const res = await run('wait-reply.sh', ['flaky', '10'], env);
  assert.equal(res.code, 0, res.stderr);
  assert.equal(res.stdout.trim(), 'ANSWER: C');
  assert.match(res.stderr, /transient/);
});

test('reply posts into the thread and advances last_ts', async (t) => {
  const { slack, stateDir, env } = await setup(t);
  writeFileSync(join(stateDir, 'th.json'), JSON.stringify(
    { issue: 'th', channel: CHANNEL, ts: '100.0', last_ts: '100.0', answer: 'A' }));
  const res = await run('reply.sh', ['th', 'why A?'], env);
  assert.equal(res.code, 0);
  assert.equal(slack.posts.length, 1);
  assert.equal(slack.posts[0].thread_ts, '100.0');
  const state = JSON.parse(readFileSync(join(stateDir, 'th.json'), 'utf8'));
  assert.equal(state.answer, null, 'follow-up clears the recorded answer');
  assert.notEqual(state.last_ts, '100.0');
});

test('invalid slugs and missing tokens fail with clear messages', async (t) => {
  const { stateDir, env } = await setup(t);
  const bad = await run('ask.sh', ['../../etc/passwd', 'q'], env);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /invalid slug/);
  assert.ok(!existsSync(join(stateDir, '..', 'etc')));

  const noToken = { ...env, HOME: mkdtempSync(join(tmpdir(), 'no-home-')) };
  delete (noToken as Record<string, unknown>).SLACK_BOT_TOKEN;
  const res = await run('ask.sh', ['ok-slug', 'q'], noToken);
  assert.equal(res.code, 1);
  assert.match(res.stderr, /no Slack token/);

  const usage = await run('wait-reply.sh', [], env);
  assert.equal(usage.code, 1);
  assert.match(usage.stderr, /usage:/);
});
