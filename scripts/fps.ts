// Frame rate of the home page: rAF frame times while the mouse moves over the shelf (camera parallax renders every frame).
// Headful Chrome (the GPU path matters), `load` + 9 s of settling (the YouTube embed never reaches networkidle).
// Scenarios: dpr 2 and dpr 1 with the mouse over the shelf; at dpr 2 also (b) a theme on, (c) a book pulled out. Each run twice.
// Usage: npx tsx scripts/fps.ts [baseUrl] [WxH]      (use a production build: `npm run build && npx vite preview --port 5181`)
// Env: CHROME_BIN = Chrome executable. SHOTS=<dir> also writes a dpr 2 screenshot of home, theme and pulled-out book as <dir>/<SHOT_PREFIX>-{home,theme,book}.png.
//      HITCH=1 measures the longest frame gaps (ms) when motion starts and settles (2 cycles, dpr 2) and when a book is pulled out (dpr 2 and 1).
//      ONLY=<regex> runs just the matching scenario names; RUNS=<n> repeats (default 2).
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:5181/').replace(/\/?$/, '/');
const [W, H] = (process.argv[3] ?? '2000x1150').split('x').map(Number) as [number, number];
const runs = Number(process.env.RUNS ?? 2);
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const shots = process.env.SHOTS;
const prefix = process.env.SHOT_PREFIX ?? 'shot';

type Scenario = { name: string; dpr: number; setup?: (page: Page) => Promise<void> };

async function wiggle(page: Page, ms: number) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    await page.mouse.move(W * 0.65 + 300 * Math.sin(i / 10), H * 0.52 + 150 * Math.cos(i / 13));
    i++;
    await page.waitForTimeout(8);
  }
}

async function pickTheme(page: Page) {
  await page.click('.idx >> nth=2');
  await page.waitForTimeout(3500);
}

async function pullOut(page: Page) {
  const visible = () => page.evaluate(`!!document.querySelector('.book-panel.visible')`) as Promise<boolean>;
  for (const [fx, fy] of [[0.65, 0.52], [0.6, 0.45], [0.7, 0.6], [0.55, 0.55], [0.75, 0.45], [0.5, 0.4]] as [number, number][]) {
    await page.mouse.move(W * fx, H * fy);
    await page.waitForTimeout(300);
    await page.evaluate('window.__click = performance.now()');
    await page.mouse.click(W * fx, H * fy);
    await page.waitForTimeout(1500);
    if (await visible()) {
      await page.waitForTimeout(2500);
      return;
    }
  }
  throw new Error('no book could be pulled out');
}

const SCENARIOS: Scenario[] = [
  { name: 'a-mouse dpr2', dpr: 2 },
  { name: 'a-mouse dpr1', dpr: 1 },
  { name: 'b-theme dpr2', dpr: 2, setup: pickTheme },
  { name: 'c-book dpr2', dpr: 2, setup: pullOut },
];

const browser = await chromium.launch({ headless: false, executablePath: process.env.CHROME_BIN || undefined, args: ['--ignore-gpu-blocklist'] });
if (shots) await mkdir(shots, { recursive: true });
let gpuName = '?';

/** Longest gaps between animation frames in a window after a marker, as `max (top3)`. */
const LOG = `(() => { window.__t = []; const f = (t) => { window.__t.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); })()`;
async function gapsAfter(page: Page, from: number, to: number) {
  const t = (await page.evaluate('window.__t')) as number[];
  const g: number[] = [];
  for (let i = 1; i < t.length; i++) if (t[i]! >= from && t[i]! <= to) g.push(t[i]! - t[i - 1]!);
  g.sort((a, b) => b - a);
  return `${g[0]?.toFixed(0)} ms (top3 ${g.slice(0, 3).map((x) => x.toFixed(0)).join('/')})`;
}
const now = (page: Page) => page.evaluate('performance.now()') as Promise<number>;
async function hitches() {
  for (const dpr of [2, 1]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    await page.evaluate(LOG);
    for (let cycle = 1; cycle <= 2; cycle++) {
      const t0 = await now(page);
      await wiggle(page, 3000);
      const t1 = await now(page);
      await page.waitForTimeout(2500);
      const t2 = await now(page);
      const ratio = (await page.evaluate(`document.querySelector('canvas').width / document.querySelector('canvas').clientWidth`)) as number;
      console.log(`h-motion dpr${dpr} cycle${cycle} | motion start (first 0.8 s): ${await gapsAfter(page, t0, t0 + 800)} | settle (after the last move, 2.5 s): ${await gapsAfter(page, t1 + 150, t2)} | resting ratio ${ratio.toFixed(2)}`);
    }
    await page.waitForTimeout(1000);
    await pullOut(page).catch(() => undefined);
    const tc = (await page.evaluate('window.__click')) as number;
    console.log(`h-book dpr${dpr} | pull-out (DoF mounts), click to +2.5 s: ${await gapsAfter(page, tc, tc + 2500)}`);
    await ctx.close();
  }
}
if (process.env.HITCH) {
  await hitches();
  await browser.close();
  process.exit(0);
}
for (const sc of SCENARIOS) {
  if (only && !only.test(sc.name)) continue;
  for (let run = 1; run <= runs; run++) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: sc.dpr });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    gpuName = (await page.evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return g && e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '?'; })()`)) as string;
    if (sc.setup) await sc.setup(page);
    if (shots && run === 1 && sc.dpr === 2) {
      await page.mouse.move(W * 0.65, H * 0.52);
      // Wait for the resting picture: the canvas back at its full ratio (reported, with how long that took).
      await page.waitForTimeout(1500);
      const ts = Date.now();
      let r0 = 0;
      while (Date.now() - ts < 6000) {
        await page.waitForTimeout(100);
        r0 = (await page.evaluate(`document.querySelector('canvas').width / document.querySelector('canvas').clientWidth`)) as number;
        if (r0 > 1.99) break;
      }
      const took = Date.now() - ts;
      await page.waitForTimeout(500);
      console.log(`screenshot ${sc.name}: canvas ratio at rest ${r0.toFixed(2)} after ${took} ms`);
      await page.screenshot({ path: `${shots}/${prefix}-${sc.name.startsWith('a') ? 'home' : sc.name.startsWith('b') ? 'theme' : 'book'}.png` });
    }
    await page.evaluate(`(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; if (window.__ft.length < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
    // Warm-up: a resolution governor needs a moment of motion to act (the numbers are for after it has settled).
    await wiggle(page, 3000);
    await page.evaluate(`window.__ft.length = 0`);
    await wiggle(page, 4000);
    const ratio = (await page.evaluate(`document.querySelector('canvas').width / document.querySelector('canvas').clientWidth`)) as number;
    const ft = ((await page.evaluate('window.__ft.slice(5)')) as number[]).sort((a, b) => a - b);
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    console.log(`${sc.name} run${run} | canvas ratio ${ratio.toFixed(2)} | frames ${ft.length} | avg ${(1000 / avg).toFixed(1)} fps | median ${ft[ft.length >> 1]!.toFixed(1)} ms | p95 ${ft[Math.floor(ft.length * 0.95)]!.toFixed(1)} ms`);
    await ctx.close();
  }
}
console.log(`GPU: ${gpuName}`);
await browser.close();
