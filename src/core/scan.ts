import { findSkills, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** Whether `paths` is complete enough to verify that a skill has no companion files. */
  pathsComplete?: boolean;
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const files = findSkills(source.paths);
  // All candidate files are read at the same time; equivalent skills are grouped afterward.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  const skills: Skill[] = [];
  const equivalent = new Map<string, Skill>();
  for (const result of results) {
    if ('warning' in result) {
      result.warnings.push(result.warning);
      continue;
    }
    if (result.parsed.warning) result.warnings.push(`${result.path}: ${result.parsed.warning}`);
    const canVerifyDependencies = source.pathsComplete === true
      && !hasCompanionFiles(source.paths, result.path)
      && !hasResourceReferences(result.contents);
    const normalized = normalize(result.contents);
    const duplicate = canVerifyDependencies ? equivalent.get(normalized) : undefined;
    if (duplicate) {
      duplicate.alternatePaths.push(result.path);
      continue;
    }
    const skill: Skill = {
      id: `${source.repository.id}:${result.path}`,
      repository: source.repository.id,
      path: result.path,
      alternatePaths: [],
      name: result.parsed.name ?? result.name,
      description: result.parsed.description,
      commit: source.repository.commit,
      contents: result.contents,
    };
    skills.push(skill);
    if (canVerifyDependencies) equivalent.set(normalized, skill);
  }
  return {
    repository: source.repository,
    skills: sortSkills(skills),
    warnings: [...source.warnings, ...results.flatMap((result) => result.warnings)],
  };
}

type ReadSkillResult =
  | { path: string; warnings: string[]; warning: string }
  | {
    name: string;
    path: string;
    contents: string;
    parsed: ReturnType<typeof parseSkill>;
    warnings: string[];
  };

async function readSkill(source: Source, file: SkillFile): Promise<ReadSkillResult> {
  const bytes = await source.read(file.path);
  if (!bytes) {
    return {
      path: file.path,
      warnings: [],
      warning: `${file.path}: listed, but not found at the scanned commit; skipped`,
    };
  }
  const contents = new TextDecoder().decode(bytes);
  return { name: file.name, path: file.path, contents, parsed: parseSkill(normalize(contents)), warnings: [] };
}

function normalize(contents: string): string {
  return contents.replace(/\r\n?/g, '\n').trim();
}

function hasCompanionFiles(paths: string[], skillPath: string): boolean {
  const directory = skillPath.slice(0, skillPath.lastIndexOf('/') + 1);
  return paths.some((path) => path !== skillPath && path.startsWith(directory));
}

function hasResourceReferences(contents: string): boolean {
  const markdownLink = /\]\(\s*(?!https?:\/\/|mailto:|#)[^)]+\)/i;
  const namedResource = /(?:^|\s)(?:\.{1,2}\/|(?:scripts|references|assets|resources)\/)[\w./-]+/im;
  return markdownLink.test(contents) || namedResource.test(contents);
}
