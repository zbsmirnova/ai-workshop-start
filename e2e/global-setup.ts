import { cpSync, rmSync, readdirSync, utimesSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FIXTURE, MAP_FIXTURE } from './helpers';

// Stage the fixture at a fixed absolute path with fixed mtimes: the page shows file:// links (and
// may show dates), so the scanned path and timestamps must be identical locally and on CI for the
// screenshots to match.
export default function globalSetup() {
  const stamp = new Date('2026-01-01T00:00:00Z');
  rmSync(FIXTURE, { recursive: true, force: true });
  cpSync(path.join(import.meta.dirname, '..', 'fixture'), FIXTURE, { recursive: true });
  const touch = (p: string) => {
    utimesSync(p, stamp, stamp);
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) touch(path.join(p, f));
  };
  touch(FIXTURE);
  rmSync(MAP_FIXTURE, { recursive: true, force: true });
  cpSync(FIXTURE, MAP_FIXTURE, { recursive: true });
  // The original fixture has no exact shared topic word; keep other visual baselines intact.
  for (const relative of ['.github/skills/code-style/SKILL.md', '.claude/skills/commits/SKILL.md']) {
    const file = path.join(MAP_FIXTURE, relative);
    writeFileSync(file, readFileSync(file, 'utf8').replace('description: ', 'description: git workflow. '));
  }
  touch(MAP_FIXTURE);
}
