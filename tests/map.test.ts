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
  const input = [{ id:'b', name:'BUILD code', description:'the' }, { id:'a', name:'build docs', description:'the' }, { id:'c', name:'other', description:'the' }, { id:'d', name:'solo', description:'' }];
  assert.deepEqual(heuristic(input), [{ label:'build', skillIds:['a','b'] }, { label:'other', skillIds:['c'] }, { label:'solo', skillIds:['d'] }]);
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
  assert.equal((await post({skills:skills.slice(0,1),method:'claude'})).status,502);
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

test('Use when boilerplate leaves meaningful shared-word groups', () => {
  const input = [
    {id:'1', name:'pdf', description:'Use when the user wants to read PDF forms.'},
    {id:'2', name:'forms', description:'Use when you need to fill PDF forms.'},
    {id:'3', name:'commits', description:'Use when writing git commit messages.'},
    {id:'4', name:'history', description:'Use when you need to inspect git history.'},
  ];
  assert.deepEqual(heuristic(input), [{label:'forms',skillIds:['1','2']},{label:'git',skillIds:['3','4']}]);
});

test('model extra fields do not leak into cluster output', async () => {
  assert.deepEqual(await cluster(skills, 'claude', async () => JSON.stringify({clusters:[{label:'all',skillIds:skills.map(s=>s.id),extra:'ignored'}]})), [{label:'all',skillIds:skills.map(s=>s.id)}]);
});

test('HTTP skill limit has a specific message and accepts exactly 2000', async t => {
  const server = createWebServer({open:openDirectory});
  const base = await listen(server,0); t.after(()=>server.close());
  for (const count of [2000,2001]) {
    const response = await fetch(base+'/api/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skills:Array.from({length:count},(_,i)=>({id:String(i),name:'build',description:''}))})});
    assert.equal(response.status,count===2000?200:400);
    if(count===2001) assert.match((await response.json()).error,/at most 2,000/);
  }
});

test('Claude process isolation, missing binary, output limit and real SIGKILL timeout', {timeout:10000}, async t => {
  const { spawn } = await import('node:child_process');
  const bin = mkdtempSync(join(tmpdir(), 'atlas-process-')); t.after(()=>rmSync(bin,{recursive:true,force:true}));
  const binary = join(bin,'claude');
  writeFileSync(binary, `#!${process.execPath}
import {readFileSync} from 'node:fs';
readFileSync(0,'utf8');
if (!process.cwd().includes('atlas-model-')) process.exit(9);
if (process.env.SCENARIO === 'large') process.stdout.write('x'.repeat(1_000_001));
else setInterval(()=>{},1000);
`, {mode:0o755});
  async function check(scenario:string, pattern:RegExp) {
    const child = spawn(process.execPath,['--input-type=module','-e', `import {runClaude} from './src/claude.ts'; try { await runClaude('test', 1000); } catch(e) { console.error(e.message); process.exitCode = 1; }`],{env:{...process.env,PATH:scenario==='missing'?join(bin,'missing'):bin,SCENARIO:scenario}});
    t.after(()=>{if(child.exitCode===null) child.kill('SIGKILL');});
    let error=''; child.stderr.on('data',s=>error+=s); child.stdout.resume();
    const code = await new Promise(resolve=>child.on('close',resolve));
    assert.equal(code,1); assert.match(error,pattern);
  }
  await Promise.all([check('missing',/Cannot run claude.*ENOENT/),check('large',/response is too large/),check('timeout',/timed out after 1 seconds/)]);
});

test('map CLI includes skills from the final owner page', async () => {
  const {scanOrg} = await import('./helpers.ts');
  const output:string[]=[];
  assert.equal(await run(['map','https://github.com/BigOrg'],{open:openDirectory,scanOrganization:scanOrg,print:s=>output.push(s),error:assert.fail}),0);
  assert.match(output.join('\n'),/finale/);
  assert.match(output.join('\n'),/BigOrg\/r24\/blob\/commit-r24/);
});

for (const boilerplate of ['This skill should be used when Claude needs to handle', 'Helps you work with code:']) {
  test(`HTTP shared words discard corpus boilerplate: ${boilerplate}`, async t => {
    const server = createWebServer({open:openDirectory});
    const base = await listen(server,0); t.after(()=>server.close());
    const input = ['pdf read', 'pdf write', 'git commit', 'git history', 'ui design', 'ui test']
      .map((description,i)=>({id:String(i),name:String(i),description:boilerplate+' '+description}));
    const response = await fetch(base+'/api/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skills:input})});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).clusters,[{label:'git',skillIds:['2','3']},{label:'pdf',skillIds:['0','1']},{label:'ui',skillIds:['4','5']}]);
  });
}

test('document-frequency cutoff preserves pairs and excludes majority terms', () => {
  const pair = [{id:'a',name:'ci',description:''},{id:'b',name:'ci',description:''}];
  assert.deepEqual(heuristic(pair), [{label:'ci',skillIds:['a','b']}]);
  assert.deepEqual(heuristic([...pair,{id:'c',name:'qa',description:''}]), [
    {label:'ci',skillIds:['a']},{label:'ci',skillIds:['b']},{label:'qa',skillIds:['c']},
  ]);
});

test('large pair corpus groups within a practical server budget', () => {
  const input = Array.from({length:2000},(_,i)=>({id:String(i).padStart(4,'0'), name:'',
    description:Array.from({length:150},(_,j)=>`topic${Math.floor(i/2)}word${j}`).join(' ')}));
  const start = performance.now();
  const result = heuristic(input);
  assert.equal(result.length,1000);
  assert.ok(result.every(group=>group.skillIds.length===2));
  assert.ok(performance.now()-start < 5000, 'pair grouping should finish within five seconds');
});

test('HTTP reports model process and availability failures as server errors', async t => {
  const {ModelUnavailableError} = await import('../src/core/errors.ts');
  for (const [failure,status] of [[new AtlasError('Claude timed out'),502], [new AtlasError('authentication failed'),502], [new ModelUnavailableError('Cannot run claude'),503], [undefined,503]] as const) {
    const server = createWebServer({open:openDirectory, modelAnswer:failure ? async()=>{throw failure;} : undefined});
    const base = await listen(server,0); t.after(()=>server.close());
    const response = await fetch(base+'/api/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skills,method:'claude'})});
    assert.equal(response.status,status);
    assert.ok((await response.json()).error);
  }
});

test('HTTP grouping updates overlapping words without recalculating the corpus cutoff', async t => {
  const server = createWebServer({open:openDirectory});
  const base = await listen(server,0); t.after(()=>server.close());
  const input = ['alpha beta','alpha beta','alpha','beta','gamma','gamma']
    .map((description,i)=>({id:String(i),name:'',description}));
  const response = await fetch(base+'/api/map',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skills:input})});
  assert.deepEqual((await response.json()).clusters,[{label:'alpha',skillIds:['0','1','2']},{label:'gamma',skillIds:['4','5']},{label:'',skillIds:['3']}]);
});
