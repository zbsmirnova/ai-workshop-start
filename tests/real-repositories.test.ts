import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CLI } from './helpers.ts';
import { snapshots } from './fixtures/real-repositories.ts';

const preload = fileURLToPath(new URL('./fixtures/replay-real-repositories.ts', import.meta.url));

function scan(repo: keyof typeof snapshots): string[] {
  const result = spawnSync(process.execPath, ['--import', preload, CLI, 'scan', `https://github.com/${repo}`], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_TOKEN: '' },
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout.trimEnd().split(/\r?\n/);
}

test('Android: the workflow skill under agent/skills has a commit-pinned link', () => {
  const lines = scan('JetBrains/android');
  assert.deepEqual(lines, [
    'JetBrains/android · 1 skill',
    'writing-lint-checks — Helps to write a new lint check under `/tools/base/lint/libs/lint-checks`.',
    '  https://github.com/JetBrains/android/blob/4d9ec3e52b338aa1c962c1ff0421cc62db5c73af/agent/skills/writing-lint-checks/SKILL.md',
  ]);
});

test('MPS: project copies with companions stay separate and the bundled plugin copy is excluded', () => {
  const lines = scan('JetBrains/MPS');
  assert.equal(lines.length, 5);
  assert.equal(lines[0], 'JetBrains/MPS · 2 skills');
  assert.match(lines[1], /^mps-aspect-generator — Use when defining or modifying MPS generators/);
  assert.equal(lines[3], lines[1]);
  assert.equal(lines[2], '  https://github.com/JetBrains/MPS/blob/1cbf7f783dbc5c74c8e5231d31f61b02829143de/.agents/skills/mps-aspect-generator/SKILL.md');
  assert.equal(lines[4], '  https://github.com/JetBrains/MPS/blob/1cbf7f783dbc5c74c8e5231d31f61b02829143de/.claude/skills/mps-aspect-generator/SKILL.md');
});

test('Koog: the project workflow is included and integration-test resources are excluded', () => {
  const lines = scan('JetBrains/koog');
  assert.deepEqual(lines, [
    'JetBrains/koog · 1 skill',
    'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
    '  https://github.com/JetBrains/koog/blob/709079e4a34d6c9234583352550e6a2b88a0bb85/.claude/skills/split-jvm-nonjvm/SKILL.md',
  ]);
});