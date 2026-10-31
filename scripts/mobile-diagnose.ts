// Phase 1 of the mobile work: measures the home page and four cards at phone and tablet widths and keeps screenshots.
// Usage: npx tsx scripts/mobile-diagnose.ts <outDir> [baseUrl]   (needs `npx vite --port 5181` running)
// Writes <outDir>/<screen>-<width>.png (full page where it scrolls) and <outDir>/measure.json. Env: CHROME_BIN; WIDTHS=375,390 and SCREENS=home,escalation limit the run.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { MEASURE, type Measure } from './mobile-measure.ts';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:5181';
if (!outDir) throw new Error('usage: mobile-diagnose.ts <outDir> [baseUrl]');
await mkdir(outDir, { recursive: true });

const SIZES: [number, number, number][] = [
  [375, 812, 3],
  [390, 844, 3],
  [430, 932, 3],
  [768, 1024, 2],
];
const SCREENS = [
  { id: 'home', hash: '', tab: null as string | null },
  { id: 'socrates-method', hash: '#book/900000017/socratic-method', tab: 'method' },
  { id: 'commander-story', hash: '#book/900000043/commander-intent', tab: 'story' },
  { id: 'escalation', hash: '#book/900000028/escalation', tab: null },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results: Record<string, Measure & Record<string, unknown>> = {};

/** The card's own facts: tabs, the agent box, the pager, the concept nav, the book on screen. */
async function cardInfo(page: Page) {
  return page.evaluate(`(async () => {
    const q = (s) => document.querySelector(s);
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const tabs = Array.from(document.querySelectorAll('.c-tabs [role="tab"]'));
    const list = q('.c-tabs [role="tablist"]');
    const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
    const panel = q('.book-panel');
    const apply = q('.b-apply');
    const band = q('.band');
    let book = null;
    try {
      const { focusFx } = await import('/src/scene/FocusBook.tsx');
      const lib = await (await fetch('/data/books.json')).json();
      const id = location.hash.split('/')[1];
      const b = lib.books.find((x) => x.id === id);
      const p = focusFx.position;
      const c = window.__project(p.x, p.y, p.z);
      const top = window.__project(p.x, p.y + b.dims.h / 2, p.z);
      const side = window.__project(p.x + b.dims.w / 2, p.y, p.z);
      book = { centre: [Math.round(c.x), Math.round(c.y)], approxW: Math.round(Math.abs(side.x - c.x) * 2), approxH: Math.round(Math.abs(c.y - top.y) * 2), amount: focusFx.amount };
    } catch (e) { book = { error: String(e) }; }
    return {
      panel: r(panel), panelOpaque: getComputedStyle(panel).backgroundColor, panelZ: getComputedStyle(panel).zIndex,
      tabs: { n: tabs.length, rows: tops.size, tablist: r(list), items: tabs.map((t) => r(t)), listScrollW: list ? list.scrollWidth : 0, listClientW: list ? list.clientWidth : 0, row: r(q('.c-tabs')) },
      apply: apply ? { box: r(apply), scrollH: apply.scrollHeight, clientH: apply.clientHeight, font: getComputedStyle(apply.querySelector('p')).fontSize } : null,
      band: r(band), idea: r(q('.b-idea')),
      pager: !!q('.c-pager'), pagesAttr: q('.card') ? q('.card').dataset.pages || null : null,
      cnav: r(q('.cnav')), close: r(q('.page-close')), pin: r(q('.pin')), head: r(q('.c-head')), name: r(q('.c-name')), sum: r(q('.c-sum')), chips: r(q('.c-chips')), thumb: r(q('.c-thumb')),
      thumbDisplay: q('.c-thumb') ? getComputedStyle(q('.c-thumb')).display : null,
      book,
    };
  })()`);
}

const onlyW = process.env.WIDTHS ? new Set(process.env.WIDTHS.split(',').map(Number)) : null;
const onlyS = process.env.SCREENS ? new Set(process.env.SCREENS.split(',')) : null;
for (const [w, h, dsf] of SIZES) {
  if (onlyW && !onlyW.has(w)) continue;
  for (const s of SCREENS) {
    if (onlyS && !onlyS.has(s.id)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/${s.hash}`, { waitUntil: 'load' });
    await page.waitForSelector('.app.ready', { timeout: 60000 });
    const mode = s.id === 'home' ? 'home' : 'card';
    if (mode === 'card') {
      await page.waitForSelector('.book-panel.visible .card[data-tab]', { timeout: 30000 });
      await page.waitForTimeout(3500);
      if (s.tab) {
        await page.click(`.c-tabs [role="tab"][data-tab="${s.tab}"]`);
        await page.waitForTimeout(500);
      }
    } else {
      await page.waitForTimeout(3000);
    }
    await page.evaluate(`(() => { const c = document.querySelector('canvas'); const st = c && c.parentElement && c.parentElement.parentElement; if (st && !document.querySelector('[data-stage]')) st.setAttribute('data-stage', ''); })()`);
    const m = (await page.evaluate(`${MEASURE}(${JSON.stringify(mode)})`)) as Measure & Record<string, unknown>;
    if (mode === 'card') m.card = await cardInfo(page);
    m.errors = errors.slice(0, 3);
    results[`${s.id}@${w}`] = m;
    // Screenshot: the whole page where it scrolls (for a card the panel scrolls: the window is made as tall as its content).
    if (mode === 'card') {
      const total = Math.min(m.scrollerScrollH, 9000);
      await page.setViewportSize({ width: w, height: Math.max(h, total) });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${outDir}/${s.id}-${w}.png` });
    } else {
      await page.screenshot({ path: `${outDir}/${s.id}-${w}.png`, fullPage: true });
    }
    console.log(`${s.id}@${w}: overflow ${m.docScrollW - m.vw}/${m.scrollerScrollW - m.scrollerClientW}, offenders ${m.offenders.length}, clipped ${m.clipped.length}, cut ${m.cut.length}, overlaps ${m.overlaps.length}, small ${m.small.length}, targets<44 ${m.targets.length}/${m.targetCount}`);
    await ctx.close();
  }
}
await browser.close();
await writeFile(`${outDir}/measure.json`, JSON.stringify(results, null, 1));
