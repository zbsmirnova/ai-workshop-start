import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cluster, heuristic } from '../src/core/cluster.ts';
import { run } from '../src/commands.ts';
import { openDirectory } from '../src/local.ts';
import { scan } from '../src/core/scan.ts';
import { createWebServer, listen } from '../src/web.ts';
import { AtlasError } from '../src/core/errors.ts';
const fixture = new URL('../fixture', import.meta.url).pathname;
const answer = readFileSync(new URL('./fixtures/skill-map-answer.json', import.meta.url), 'utf8');
const skills = (await scan(await openDirectory(fixture))).skills;

test('map CLI groups fixture with both methods, preserves links and warnings', async () => {
  for (const model of [false, true]) {
    const output: string[] = [], warnings: string[] = [];
    let calls = 0;
    const code = await run(['map', fixture, ...(model ? ['--model', 'claude'] : [])], {
      open: openDirectory, print: s => output.push(s), error: s => warnings.push(s),
      modelAnswer: async prompt => { calls++; assert.ok(prompt.includes(skills[0].id)); assert.ok(!prompt.includes('# Commits')); return answer; },
    });
    assert.equal(code, 0); assert.equal(calls, Number(model));
    assert.match(output.join('\n'), /3 skills/); assert.match(output.join('\n'), /file:.*SKILL.md/);
    assert.ok(warnings.length); assert.ok(output.some(s => s.includes(model ? 'Development workflow' : 'code-style')));
  }
});

test('shared words are deterministic, case insensitive, ignore stop words, retain singletons', () => {
  const input = [{ id:'b', name:'BUILD code', description:'the' }, { id:'a', name:'build docs', description:'the' }, { id:'c', name:'other', description:'the' }];
  assert.deepEqual(heuristic(input), [{ label:'build', skillIds:['a','b'] }, { label:'other', skillIds:['c'] }]);
  assert.deepEqual(heuristic(input.reverse()), heuristic(input));
});

test('empty scans skip model and CLI succeeds', async t => {
  assert.deepEqual(await cluster([], 'claude', async () => { throw Error('must not call'); }), []);
  const root = mkdtempSync(join(tmpdir(), 'atlas-empty-')); t.after(() => rmSync(root, {recursive:true,force:true}));
  const output: string[] = [];
  assert.equal(await run(['map', root, '--model', 'claude'], {open:openDirectory, print:s=>output.push(s), error:assert.fail}), 0);
  assert.match(output[0], /0 skills · 0 groups/);
});

test('model validates recorded groups, including fenced JSON', async () => {
  assert.deepEqual(await cluster(skills, 'claude', async () => answer), JSON.parse(answer).clusters);
  assert.deepEqual(await cluster(skills, 'claude', async () => '```json\n'+answer+'\n```'), JSON.parse(answer).clusters);
});
for (const [label, response] of Object.entries({ malformed:'oops', null:'null', shape:'{}', omitted:'{"clusters":[]}', empty:'{"clusters":[{"label":"x","skillIds":[]}]}', unknown:'{"clusters":[{"label":"x","skillIds":["invented"]}]}', duplicate:JSON.stringify({clusters:[{label:'x',skillIds:[skills[0].id,skills[0].id]}]}), blank:JSON.stringify({clusters:[{label:' ',skillIds:skills.map(s=>s.id)}]}) })) {
  test(`invalid model answer: ${label}`, async () => assert.rejects(cluster(skills, 'claude', async () => response), AtlasError));
}

test('CLI reports model failures and invalid options', async () => {
  for (const args of [['map'], ['map',fixture,'--model','other'], ['map',fixture,'--model','claude']]) {
    const errors: string[] = [];
    assert.equal(await run(args, {open:openDirectory, print:assert.fail, error:s=>errors.push(s), modelAnswer:async()=>{throw new AtlasError('Claude timed out');}}), 1);
    assert.ok(errors.length);
  }
});

test('map HTTP API validates input, origin, methods and model output', async t => {
  const server = createWebServer({open:openDirectory, modelAnswer:async()=>answer});
  const base = await listen(server,0); t.after(()=>server.close());
  assert.equal((await fetch(base+'/map')).status,200);
  const post = (body: unknown, headers: Record<string,string> = {'Content-Type':'application/json'}) => fetch(base+'/api/map',{method:'POST',headers,body:JSON.stringify(body)});
  assert.deepEqual(await (await post({skills,method:'claude'})).json(), JSON.parse(answer));
  assert.deepEqual(await (await post({skills})).json(), {clusters:heuristic(skills)});
  for (const body of [null, {}, {skills:[{}]}, {skills:[skills[0],skills[0]]}, {skills,method:'unknown'}, {skills:[],method:'unknown'}]) assert.equal((await post(body)).status,400);
  assert.equal((await post({skills}, {'Content-Type':'text/plain'})).status,400);
  assert.equal((await post({skills}, {'Content-Type':'application/json', Origin:'https://example.com'} as Record<string,string>)).status,403);
  assert.equal((await post({skills:[],padding:'x'.repeat(1_000_001)})).status,413);
  assert.equal((await post({skills:skills.slice(0,1),method:'claude'})).status,400);
  assert.equal((await fetch(base+'/api/map')).status,404);
});


test('real CLI transports prompt to claude -p over stdin, and reports process failures', t => {
  const bin = mkdtempSync(join(tmpdir(), 'atlas-claude-')); t.after(() => rmSync(bin, {recursive:true,force:true}));
  writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (JSON.stringify(args) !== JSON.stringify(['-p','--model','haiku','--output-format','text','--tools','','--strict-mcp-config'])) process.exit(2);
if (!readFileSync(0,'utf8').includes('fixture:.claude/skills/commits/SKILL.md')) process.exit(3);
process.stdout.write(process.env.SAVED_ANSWER);
process.exit(Number(process.env.MODEL_EXIT || 0));
`, {mode:0o755});
  for (const code of [0, 7]) {
    const result = spawnSync(process.execPath, ['src/cli.ts','map',fixture,'--model','claude'], {encoding:'utf8', env:{...process.env, PATH:bin+':'+process.env.PATH, SAVED_ANSWER:answer, MODEL_EXIT:String(code)}});
    assert.equal(result.status, code ? 1 : 0);
    assert.match(code ? result.stderr : result.stdout, code ? /claude -p failed/ : /Development workflow/);
  }
});
