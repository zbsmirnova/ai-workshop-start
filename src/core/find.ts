/** A candidate skill file and its directory-based fallback name. */
export type SkillFile = { path: string; name: string };

/** Where agents keep a repository's own skills. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/** Finds every skill file directly under an approved root, in preferred-root order. */
export function findSkills(paths: string[]): SkillFile[] {
  const skills: SkillFile[] = [];
  for (const path of paths) {
    const parts = path.split('/');
    if (parts.length !== 4 || parts[3] !== 'SKILL.md') continue;
    const root = parts.slice(0, 2).join('/');
    if (!SKILL_ROOTS.includes(root) || !parts[2]) continue;
    skills.push({ path, name: parts[2] });
  }

  return skills.sort((a, b) => rootOrder(a.path) - rootOrder(b.path) || compare(a.path, b.path));
}

function rootOrder(path: string): number {
  return SKILL_ROOTS.indexOf(path.split('/').slice(0, 2).join('/'));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
