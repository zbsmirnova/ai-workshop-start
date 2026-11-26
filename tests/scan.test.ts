// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts. Local path edge cases
// are covered below.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { run } from '../src/commands.ts';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);
const GITHUB_COMMIT = 'edge-case-commit';

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every skill, sorted by name, linked to its file, with a warning for the malformed one', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 3 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('scan --filter keeps skills whose name or description contains every word, case-insensitively', async () => {
  const root = pathToFileURL(FIXTURE).href;
  // "COMMIT" is a case-insensitive substring of "committing" (code-style) and "commit" (commits).
  const oneWord = await atlas(['scan', FIXTURE, '--filter', 'COMMIT']);
  assert.equal(oneWord.code, 0);
  assert.equal(
    oneWord.stdout,
    [
      'fixture · 2 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );

  // AND: every word must match; "style" drops commits. Words may come as separate arguments.
  for (const args of [['--filter', 'commit style'], ['--filter', 'commit', 'style'], ['--filter=commit', 'style']]) {
    const and = await atlas(['scan', FIXTURE, ...args]);
    assert.equal(and.code, 0, args.join(' '));
    assert.equal(
      and.stdout,
      [
        'fixture · 1 skill',
        "code-style — Follow the project's code style.",
        `  ${root}/.github/skills/code-style/SKILL.md`,
      ].join('\n'),
      args.join(' '),
    );
  }
});

