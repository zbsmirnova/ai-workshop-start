// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { scanOrganization } from '../src/core/organization.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

/** What GitHub answers for one repository: its info, commit, code search and SKILL.md files. */
export function repository(fullName: string, commit: string, skills: Record<string, string>): Recording {
  const paths = Object.keys(skills);
  const recording: Recording = {
    [`https://api.github.com/repos/${fullName}`]: { status: 200, body: { full_name: fullName, default_branch: 'main' } },
    [`https://api.github.com/repos/${fullName}/commits/main`]: { status: 200, body: { sha: commit } },
    [`https://api.github.com/search/code?q=filename:SKILL.md+repo:${fullName}&per_page=100&page=1`]: {
      status: 200,
      body: { total_count: paths.length, items: paths.map((path) => ({ path })) },
    },
  };
  for (const [path, contents] of Object.entries(skills)) {
    recording[`https://raw.githubusercontent.com/${fullName}/${commit}/${path}`] = { status: 200, body: contents };
  }
  return recording;
}

/** The Acme organization: a fork and an archived repository to skip, a repository that fails. */
const ACME: Recording = {
  'https://api.github.com/users/Acme/repos?per_page=100&page=1': {
    status: 200,
    body: [
      { full_name: 'Acme/widgets', fork: false, archived: false },
      { full_name: 'Acme/fork-of-widgets', fork: true, archived: false },
      { full_name: 'Acme/ancient', fork: false, archived: true },
      { full_name: 'Acme/tools', fork: false, archived: false },
      { full_name: 'Acme/empty', fork: false, archived: false },
      { full_name: 'Acme/broken', fork: false, archived: false },
    ],
  },
  'https://api.github.com/repos/Acme/broken': { status: 404, body: { message: 'Not Found' } },
  ...repository('Acme/empty', 'empty-commit', {}),
  ...repository('Acme/tools', 'tools-commit', {
    '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: Deploy the service safely. Check twice.\n---\n# Deploy\n',
  }),
  ...repository('Acme/widgets', 'widgets-commit', {
    '.agents/skills/assemble/SKILL.md': '---\nname: assemble\ndescription: Assemble widgets from parts.\n---\n# Assemble\n',
    '.claude/skills/paint/SKILL.md': '---\nname: paint\ndescription: Paint the assembled widget.\n---\n# Paint\n',
  }),
};

/** 25 repositories, so an organization scan needs two web pages; only the last has a skill. */
export const BIG_ORG_SIZE = 25;
const BIG_ORG: Recording = {
  'https://api.github.com/users/BigOrg/repos?per_page=100&page=1': {
    status: 200,
    body: Array.from({ length: BIG_ORG_SIZE }, (_, index) => ({
      full_name: `BigOrg/r${String(index).padStart(2, '0')}`,
      fork: false,
      archived: false,
    })),
  },
};
for (let index = 0; index < BIG_ORG_SIZE; index++) {
  const name = `r${String(index).padStart(2, '0')}`;
  const skills: Record<string, string> = index === BIG_ORG_SIZE - 1
    ? { '.claude/skills/finale/SKILL.md': '---\nname: finale\ndescription: The last repository has the only skill.\n---\n# Finale\n' }
    : {};
  Object.assign(BIG_ORG, repository(`BigOrg/${name}`, `commit-${name}`, skills));
}

const github = replay({ ...EXAMPLE, ...ACME, ...BIG_ORG });

/** What the CLI opens, with GitHub answering from EXAMPLE: with a token, through code search. */
export function open(input: string) {
  return parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input);
}

/** An organization scan with GitHub answering from the recordings above. */
export function scanOrg(input: string, page?: number) {
  return scanOrganization(input, { fetch: github, token: 'test' }, page);
}

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    scanOrganization: (input) => scanOrg(input),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
