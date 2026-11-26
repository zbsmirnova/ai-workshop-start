// The decisions in spec/organization.md: an owner URL scans every repository of an organization
// or user, with GitHub answering from tests/helpers.ts and from local recordings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run } from '../src/commands.ts';
import { PAGE_SIZE, parseOwnerUrl, scanOrganization } from '../src/core/organization.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { atlas, BIG_ORG_SIZE, repository, scanOrg } from './helpers.ts';

test('an owner URL has exactly one path segment', () => {
  for (const input of ['https://github.com/JetBrains', 'github.com/JetBrains/', 'http://www.github.com/JetBrains', ' github.com/JetBrains ']) {
    assert.equal(parseOwnerUrl(input), 'JetBrains', input);
  }
  for (const input of ['https://github.com/JetBrains/kotlin', 'JetBrains', './fixture', 'https://example.com/JetBrains', 'https://github.com/']) {
    assert.equal(parseOwnerUrl(input), undefined, input);
  }
});

test('an owner URL scans every repository: forks and archived skipped, sections by name, failures warned', async () => {
  const result = await atlas(['scan', 'https://github.com/Acme']);
  assert.equal(result.code, 0);
  assert.equal(
    result.stdout,
    [
      'Acme · 4 repositories · 3 skills',
      '',
      'Acme/tools · 1 skill',
      'deploy — Deploy the service safely.',
      '  https://github.com/Acme/tools/blob/tools-commit/.claude/skills/deploy/SKILL.md',
      '',
      'Acme/widgets · 2 skills',
      'assemble — Assemble widgets from parts.',
      '  https://github.com/Acme/widgets/blob/widgets-commit/.agents/skills/assemble/SKILL.md',
      'paint — Paint the assembled widget.',
      '  https://github.com/Acme/widgets/blob/widgets-commit/.claude/skills/paint/SKILL.md',
    ].join('\n'),
  );
  assert.equal(result.stderr, 'warning: Acme/broken: Repository not found: https://github.com/Acme/broken');
});

test('--filter applies across the organization; a repository left with no matches is omitted', async () => {
  const filtered = await atlas(['scan', 'github.com/Acme', '--filter', 'DEPLOY']);
  assert.equal(filtered.code, 0);
  assert.equal(
    filtered.stdout,
    [
      'Acme · 4 repositories · 1 skill',
      '',
      'Acme/tools · 1 skill',
      'deploy — Deploy the service safely.',
      '  https://github.com/Acme/tools/blob/tools-commit/.claude/skills/deploy/SKILL.md',
    ].join('\n'),
  );

  const none = await atlas(['scan', 'github.com/Acme', '--filter', 'no-such-words']);
  assert.equal(none.code, 0);
  assert.equal(none.stdout, 'Acme · 4 repositories · 0 skills');
  assert.equal(none.stderr, 'warning: Acme/broken: Repository not found: https://github.com/Acme/broken');
});

test('an unknown owner → a clear message, and through the CLI exit code 1', async () => {
  const notFound = replay({
    'https://api.github.com/users/Nobody/repos?per_page=100&page=1': { status: 404, body: { message: 'Not Found' } },
  });
  await assert.rejects(scanOrganization('https://github.com/Nobody', { fetch: notFound }), {
    message: 'Owner not found: https://github.com/Nobody',
  });

  const stderr: string[] = [];
  const code = await run(['scan', 'https://github.com/Nobody'], {
    open: () => Promise.reject(new Error('not used')),
    scanOrganization: (input) => scanOrganization(input, { fetch: notFound }),
    print: () => {},
    error: (text) => stderr.push(text),
  });
  assert.equal(code, 1);
  assert.deepEqual(stderr, ['Owner not found: https://github.com/Nobody']);
});

