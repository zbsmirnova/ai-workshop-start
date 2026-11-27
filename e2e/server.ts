// Test-only composition: exercising the real HTTP/model parser without spawning any model.
import { readFileSync } from 'node:fs';
import { createWebServer, listen } from '../src/web.ts';
import { openDirectory } from '../src/local.ts';
const answer = readFileSync(new URL('../tests/fixtures/skill-map-answer.json', import.meta.url), 'utf8');
await listen(createWebServer({ open: openDirectory, modelAnswer: async () => answer }), 4173);
