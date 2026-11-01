// Home page on phones: full-page screenshots at 375, 390, 430 and 768, and measurements of the stage 4B items (needs `npx vite --port 5181` running):
//  - where the bookcase is on screen (its front face projected to the canvas: the margins left and right, above and below, px),
//  - the order of the blocks down the page, the theme index rows (count per row, height, text lines), the "also" rows,
//  - the timeline (shown or not), the category nav's fade (the state at the start, in the middle and at the end of its scroll).
// Usage: npx tsx scripts/home-shots.ts <out dir> [baseUrl]   Env: CHROME_BIN, NAVSHOT=1 also writes the viewport-only shot of the nav row at 390.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const dir = process.argv[2] ?? '/tmp/home-shots';
const base = process.argv[3] ?? 'http://localhost:5181';
const SIZES: [number, number, number][] = [
  [375, 812, 3],
  [390, 844, 3],
  [430, 932, 3],
  [768, 1024, 2],
];
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const result: Record<string, unknown> = {};

const MEASURE = `(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top + scrollY, bottom: b.bottom + scrollY, w: b.width, h: b.height }; };
  const q = (s) => document.querySelector(s);
  const vw = document.documentElement.clientWidth;
  const out = { vw };
  // The case's front face on screen, relative to the canvas.
  const cv = q('canvas').getBoundingClientRect();
  const c = window.__case;
  const pts = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => window.__project(x, y, c.depth));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  out.canvas = { w: cv.width, h: cv.height };
  out.caseMargins = { left: Math.min(...xs), right: cv.width - Math.max(...xs), top: Math.min(...ys), bottom: cv.height - Math.max(...ys) };
  // Order down the page.
  const names = { '.wall-head': 'title', '.search-wrap': 'search', '.frame': 'video', '.timeline': 'timeline', '.chips': 'nav', '[data-stage]': 'shelf', '.plaque': 'themes', '.view-toggle': 'toggle', '.credit': 'footer' };
  out.order = Object.entries(names).map(([s, n]) => { const e = q(s); if (!e) return null; const b = r(e); return { n, top: Math.round(b.top), bottom: Math.round(b.bottom), shown: b.h > 0 }; }).filter(Boolean).sort((a, b) => a.top - b.top);
  const idx = Array.from(document.querySelectorAll('.idx'));
  out.index = { n: idx.length, rows: new Set(idx.map((e) => Math.round(e.getBoundingClientRect().top))).size, minH: Math.min(...idx.map((e) => e.getBoundingClientRect().height)), maxH: Math.max(...idx.map((e) => e.getBoundingClientRect().height)),
    wrapped: idx.filter((e) => e.querySelector('.t').getBoundingClientRect().height > 1.6 * parseFloat(getComputedStyle(e.querySelector('.t')).lineHeight)).map((e) => e.textContent), clipped: idx.filter((e) => { const t = e.querySelector('.t'); return t.scrollWidth > t.clientWidth + 1; }).length };
  const also = Array.from(document.querySelectorAll('.also button'));
  out.also = { n: also.length, rows: new Set(also.map((e) => Math.round(e.getBoundingClientRect().top))).size, minH: Math.min(...also.map((e) => e.getBoundingClientRect().height)) };
  const nav = q('.chips');
  out.nav = { scrollW: nav.scrollWidth, clientW: nav.clientWidth, mask: getComputedStyle(nav).maskImage || getComputedStyle(nav).webkitMaskImage, cls: nav.className };
  out.docH = document.documentElement.scrollHeight;
  return out;
})()`;

for (const [w, h, dsf] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(3500);
  result[w] = await page.evaluate(MEASURE);
  await page.screenshot({ path: `${dir}/home-${w}.png`, fullPage: true });
  if (w === 390 && process.env.NAVSHOT) {
    const nav = (state: string) => `(() => { const n = document.querySelector('.chips'); ${state}; })()`;
    const states: Record<string, string> = {};
    await page.evaluate(`document.querySelector('.chips').scrollIntoView({ block: 'center' })`);
    await page.waitForTimeout(400);
    const fades = async (k: string) => {
      await page.waitForTimeout(300);
      states[k] = (await page.evaluate(`(() => { const n = document.querySelector('.chips'); return n.className + ' | scrollLeft ' + Math.round(n.scrollLeft) + ' | ' + (getComputedStyle(n).maskImage || getComputedStyle(n).webkitMaskImage); })()`)) as string;
    };
    await fades('start');
    await page.screenshot({ path: `${dir}/nav-fade-390.png`, fullPage: false });
    await page.evaluate(nav('n.scrollLeft = (n.scrollWidth - n.clientWidth) / 2'));
    await fades('middle');
    await page.screenshot({ path: `${dir}/nav-fade-390-middle.png`, fullPage: false, clip: { x: 0, y: 0, width: 390, height: 844 } });
    await page.evaluate(nav('n.scrollLeft = n.scrollWidth'));
    await fades('end');
    await page.screenshot({ path: `${dir}/nav-fade-390-end.png`, fullPage: false });
    result.navStates = states;
  }
  await ctx.close();
}
await browser.close();
await writeFile(`${dir}/measure.json`, JSON.stringify(result, null, 1));
for (const [w] of SIZES) {
  const m = result[w] as { caseMargins: Record<string, number>; index: unknown; also: unknown; order: { n: string; top: number; shown: boolean }[]; docH: number };
  console.log(w, 'margins', JSON.stringify(Object.fromEntries(Object.entries(m.caseMargins).map(([k, v]) => [k, Math.round(v * 10) / 10]))), 'order', m.order.filter((o) => o.shown).map((o) => `${o.n}@${o.top}`).join(' '), 'docH', m.docH);
  console.log('   index', JSON.stringify(m.index), 'also', JSON.stringify(m.also));
}