test('scan --filter with no matches is a successful scan with 0 skills, keeping the warnings', async () => {
  const none = await atlas(['scan', FIXTURE, '--filter', 'no-such-words']);
  assert.equal(none.code, 0);
  assert.equal(none.stdout, 'fixture · 0 skills');
  assert.match(none.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('a blank scan --filter keeps every skill', async () => {
  const blank = await atlas(['scan', FIXTURE, '--filter', '  ']);
  assert.equal(blank.code, 0);
  assert.equal(blank.stdout, fixture.stdout);
});

test('unknown scan arguments → usage, exit code 1', async () => {
  for (const args of [['scan'], ['scan', FIXTURE, '--nope'], ['scan', '--filter', 'words']]) {
    const result = await atlas(args);
    assert.equal(result.code, 1, args.join(' '));
    assert.equal(result.stderr, 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>]', args.join(' '));
  }
});

test('an empty local directory scans successfully with no skills', (t) => {
  const root = temporaryRepository(t);
  const scanned = scanLocal(root);
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${basename(root)} · 0 skills\n`);
  assert.equal(scanned.stderr, '');
});

test('only one-level SKILL.md files under the four approved roots count', (t) => {
  const root = temporaryRepository(t);
  writeSkill(root, '.agents/skills/agents-workflow/SKILL.md');
  writeSkill(root, '.claude/skills/claude-skill/SKILL.md');
  writeSkill(root, '.github/skills/github-skill/SKILL.md');
  writeSkill(root, 'agent/skills/project-workflow/SKILL.md');
  writeSkill(root, 'SKILL.md');
  writeSkill(root, '.agents/skills/SKILL.md');
  writeSkill(root, '.agents/skills/group/shared/SKILL.md');
  writeSkill(root, '.agents/skills/wrong-case/skill.md');
  writeSkill(root, '.agents/skills/wrong-case/SKILL.MD');
  writeSkill(root, 'plugins/mcp-tools/resources/skills/product/SKILL.md');
  writeSkill(root, 'integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md');
  writeSkill(root, 'other/skills/unapproved/SKILL.md');

  const url = pathToFileURL(root).href;
  const scanned = scanLocal(root);
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      `${basename(root)} · 4 skills`,
      'agents-workflow',
      `  ${url}/.agents/skills/agents-workflow/SKILL.md`,
      'claude-skill',
      `  ${url}/.claude/skills/claude-skill/SKILL.md`,
      'github-skill',
      `  ${url}/.github/skills/github-skill/SKILL.md`,
      'project-workflow',
      `  ${url}/agent/skills/project-workflow/SKILL.md`,
    ].join('\n') + '\n',
  );
  assert.equal(scanned.stderr, '');
});

test('approved root names are case-sensitive', async () => {
  const result = await scan({
    repository: { id: 'JetBrains/case', organization: 'JetBrains', name: 'case', url: '', commit: 'sha' },
    paths: ['.AGENTS/skills/wrong-root/SKILL.md'],
    warnings: [],
    read: async () => new TextEncoder().encode('---\n---\n'),
  });
  assert.deepEqual(result.skills, []);
});

test('equivalent instructions merge across names, while behavior or metadata differences remain separate', async (t) => {
  const root = temporaryRepository(t);
  const instructions = '---\nname: Review checklist\ndescription: Check changes consistently.\n---\n# Instructions\n\nCheck every changed line.\n';
  writeSkill(root, '.agents/skills/alpha/SKILL.md', instructions);
  writeSkill(root, '.claude/skills/renamed/SKILL.md', `\r\n${instructions.replace(/\n/g, '\r\n')}\r\n`);
  writeSkill(root, '.github/skills/alpha/SKILL.md', instructions.replace('Check every changed line.', 'Rewrite every changed line.'));
  writeSkill(root, 'agent/skills/other-title/SKILL.md', instructions.replace('name: Review checklist', 'name: Different title'));

  const url = pathToFileURL(root).href;
  const source = await openDirectory(root);
  const result = await scan(source);
  assert.deepEqual(
    result.skills.map(({ id, path, name, description, alternatePaths }) => [id, path, name, description, alternatePaths]),
    [
      [`${basename(root)}:agent/skills/other-title/SKILL.md`, 'agent/skills/other-title/SKILL.md', 'Different title', 'Check changes consistently.', []],
      [`${basename(root)}:.agents/skills/alpha/SKILL.md`, '.agents/skills/alpha/SKILL.md', 'Review checklist', 'Check changes consistently.', ['.claude/skills/renamed/SKILL.md']],
      [`${basename(root)}:.github/skills/alpha/SKILL.md`, '.github/skills/alpha/SKILL.md', 'Review checklist', 'Check changes consistently.', []],
    ],
  );
  const nextRevision = await scan({
    ...source,
    repository: { ...source.repository, commit: 'next-revision' },
  });
  assert.deepEqual(
    nextRevision.skills.map(({ id }) => id),
    result.skills.map(({ id }) => id),
  );

  const scanned = scanLocal(root);
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      `${basename(root)} · 3 skills`,
      'Different title — Check changes consistently.',
      `  ${url}/agent/skills/other-title/SKILL.md`,
      'Review checklist — Check changes consistently.',
      `  ${url}/.agents/skills/alpha/SKILL.md`,
      `  also: ${url}/.claude/skills/renamed/SKILL.md`,
      'Review checklist — Check changes consistently.',
      `  ${url}/.github/skills/alpha/SKILL.md`,
    ].join('\n') + '\n',
  );
  assert.equal(scanned.stderr, '');
});

test('unreadable candidates warn and readable candidates remain independent', async (t) => {
  const root = temporaryRepository(t);
  writeSkill(root, '.agents/skills/first/SKILL.md', '---\nname: Same\n---\nSame task.\n');
  writeSkill(root, '.claude/skills/second/SKILL.md', '---\nname: Same\n---\nSame task.\n');
  const source = await openDirectory(root);
  const read = source.read;
  source.read = (path) => path === '.agents/skills/first/SKILL.md' ? Promise.resolve(undefined) : read(path);

  const result = await scan(source);
  assert.deepEqual(result.skills.map(({ id, path }) => [id, path]), [
    [`${basename(root)}:.claude/skills/second/SKILL.md`, '.claude/skills/second/SKILL.md'],
  ]);
  assert.deepEqual(result.warnings, [
    '.agents/skills/first/SKILL.md: listed, but not found at the scanned commit; skipped',
  ]);
});

test('unreadable candidates produce warnings and a zero-skill scan when no copy can be read', async (t) => {
  const root = temporaryRepository(t);
  writeSkill(root, '.agents/skills/shared/SKILL.md');
  writeSkill(root, '.claude/skills/shared/SKILL.md');
  const source = await openDirectory(root);
  source.read = async () => undefined;

  const result = await scan(source);
  assert.deepEqual(result.skills, []);
  assert.deepEqual(result.warnings, [
    '.agents/skills/shared/SKILL.md: listed, but not found at the scanned commit; skipped',
    '.claude/skills/shared/SKILL.md: listed, but not found at the scanned commit; skipped',
  ]);
});

test('referenced resources and companion files keep otherwise identical skills separate', async (t) => {
  const root = temporaryRepository(t);
  const linked = '---\nname: Helper skill\n---\nRead [the helper](./helper.md) before acting.\n';
  writeSkill(root, '.agents/skills/link-one/SKILL.md', linked);
  writeSkill(root, '.agents/skills/link-one/helper.md', 'First helper.\n');
  writeSkill(root, '.claude/skills/link-two/SKILL.md', linked);
  writeSkill(root, '.claude/skills/link-two/helper.md', 'Second helper.\n');

  const plain = '---\nname: Plain skill\n---\nDo the same work.\n';
  writeSkill(root, '.github/skills/with-companion/SKILL.md', plain);
  writeSkill(root, '.github/skills/with-companion/notes.txt', 'Local companion.\n');
  writeSkill(root, 'agent/skills/without-companion/SKILL.md', plain);

  const result = await scan(await openDirectory(root));
  assert.deepEqual(result.skills.map(({ path, alternatePaths }) => [path, alternatePaths]), [
    ['.agents/skills/link-one/SKILL.md', []],
    ['.claude/skills/link-two/SKILL.md', []],
    ['.github/skills/with-companion/SKILL.md', []],
    ['agent/skills/without-companion/SKILL.md', []],
  ]);
});

test('GitHub code search cannot verify companion files and keeps matching candidates separate', async () => {
  const repository = 'JetBrains/incomplete-search';
  const recording = githubRecording(repository);
  const first = '.agents/skills/first/SKILL.md';
  const second = '.claude/skills/second/SKILL.md';
  const contents = '---\nname: Same\n---\nPerform the same task.\n';
  recording[`https://api.github.com/search/code?q=filename:SKILL.md+repo:${repository}&per_page=100&page=1`] = {
    status: 200,
    body: { total_count: 2, items: [{ path: first }, { path: second }] },
  };
  recording[`https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${first}`] = { status: 200, body: contents };
  recording[`https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${second}`] = { status: 200, body: contents };

  const result = await scan(await openGitHub(`https://github.com/${repository}`, { fetch: replay(recording), token: 'test-token' }));
  assert.equal(result.repository.commit, GITHUB_COMMIT);
  assert.deepEqual(result.skills.map(({ id, path, alternatePaths }) => [id, path, alternatePaths]), [
    [`${repository}:${first}`, first, []],
    [`${repository}:${second}`, second, []],
  ]);
});

test('GitHub equivalents show every link pinned to the scanned commit', async () => {
  const repository = 'JetBrains/equivalent-skills';
  const recording = githubRecording(repository);
  const first = '.agents/skills/alpha/SKILL.md';
  const second = '.claude/skills/renamed/SKILL.md';
  const contents = '---\nname: Same task\ndescription: Check changes.\n---\nReview every changed line.\n';
  recording[`https://api.github.com/repos/${repository}/git/trees/${GITHUB_COMMIT}?recursive=1`] = {
    status: 200,
    body: {
      truncated: false,
      tree: [first, second].map((path) => ({ path, mode: '100644', type: 'blob', sha: path })),
    },
  };
  recording[`https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${first}`] = { status: 200, body: contents };
  recording[`https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${second}`] = { status: 200, body: contents };
  const stdout: string[] = [];
  const stderr: string[] = [];

  const code = await run(['scan', `https://github.com/${repository}`], {
    open: (input) => openGitHub(input, { fetch: replay(recording) }),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });

  assert.equal(code, 0);
  assert.deepEqual(stdout, [
    `${repository} · 1 skill`,
    'Same task — Check changes.',
    `  https://github.com/${repository}/blob/${GITHUB_COMMIT}/${first}`,
    `  also: https://github.com/${repository}/blob/${GITHUB_COMMIT}/${second}`,
  ]);
  assert.deepEqual(stderr, []);
});

test('local scans skip .git and node_modules and do not follow symbolic links', (t) => {
  const root = temporaryRepository(t);
  const targetFile = writeSkill(root, 'vendor/project/.git/target/SKILL.md');
  writeSkill(root, 'vendor/project/node_modules/ignored/SKILL.md');
  writeSkill(root, '.agents/skills/visible/SKILL.md');
  const skillDirectory = join(root, '.agents/skills');
  mkdirSync(skillDirectory, { recursive: true });
  symlinkSync(dirname(targetFile), join(skillDirectory, 'linked-directory'), 'dir');
  const linkedFileDirectory = join(skillDirectory, 'linked-file');
  mkdirSync(linkedFileDirectory, { recursive: true });
  symlinkSync(targetFile, join(linkedFileDirectory, 'SKILL.md'), 'file');

  const url = pathToFileURL(root).href;
  const scanned = scanLocal(root);
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(
    scanned.stdout,
    [
      `${basename(root)} · 1 skill`,
      'visible',
      `  ${url}/.agents/skills/visible/SKILL.md`,
    ].join('\n') + '\n',
  );
  assert.equal(scanned.stderr, '');
});

test('a symlink passed as the local scan root is followed', (t) => {
  const root = temporaryRepository(t);
  writeSkill(root, '.agents/skills/visible/SKILL.md');
  const link = `${root}-link`;
  symlinkSync(root, link, 'dir');
  t.after(() => rmSync(link, { force: true }));

  const scanned = scanLocal(link);
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.match(scanned.stdout, new RegExp(`^${basename(link)} · 1 skill\\nvisible\\n`));
  assert.equal(scanned.stderr, '');
});

test('front matter variants fall back with warnings when they cannot supply metadata', async (t) => {
  const root = temporaryRepository(t);
  writeSkill(root, '.agents/skills/missing/SKILL.md', '# No front matter\n');
  writeSkill(root, '.agents/skills/unclosed/SKILL.md', '---\nname: unclosed\n# no closing delimiter\n');
  writeSkill(root, '.agents/skills/scalar/SKILL.md', '---\n- not a mapping\n---\nbody\n');
  writeSkill(root, '.agents/skills/malformed/SKILL.md', '---\nname: {invalid\n---\nbody\n');
  const aliases = Array.from({ length: 101 }, () => '*a').join(', ');
  writeSkill(root, '.agents/skills/conversion/SKILL.md', `---\na: &a [x]\nb: [${aliases}]\n---\n`);
  writeSkill(root, '.agents/skills/blank/SKILL.md', '---\nname: "  "\ndescription: 7\n---\n');
  writeSkill(root, '.agents/skills/numeric/SKILL.md', '---\nname: 42\ndescription: 7\n---\n');
  writeSkill(root, '.agents/skills/unsupported/SKILL.md', '---\nname: true\ndescription: { unsupported: value }\n---\n');

  const result = await scan(await openDirectory(root));
  assert.deepEqual(result.skills.map(({ name, description }) => [name, description]), [
    ['42', '7'],
    ['blank', '7'],
    ['conversion', ''],
    ['malformed', ''],
    ['missing', ''],
    ['scalar', ''],
    ['unclosed', ''],
    ['unsupported', ''],
  ]);
  assert.deepEqual(result.warnings.map((warning) => warning.split(': ')[0]), [
    '.agents/skills/conversion/SKILL.md',
    '.agents/skills/malformed/SKILL.md',
    '.agents/skills/missing/SKILL.md',
    '.agents/skills/scalar/SKILL.md',
    '.agents/skills/unclosed/SKILL.md',
  ]);
});

test('a truncated GitHub tree falls back to known roots and warns once', async () => {
  const repository = 'JetBrains/truncated';
  const recording = githubRecording(repository);
  recording[`https://api.github.com/repos/${repository}/git/trees/${GITHUB_COMMIT}?recursive=1`] = {
    status: 200,
    body: { truncated: true, tree: [] },
  };
  recording[`https://api.github.com/repos/${repository}/git/trees/${GITHUB_COMMIT}`] = {
    status: 200,
    body: {
      truncated: false,
      tree: ['.agents', '.claude', '.github', 'agent'].map((path) => ({
        path,
        mode: '040000',
        type: 'tree',
        sha: `${path}-root`,
      })),
    },
  };
  for (const root of ['.agents', '.claude', '.github', 'agent']) {
    const rootSha = `${root}-root`;
    const skillsSha = `${root}-skills`;
    recording[`https://api.github.com/repos/${repository}/git/trees/${rootSha}`] = {
      status: 200,
      body: { truncated: false, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: skillsSha }] },
    };
    recording[`https://api.github.com/repos/${repository}/git/trees/${skillsSha}?recursive=1`] = {
      status: 200,
      body: {
        truncated: root === 'agent',
        tree: [{ path: `${root}-skill/SKILL.md`, mode: '100644', type: 'blob', sha: `${root}-file` }],
      },
    };
  }

  const source = await openGitHub(`https://github.com/${repository}`, { fetch: replay(recording) });
  assert.equal(source.pathsComplete, false);
  assert.deepEqual(source.paths, [
    '.agents/skills/.agents-skill/SKILL.md',
    '.claude/skills/.claude-skill/SKILL.md',
    '.github/skills/.github-skill/SKILL.md',
    'agent/skills/agent-skill/SKILL.md',
  ]);
  assert.deepEqual(source.warnings, [
    'the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills (GITHUB_TOKEN searches everywhere)',
  ]);
});

