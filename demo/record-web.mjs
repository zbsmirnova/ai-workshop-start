// Records the browser scenes of the demo video against demo/server.ts (port 4175).
// One webm per scene lands in demo/out/, plus marks.json with beat timestamps for editing.
// Re-run any time the product changes: node demo/record-web.mjs [scene...]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';

const BASE = process.env.DEMO_URL ?? 'http://localhost:4175';
const OUT = new URL('./out/', import.meta.url).pathname;
const REPO = 'https://github.com/anthropics/defending-code-reference-harness';
const OWNER = 'https://github.com/anthropics';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN ?? '/opt/browsers/chrome-linux/chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb', '--disable-lcd-text',
    '--font-render-hinting=none', '--hide-scrollbars', '--force-device-scale-factor=1'],
});

// A visible cursor and a live address bar: page video captures neither browser chrome nor the
// pointer, so both are drawn inside the page (clearly as overlay, not product UI).
const overlay = `
  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.id = '__address';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:30px;z-index:99998;' +
      'display:flex;align-items:center;gap:8px;padding:0 12px;background:#1b1f27;color:#cdd3de;' +
      'font:13px/1 ui-monospace,monospace;border-bottom:1px solid #000;';
    bar.innerHTML = '<span style="display:inline-flex;gap:5px">' +
      '<i style="width:10px;height:10px;border-radius:50%;background:#f66"></i>' +
      '<i style="width:10px;height:10px;border-radius:50%;background:#fc3"></i>' +
      '<i style="width:10px;height:10px;border-radius:50%;background:#4c4"></i></span>' +
      '<span id="__url" style="flex:1;background:#2a2f3a;border-radius:6px;padding:5px 10px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>';
    document.documentElement.appendChild(bar);
    document.body.style.marginTop = '30px';
    const url = () => { bar.querySelector('#__url').textContent = location.href; };
    for (const m of ['pushState', 'replaceState']) {
      const original = history[m].bind(history);
      history[m] = (...a) => { const r = original(...a); url(); return r; };
    }
    addEventListener('popstate', url); setInterval(url, 250); url();

    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;width:18px;height:18px;border-radius:50%;z-index:99999;' +
      'background:#2f6feb55;border:2.5px solid #2f6feb;pointer-events:none;translate:-50% -50%;' +
      'transition:transform .1s;left:640px;top:400px';
    document.body.appendChild(dot);
    addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.65)'; }, true);
    addEventListener('mouseup', () => { dot.style.transform = 'scale(1)'; }, true);
  });
`;

const allMarks = {};

async function scene(name, run) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US',
    timezoneId: 'UTC', colorScheme: 'light',
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  });
  await context.addInitScript(overlay);
  const page = await context.newPage();
  const start = Date.now();
  const marks = [];
  const mark = (label) => marks.push({ label, t: +((Date.now() - start) / 1000).toFixed(2) });
  const pause = (s) => page.waitForTimeout(s * 1000);
  const glide = async (locator) => { // animate the cursor to the target, then click
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await pause(0.35);
    await locator.click();
  };
  const type = async (locator, text, delay = 40) => {
    await glide(locator); await locator.pressSequentially(text, { delay });
  };
  console.log(`scene ${name}…`);
  try {
    await run({ page, mark, pause, glide, type });
  } finally {
    const video = page.video();
    await context.close();
    const path = await video.path();
    renameSync(path, `${OUT}${name}.webm`);
    allMarks[name] = marks;
    writeFileSync(`${OUT}${name}.marks.json`, JSON.stringify(marks, null, 2));
    console.log(`  → demo/out/${name}.webm`, JSON.stringify(marks));
  }
}

const scenes = {
  // Scan one repository, filter live, open a skill, show the address-bar state.
  async web_scan({ page, mark, pause, glide, type }) {
    await page.goto(`${BASE}/`); mark('open'); await pause(1.4);
    await type(page.locator('#repo'), REPO, 22);
    await pause(0.4); await glide(page.locator('#scan')); mark('scan');
    await page.getByText('· 9 skills').waitFor(); mark('scanned'); await pause(2.4);
    await page.mouse.wheel(0, 420); await pause(1.2); await page.mouse.wheel(0, -420); await pause(0.8);
    await type(page.locator('#filter'), 'hunt', 150); mark('filter');
    await pause(2.4);
    await page.locator('#filter').press('ControlOrMeta+a');
    await page.locator('#filter').pressSequentially('threat model', { delay: 110 });
    await pause(2.4);
    await page.locator('#filter').press('ControlOrMeta+a');
    await page.locator('#filter').press('Backspace'); await pause(1.2);
    await glide(page.locator('li.skill').filter({ has: page.locator('.name', { hasText: /^dnr-hunt$/ }) })); mark('details');
    await pause(2.2); await page.mouse.wheel(0, 350); await pause(1.4);
    await page.locator('#filter').fill(''); // keep state honest before the history beat
    await type(page.locator('#filter'), 'respond', 130); mark('url'); await pause(2.0);
    await page.goBack(); mark('back'); await pause(2.0);
    await page.goForward(); mark('forward');
    await page.getByText('of 9 skills').waitFor(); await pause(2.4);
  },
  // Organization scan: instant badge, progress bar, digest, expand, drill into a repository.
  async web_org({ page, mark, pause, glide, type }) {
    await page.goto(`${BASE}/`); await pause(1.2);
    await type(page.locator('#repo'), 'github.com/anthropics', 30);
    await pause(0.3); await glide(page.locator('#scan')); mark('scan');
    await page.locator('#badge').getByText('repositories').waitFor(); mark('badge');
    await pause(2.2); mark('wait-start');
    await page.waitForFunction(() =>
      !document.querySelector('#summary')?.textContent?.includes('scanning'), null, { timeout: 180000 });
    mark('wait-end'); await pause(2.2);
    await glide(page.locator('li.more')); mark('more'); await pause(2.2);
    await glide(page.locator('li.repo').filter({ hasText: 'defending-code-reference-harness' })); mark('repo');
    await pause(2.0);
    await glide(page.locator('li.skill.nested').filter({ has: page.locator('.name', { hasText: /^threat-model$/ }) })); mark('skill');
    await pause(2.6);
  },
  // The skill map: shared-words grouping, then the pre-recorded Claude grouping, then a skill.
  async web_map({ page, mark, pause, glide, type }) {
    await page.goto(`${BASE}/map`); mark('open'); await pause(1.8);
    await type(page.getByLabel('Repository link'), REPO, 20);
    await pause(0.3); await glide(page.getByRole('button', { name: 'Build map' })); mark('build');
    await page.getByRole('status').getByText('shared words').waitFor(); mark('heuristic'); await pause(3.0);
    await glide(page.getByLabel('Grouping method'));
    await page.getByLabel('Grouping method').selectOption('claude'); await pause(0.6);
    await glide(page.getByRole('button', { name: 'Build map' }));
    await page.getByRole('status').getByText('Claude Haiku').waitFor(); mark('claude'); await pause(3.0);
    await glide(page.getByRole('button', { name: 'dnr-hunt', exact: true })); mark('skill');
    await pause(2.2); await page.mouse.wheel(0, 300); await pause(1.6);
  },
};

const picked = process.argv.slice(2);
for (const [name, run] of Object.entries(scenes)) {
  if (picked.length && !picked.includes(name)) continue;
  await scene(name, run);
}
await browser.close();
writeFileSync(`${OUT}marks.json`, JSON.stringify(allMarks, null, 2));
console.log('marks → demo/out/marks.json');