test('a rate limit while listing aborts with the GITHUB_TOKEN message', async () => {
  const limited = replay({
    'https://api.github.com/users/Busy/repos?per_page=100&page=1': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1.' },
    },
  });
  await assert.rejects(scanOrganization('https://github.com/Busy', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

test('an owner with no repositories, or only forks and archived ones → 0 repositories · 0 skills', async () => {
  const recording: Recording = {
    'https://api.github.com/users/Empty/repos?per_page=100&page=1': {
      status: 200,
      body: [
        { full_name: 'Empty/fork', fork: true, archived: false },
        { full_name: 'Empty/old', fork: false, archived: true },
      ],
    },
  };
  const result = await scanOrganization('https://github.com/Empty', { fetch: replay(recording) });
  assert.deepEqual(result, {
    organization: { name: 'Empty', url: 'https://github.com/Empty' },
    repositoryCount: 0,
    page: 1,
    pageCount: 0,
    repositories: [],
    warnings: [],
  });

  const stdout: string[] = [];
  const code = await run(['scan', 'https://github.com/Empty'], {
    open: () => Promise.reject(new Error('not used')),
    scanOrganization: (input) => scanOrganization(input, { fetch: replay(recording) }),
    print: (text) => stdout.push(text),
    error: () => {},
  });
  assert.equal(code, 0);
  assert.deepEqual(stdout, ['Empty · 0 repositories · 0 skills']);
});

test('page 0 answers the listing alone, without scanning any repository', async () => {
  // Only the listing is recorded: a scan attempt would surface as a "not recorded" warning.
  const recording: Recording = {
    'https://api.github.com/users/ListOnly/repos?per_page=100&page=1': {
      status: 200,
      body: [
        { full_name: 'ListOnly/alpha', fork: false, archived: false },
        { full_name: 'ListOnly/beta', fork: false, archived: false },
      ],
    },
  };
  const result = await scanOrganization('https://github.com/ListOnly', { fetch: replay(recording) }, 0);
  assert.deepEqual(result, {
    organization: { name: 'ListOnly', url: 'https://github.com/ListOnly' },
    repositoryCount: 2,
    page: 0,
    pageCount: 1,
    repositories: [],
    warnings: [],
  });
});

test('the repository listing fetches every page', async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({ full_name: `Paged/fork-${index}`, fork: true, archived: false }));
  first[0] = { full_name: 'Paged/alpha', fork: false, archived: false };
  const recording: Recording = {
    'https://api.github.com/users/Paged/repos?per_page=100&page=1': { status: 200, body: first },
    'https://api.github.com/users/Paged/repos?per_page=100&page=2': {
      status: 200,
      body: [{ full_name: 'Paged/beta', fork: false, archived: false }],
    },
    ...repository('Paged/alpha', 'alpha-commit', {}),
    ...repository('Paged/beta', 'beta-commit', {}),
  };
  const result = await scanOrganization('https://github.com/Paged', { fetch: replay(recording), token: 'test' });
  assert.equal(result.repositoryCount, 2);
  assert.deepEqual(result.repositories.map(({ repository }) => repository.id), ['Paged/alpha', 'Paged/beta']);
});

test('a page scans one slice of 20 repositories; without a page, the CLI takes them all at once', async () => {
  assert.equal(PAGE_SIZE, 20);
  const names = Array.from({ length: BIG_ORG_SIZE }, (_, index) => `BigOrg/r${String(index).padStart(2, '0')}`);

  const page1 = await scanOrg('https://github.com/BigOrg', 1);
  assert.equal(page1.repositoryCount, BIG_ORG_SIZE);
  assert.equal(page1.pageCount, 2);
  assert.deepEqual(page1.repositories.map(({ repository }) => repository.id), names.slice(0, 20));

  const page2 = await scanOrg('https://github.com/BigOrg', 2);
  assert.deepEqual(page2.repositories.map(({ repository }) => repository.id), names.slice(20));
  assert.deepEqual(page2.repositories.at(-1)?.skills.map(({ name }) => name), ['finale']);

  const beyond = await scanOrg('https://github.com/BigOrg', 3);
  assert.deepEqual(beyond.repositories, []);
  assert.equal(beyond.repositoryCount, BIG_ORG_SIZE);

  const all = await scanOrg('https://github.com/BigOrg');
  assert.equal(all.repositories.length, BIG_ORG_SIZE);
  assert.equal(all.repositories.flatMap(({ skills }) => skills).length, 1);
});