test('GitHub code search caps at 1,000 paths without a warning', async () => {
  const repository = 'JetBrains/search-limit';
  const recording = githubRecording(repository);
  for (let page = 1; page <= 10; page++) {
    recording[`https://api.github.com/search/code?q=filename:SKILL.md+repo:${repository}&per_page=100&page=${page}`] = {
      status: 200,
      body: {
        total_count: 1001,
        items: Array.from({ length: 100 }, (_, index) => ({ path: `.agents/skills/result-${page}-${index}/SKILL.md` })),
      },
    };
  }

  const source = await openGitHub(`https://github.com/${repository}`, { fetch: replay(recording), token: 'test-token' });
  assert.equal(source.paths.length, 1000);
  assert.deepEqual(source.warnings, []);
});

test('GitHub search results use the pinned commit for reads, warning when that path is missing there', async () => {
  const repository = 'JetBrains/search-revision';
  const recording = githubRecording(repository);
  const path = '.agents/skills/from-search/SKILL.md';
  recording[`https://api.github.com/search/code?q=filename:SKILL.md+repo:${repository}&per_page=100&page=1`] = {
    status: 200,
    body: { total_count: 1, items: [{ path }] },
  };
  recording[`https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${path}`] = { status: 404, body: 'Not Found' };

  const source = await openGitHub(`https://github.com/${repository}`, { fetch: replay(recording), token: 'test-token' });
  const result = await scan(source);
  assert.deepEqual(result.skills, []);
  assert.deepEqual(result.warnings, [`${path}: listed, but not found at the scanned commit; skipped`]);
});

