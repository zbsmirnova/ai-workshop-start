// An organization scan: list the owner's repositories, scan each one, combine.
// See spec/organization.md.
import { AtlasError } from './errors.ts';
import { client, openGitHub, type GitHubOptions } from './github.ts';
import { scan, type ScanResult } from './scan.ts';

const API = 'https://api.github.com';

/** The web API serves this many repositories per page; the CLI takes them all at once. */
export const PAGE_SIZE = 20;

/** How many repositories are scanned at the same time. */
const CONCURRENCY = 4;

export type OrganizationPage = {
  organization: { name: string; url: string };
  /** The owner's repositories, forks and archived ones skipped. */
  repositoryCount: number;
  /** 1-based; an unpaged scan answers page 1. */
  page: number;
  pageCount: number;
  /** The scanned slice, by repository name, including repositories with zero skills. */
  repositories: ScanResult[];
  /** Listing warnings, and one per repository whose scan failed. */
  warnings: string[];
};

/** `https://github.com/owner`, with or without the scheme, `www.` or a trailing slash. */
export function parseOwnerUrl(input: string): string | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/?$/i.exec(input.trim());
  return match ? match[1] : undefined;
}

/**
 * Scans the owner's repositories: all of them, or, with `page`, one PAGE_SIZE slice.
 * Nothing is stored: a paged call lists the repositories again and scans only its slice.
 */
export async function scanOrganization(input: string, options: GitHubOptions, page?: number): Promise<OrganizationPage> {
  const owner = parseOwnerUrl(input);
  if (!owner) throw new AtlasError(`Not a GitHub owner URL: ${input}`);
  const names = await listRepositories(owner, options);
  const slice = page === undefined ? names : names.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const results: (ScanResult | undefined)[] = new Array<ScanResult | undefined>(slice.length);
  const failures: (string | undefined)[] = new Array<string | undefined>(slice.length);
  let next = 0;
  const worker = async () => {
    while (next < slice.length) {
      const index = next++;
      try {
        results[index] = await scan(await openGitHub(`https://github.com/${slice[index]}`, options));
      } catch (error) {
        if (!(error instanceof AtlasError)) throw error;
        failures[index] = `${slice[index]}: ${error.message}`;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slice.length) }, worker));
  return {
    organization: { name: owner, url: `https://github.com/${owner}` },
    repositoryCount: names.length,
    page: page ?? 1,
    pageCount: Math.ceil(names.length / PAGE_SIZE),
    repositories: results.filter((result) => result !== undefined),
    warnings: failures.filter((warning) => warning !== undefined),
  };
}

/** Every listing page; works for organizations and users. Forks and archived are skipped. */
async function listRepositories(owner: string, options: GitHubOptions): Promise<string[]> {
  const github = client(options);
  const names: string[] = [];
  for (let page = 1; ; page++) {
    const repositories = await github.json<{ full_name: string; fork: boolean; archived: boolean }[]>(
      `${API}/users/${encodeURIComponent(owner)}/repos?per_page=100&page=${page}`,
      `Owner not found: https://github.com/${owner}`,
    );
    for (const repository of repositories) if (!repository.fork && !repository.archived) names.push(repository.full_name);
    if (repositories.length < 100) break;
  }
  return names.sort();
}
