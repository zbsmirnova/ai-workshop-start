// Demo-only composition for the video: the real server (GitHub, organizations, local
// directories) with one swap — the Claude runner is replaced by a pre-recorded Claude answer
// (demo/map-answer.json), because the recording sandbox has no authenticated Claude CLI.
// Port 4175: the development server (4173) and the e2e server (4174) can keep running.
import { readFileSync } from 'node:fs';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { scanOrganization } from '../src/core/organization.ts';
import { openDirectory } from '../src/local.ts';
import { createWebServer, listen } from '../src/web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const answer = readFileSync(new URL('./map-answer.json', import.meta.url), 'utf8');
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input));

const url = await listen(createWebServer({
  open,
  modelAnswer: async () => answer,
  scanOrganization: (input, page) => scanOrganization(input, { fetch, token }, page),
}), Number(process.env.DEMO_PORT ?? 4175));
console.log(`demo server at ${url}`);
