// Frames drawn by the canvas (the room only draws while something moves, so rAF timing says nothing): headless Chrome on the real GPU
// (--use-angle=metal; the renderer name is printed at the end, it must not be SwiftShader). A frame is counted from the WebGL draw calls: a
// draw call more than 5 ms after the previous one starts a new frame, and the interval between frame starts is the frame time (the canvas
// is GPU bound, so submit intervals follow the GPU). Gaps over 130 ms are pauses between animations, not frame times.
// Scenarios, each in a fresh page at deviceScaleFactor 2 after load + 9 s of settling:
//   a-hover   the mouse moves across the books, one after another, for 5 s (hover tilts)
//   a-wall    the mouse moves over empty wall for 3 s (frames drawn should be about 0)
//   b-theme   a theme chip on (4 s)       c-category  a category chip on (4 s)
//   d-book    a book pulled out (2.5 s), then put back (2.5 s)
// Usage: npx tsx scripts/fps.ts [baseUrl] [WxH]      (a production build: `npm run build && npx vite preview --port 5181`; main forced to 2 with `?dpr=2`)
// Env: CHROME_BIN = Chrome executable. ONLY=<regex> runs just the matching scenario names; RUNS=<n> repeats (default 2).
//      The canvas width is watched all along: every change (a setDpr call) is logged.
import { chromium, type Page } from 'playwright';

const base = (process.argv[2] ?? 'http://localhost:5181/').replace(/^([^?]*?)\/?(\?.*)?$/, '$1/$2');
const [W, H] = (process.argv[3] ?? '2000x1150').split('x').map(Number) as [number, number];
const runs = Number(process.env.RUNS ?? 2);
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const HOOK = `(() => {
  window.__frames = []; window.__w = []; let last = -1e9;
  const count = () => { const t = performance.now(); if (t - last > 5) window.__frames.push(t); last = t; };
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const orig = C.prototype[fn]; if (!orig) continue;
    C.prototype[fn] = function (...a) { count(); return orig.apply(this, a); };
  }
  const t0 = performance.now(); const seen = new WeakSet();
  new MutationObserver(() => { for (const c of document.querySelectorAll('canvas')) if (!seen.has(c)) { seen.add(c); window.__w.push([Math.round(performance.now() - t0), c.width]);
    new MutationObserver(() => window.__w.push([Math.round(performance.now() - t0), c.width])).observe(c, { attributes: true, attributeFilter: ['width'] }); } }).observe(document, { childList: true, subtree: true });
})()`;

async function sweep(page: Page, ms: number) {
  // Rows of the shelf, left to right then right to left, a pause on each spot so a book tilts, then the next one.
  const t0 = Date.now();
  let row = 0;
  while (Date.now() - t0 < ms) {
    const y = H * (0.14 + 0.15 * (row % 6));
    const dir = row % 2 ? -1 : 1;
    for (let i = 0; i < 8 && Date.now() - t0 < ms; i++) {
      const x = W * (dir > 0 ? 0.42 + 0.06 * i : 0.84 - 0.06 * i);
      await page.mouse.move(x, y, { steps: 4 });
      await page.waitForTimeout(120);
    }
    row++;
  }
}
async function wall(page: Page, ms: number) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    await page.mouse.move(W * 0.3 + 120 * Math.sin(i / 7), H * 0.7 + 150 * Math.cos(i / 9));
    await page.mouse.move(W * 0.395, H * 0.3 + 40 * Math.sin(i / 5));
    i++;
    await page.waitForTimeout(10);
  }
}
async function pullOut(page: Page) {
  const visible = () => page.evaluate(`!!document.querySelector('.book-panel.visible')`) as Promise<boolean>;
  for (const [fx, fy] of [[0.65, 0.52], [0.6, 0.45], [0.7, 0.6], [0.55, 0.55], [0.75, 0.45], [0.5, 0.4]] as [number, number][]) {
    await page.mouse.move(W * fx, H * fy);
    await page.waitForTimeout(300);
    await page.mouse.click(W * fx, H * fy);
    await page.waitForTimeout(1500);
    if (await visible()) return;
  }
  throw new Error('no book could be pulled out');
}

const SCENARIOS: { name: string; act: (page: Page) => Promise<void> }[] = [
  { name: 'a-hover', act: (p) => sweep(p, 5000) },
  { name: 'a-wall', act: (p) => wall(p, 3000) },
  {
    name: 'b-theme',
    act: async (p) => {
      await p.click('.idx >> nth=2');
      await p.mouse.move(5, 5);
      await p.waitForTimeout(4000);
    },
  },
  {
    name: 'c-category',
    act: async (p) => {
      await p.click('.chip >> nth=2');
      await p.mouse.move(5, 5);
      await p.waitForTimeout(4000);
    },
  },
  {
    name: 'd-book',
    act: async (p) => {
      await pullOut(p);
      await p.waitForTimeout(1000);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(2500);
    },
  },
];

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
let gpuName = '?';
for (const sc of SCENARIOS) {
  if (only && !only.test(sc.name)) continue;
  for (let run = 1; run <= runs; run++) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript(HOOK);
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    gpuName = (await page.evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return g && e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '?'; })()`)) as string;
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1500);
    const widths0 = ((await page.evaluate('window.__w')) as number[][]).length;
    await page.evaluate('window.__frames.length = 0');
    await sc.act(page);
    const t = (await page.evaluate('window.__frames')) as number[];
    const gaps: number[] = [];
    for (let i = 1; i < t.length; i++) if (t[i]! - t[i - 1]! < 130) gaps.push(t[i]! - t[i - 1]!);
    gaps.sort((a, b) => a - b);
    const w = (await page.evaluate('window.__w')) as number[][];
    const ratio = (await page.evaluate(`document.querySelector('canvas').width / document.querySelector('canvas').clientWidth`)) as number;
    const med = gaps.length ? gaps[gaps.length >> 1]! : NaN;
    const p95 = gaps.length ? gaps[Math.floor(gaps.length * 0.95)]! : NaN;
    console.log(
      `${sc.name} run${run} | frames drawn ${t.length} (timed ${gaps.length}) | median ${med.toFixed(1)} ms = ${(1000 / med).toFixed(1)} fps | p95 ${p95.toFixed(1)} ms | ratio ${ratio.toFixed(2)} | setDpr calls in the scenario ${w.length - widths0}${w.length > 1 ? ` (width log ${JSON.stringify(w.slice(1).map((x) => x[1]))})` : ''}`,
    );
    await ctx.close();
  }
}
console.log(`GPU: ${gpuName}`);
await browser.close();
