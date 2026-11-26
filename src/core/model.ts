/** A scanned repository. The hierarchy is organization → repository → skill. */
export type Repository = {
  /** `owner/name`, for example `JetBrains/kotlin`; a local directory's name. */
  id: string;
  organization: string;
  name: string;
  /** `https://github.com/<owner>/<repo>`, or a local directory's file:// URL. */
  url: string;
  /** The scanned commit; empty for a local directory. */
  commit: string;
};

/** One skill, identified by its selected SKILL.md path, with verified equivalent copies. */
export type Skill = {
  /** `repo:path`, for example `JetBrains/kotlin:.claude/skills/build-tools/SKILL.md`. */
  id: string;
  repository: string;
  /** The primary path, chosen by approved-root priority. */
  path: string;
  /** Other paths whose normalized instructions and metadata were verified as equivalent. */
  alternatePaths: string[];
  name: string;
  description: string;
  /** The scanned commit, the one the link pins; empty for a local directory. */
  commit: string;
  /** The primary path's SKILL.md, as read. */
  contents: string;
  /** When the skill was last updated, as `YYYY-MM-DD` (UTC); absent when the source cannot tell. */
  updated?: string;
};

/**
 * The SKILL.md file, from where its repository is: on GitHub at the scanned commit,
 * `https://github.com/<owner>/<repo>/blob/<commit>/<path>`; in a local directory, the file itself.
 */
export function skillLink(repository: Repository, skill: Skill): string {
  const path = skill.path.split('/').map(encodeURIComponent).join('/');
  return skill.commit ? `${repository.url}/blob/${skill.commit}/${path}` : `${repository.url}/${path}`;
}

/** By name, then by path: the same order everywhere, whatever the locale. */
export function sortSkills(skills: Skill[]): Skill[] {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...skills].sort((a, b) => compare(a.name, b.name) || compare(a.path, b.path));
}
