// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { parseOwnerUrl, type OrganizationPage } from './core/organization.ts';
import { scan, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  /** Scans every repository of a GitHub owner at once; see spec/organization.md. */
  scanOrganization?(input: string): Promise<OrganizationPage>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Starts the local web view on the port; resolves with its address once it listens. */
  serve?(port: number): Promise<string>;
};

const DEFAULT_PORT = 4173;

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory> [--filter <words>]   find project skills in a repository, or every repository of an owner, and print them
  serve [--port <port>]           the same, in a local web view (port ${DEFAULT_PORT} by default)
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  const usage = 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <words>]';
  const [input, ...rest] = args;
  if (!input || input.startsWith('--')) throw new AtlasError(usage);
  let filter = '';
  if (rest.length) {
    const inline = /^--filter(?:=(.*))?$/.exec(rest[0]);
    if (!inline) throw new AtlasError(usage);
    filter = [inline[1] ?? '', ...rest.slice(1)].join(' ');
  }
  if (parseOwnerUrl(input) && context.scanOrganization) {
    printOrganization(await context.scanOrganization(input), filter, context);
    return;
  }
  const result = await scan(await context.open(input));
  const skills = result.skills.filter((skill) => matchesFilter(skill, filter));
  printRepository(result.repository, skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

/** The combined header, then one section per repository with a matching skill. */
function printOrganization(result: OrganizationPage, filter: string, context: Context) {
  const sections = result.repositories.map((section) => ({
    ...section,
    skills: section.skills.filter((skill) => matchesFilter(skill, filter)),
  }));
  const total = sections.reduce((sum, section) => sum + section.skills.length, 0);
  context.print(`${result.organization.name} · ${count(result.repositoryCount, 'repository', 'repositories')} · ${count(total, 'skill')}`);
  for (const section of sections) {
    if (!section.skills.length) continue;
    context.print('');
    printRepository(section.repository, section.skills, context);
  }
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
  for (const section of result.repositories) {
    for (const warning of section.warnings) context.error(`warning: ${section.repository.id}: ${warning}`);
  }
}

/**
 * The filter of spec/cli.md: every whitespace-separated word must appear in the skill's name or
 * description, as a case-insensitive substring. A blank filter keeps every skill.
 */
function matchesFilter(skill: Pick<Skill, 'name' | 'description'>, filter: string): boolean {
  const name = skill.name.toLowerCase();
  const description = skill.description.toLowerCase();
  return filter.toLowerCase().split(/\s+/).filter(Boolean)
    .every((word) => name.includes(word) || description.includes(word));
}

async function serveCommand(args: string[], context: Context) {
  const usage = 'Usage: skill-atlas serve [--port <port>]';
  if (!context.serve) throw new AtlasError('serve is not available here');
  let port = DEFAULT_PORT;
  if (args.length) {
    const value = args.length === 2 && args[0] === '--port' ? args[1]
      : args.length === 1 ? /^--port=(.*)$/.exec(args[0])?.[1]
      : undefined;
    if (value === undefined) throw new AtlasError(usage);
    if (!/^\d+$/.test(value) || Number(value) > 65535) throw new AtlasError(`Not a port: ${value}\n\n${usage}`);
    port = Number(value);
  }
  context.print(`Skill Atlas at ${await context.serve(port)}`);
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence and links. */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${count(skills.length, 'skill')}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    for (const path of skill.alternatePaths) print(`  also: ${skillLink(repository, { ...skill, path })}`);
  }
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
