#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr, or the local web view. Nothing is stored.
import { claudeAnswer } from './claude.ts';
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { scanOrganization } from './core/organization.ts';
import { openDirectory } from './local.ts';
import { createWebServer, listen } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input));

process.exitCode = await run(process.argv.slice(2), {
  open,
  modelAnswer: claudeAnswer,
  scanOrganization: (input) => scanOrganization(input, { fetch, token }),
  serve: (port) => listen(createWebServer({
    open,
    modelAnswer: claudeAnswer,
    scanOrganization: (input, page) => scanOrganization(input, { fetch, token }, page),
  }), port),
  print: (text) => console.log(text),
  error: (text) => console.error(text),
});