test('GitHub 404 reads are skipped but other file-read errors abort the scan', async () => {
  const repository = 'JetBrains/read-errors';
  const path = '.agents/skills/read-error/SKILL.md';
  const listing = {
    truncated: false,
    tree: [{ path, mode: '100644', type: 'blob', sha: 'file-sha' }],
  };
  const missingRecording = githubRecording(repository);
  missingRecording[`https://api.github.com/repos/${repository}/git/trees/${GITHUB_COMMIT}?recursive=1`] = {
    status: 200,
    body: listing,
  };
  missingRecording[`https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${path}`] = { status: 404, body: 'Not Found' };
  const missing = await scan(await openGitHub(`https://github.com/${repository}`, { fetch: replay(missingRecording) }));
  assert.deepEqual(missing.skills, []);
  assert.deepEqual(missing.warnings, [`${path}: listed, but not found at the scanned commit; skipped`]);

  const failedRecording = githubRecording(repository);
  failedRecording[`https://api.github.com/repos/${repository}/git/trees/${GITHUB_COMMIT}?recursive=1`] = {
    status: 200,
    body: listing,
  };
  failedRecording[`https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${path}`] = { status: 500, body: 'Server Error' };
  await assert.rejects(scan(await openGitHub(`https://github.com/${repository}`, { fetch: replay(failedRecording) })), {
    message: `GitHub answered 500 for https://raw.githubusercontent.com/${repository}/${GITHUB_COMMIT}/${path}`,
  });
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

function temporaryRepository(t: { after(callback: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-analysis-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeSkill(root: string, path: string, contents = `---\ndescription: ""\n---\n# ${path}\n`): string {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
  return fullPath;
}

function scanLocal(root: string) {
  return spawnSync(process.execPath, [CLI, 'scan', root], { encoding: 'utf8' });
}

function githubRecording(repository: string): Recording {
  return {
    [`https://api.github.com/repos/${repository}`]: {
      status: 200,
      body: { full_name: repository, default_branch: 'main' },
    },
    [`https://api.github.com/repos/${repository}/commits/main`]: {
      status: 200,
      body: { sha: GITHUB_COMMIT },
    },
  };
}
