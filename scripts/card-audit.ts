// Opens every concept card at each viewport and checks the fixed template: the page does not scroll, every tab's content is inside
// its region (on every page of a paged tab), the band's text fits. Lists the cards with `data-band-overflow` and the tabs that
// needed pages. Writes /tmp/card-audit.json and prints a summary. No screenshots.
// Usage: npx tsx scripts/card-audit.ts [baseUrl] [WxH,WxH,...]   (needs `npx vite --port 5181` running)
// Env: CHROME_BIN = a Chromium executable to use instead of Playwright's own; OUT = the JSON file;
// ONLY = comma-separated concept ids to audit (default all); QUICK=1 reads the band only (no tabs).
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import type { Agentic } from '../src/types.ts';

const base = process.argv[2] ?? 'http://localhost:5181';
const sizes = (process.argv[3] ?? '1440x900,1280x800').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const out = process.env.OUT ?? '/tmp/card-audit.json';
const quick = process.env.QUICK === '1';
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const data = JSON.parse(await readFile('public/data/agentic.json', 'utf8')) as Agentic;

interface TabRow {
  tab: string;
  pages: number;
  failures: string[];
}
interface Row {
  id: string;
  name: string;
  bandOverflow: string;
  /** Height the band's two texts need, px, and the card's height. */
  need?: { idea: number; apply: number; page: number };
  tabs: TabRow[];
  failures: string[];
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

/** What the page says about the card on screen. Runs in the page. */
const READ = `(() => {
  const q = (s) => document.querySelector(s);
  const doc = document.documentElement;
  const card = q('.card');
  const tb = q('.c-panel .tb');
  const tbr = tb ? tb.getBoundingClientRect() : null;
  const bottom = (s) => { const e = q(s); return e ? e.getBoundingClientRect().bottom : 0; };
  const mc = q('.c-panel .tb > .mc:not(.tb-measure)');
  const band = q('.band');
  const panel = q('.book-panel');
  return {
    name: (q('.c-name') || {}).textContent,
    tab: card && card.dataset.tab,
    pages: card && card.dataset.pages ? Number(card.dataset.pages) : 1,
    bandOverflow: card ? card.dataset.bandOverflow || '' : '',
    docScroll: Math.max(doc.scrollHeight - innerHeight, doc.scrollWidth - innerWidth, 0),
    panelOver: panel ? panel.scrollHeight - panel.clientHeight : 0,
    region: tbr ? Math.round(tbr.height) : 0,
    below: tbr ? Math.round(Math.max(0, bottom('.m-cols') - tbr.bottom, bottom('.q-cols') - tbr.bottom, ...Array.from(document.querySelectorAll('.q-col, .m-col')).map((c) => (c.lastElementChild ? c.lastElementChild.getBoundingClientRect().bottom : 0) - tbr.bottom))) : 0,
    flowOver: mc ? [mc.scrollHeight - mc.clientHeight, card.dataset.pages ? 0 : mc.scrollWidth - mc.clientWidth] : [0, 0],
    band: band ? Math.round(band.getBoundingClientRect().height) : 0,
    need: { idea: q('.b-idea p') ? Math.round(q('.b-idea p').getBoundingClientRect().bottom - q('.b-idea').getBoundingClientRect().top) : 0, apply: q('.b-apply p') ? Math.round(q('.b-apply p').getBoundingClientRect().bottom - q('.b-apply').getBoundingClientRect().top + 16) : 0, page: card ? Math.round(card.getBoundingClientRect().height) : 0 },
    tabs: Array.from(document.querySelectorAll('.c-tabs [role=tab]')).map((t) => t.dataset.tab),
    chips: Array.from(document.querySelectorAll('.c-chips .t')).every((t) => t.scrollWidth <= t.clientWidth + 1),
  };
})()`;

async function settle(page: Page) {
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await page.waitForTimeout(110);
}

const result: { viewport: string; cards: Row[] }[] = [];
for (const [w, h] of sizes) {
  const vp = `${w}x${h}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const rows: Row[] = [];
  for (const c of data.concepts.filter((x) => !only || only.has(x.id))) {
    const failures: string[] = [];
    try {
      await page.evaluate(`window.location.hash = ${JSON.stringify(`#book/${c.bookIds[0]}/${c.id}`)}`);
      await page.waitForFunction(`(() => { const e = document.querySelector('.book-panel.visible .c-name'); return !!e && e.textContent === ${JSON.stringify(c.name)} && !!document.querySelector('.card[data-tab]'); })()`, undefined, { timeout: 20000 });
    } catch (e) {
      rows.push({ id: c.id, name: c.name, bandOverflow: '', tabs: [], failures: [`did not open: ${String(e).slice(0, 80)}`] });
      continue;
    }
    await settle(page);
    const first = (await page.evaluate(READ)) as any;
    const tabs: TabRow[] = [];
    for (const t of quick ? [] : (first.tabs as string[])) {
      const f: string[] = [];
      await page.click(`.c-tabs [role=tab][data-tab="${t}"]`);
      await settle(page);
      let r = (await page.evaluate(READ)) as any;
      const pages = r.pages as number;
      for (let p = 0; p < pages; p++) {
        if (r.docScroll > 0) f.push(`page ${p + 1}: document scrolls by ${r.docScroll}px`);
        if (r.panelOver > 0) f.push(`page ${p + 1}: panel overflows by ${r.panelOver}px`);
        if (r.below > 1) f.push(`page ${p + 1}: content ${r.below}px below its region`);
        if (r.flowOver[0] > 1) f.push(`page ${p + 1}: columns overflow by ${r.flowOver[0]}px`);
        if (r.flowOver[1] > 1) f.push(`columns spill sideways by ${r.flowOver[1]}px with no pager`);
        if (p < pages - 1) {
          await page.click('.c-pager button[aria-label="Next page"]');
          await settle(page);
          r = (await page.evaluate(READ)) as any;
        }
      }
      tabs.push({ tab: t, pages, failures: f });
    }
    if (!first.tabs.length) failures.push('no tabs');
    if (!first.chips) failures.push('a theme chip is truncated');
    rows.push({ id: c.id, name: c.name, bandOverflow: first.bandOverflow, need: first.need, tabs, failures });
  }
  if (errors.length) rows.push({ id: '(page errors)', name: errors.slice(0, 3).join(' | '), bandOverflow: '', tabs: [], failures: errors.slice(0, 3) });
  result.push({ viewport: vp, cards: rows });
  await page.close();
}
await browser.close();
await writeFile(out, JSON.stringify({ base, result }, null, 1));

let failed = 0;
for (const { viewport, cards: rows } of result) {
  const over = rows.filter((r) => r.bandOverflow);
  const paged = rows.flatMap((r) => r.tabs.filter((t) => t.pages > 1).map((t) => `${r.id}/${t.tab}(${t.pages})`));
  const bad = rows.filter((r) => r.failures.length || r.tabs.some((t) => t.failures.length));
  failed += bad.length;
  console.log(`\n${viewport} (${rows.length} cards)`);
  console.log(`  data-band-overflow (${over.length}): ${over.map((r) => `${r.id}[${r.bandOverflow}]`).join(', ') || 'none'}`);
  console.log(`  paged tabs (${paged.length}): ${paged.join(', ') || 'none'}`);
  console.log(`  failures: ${bad.length} cards`);
  for (const r of bad.slice(0, 30)) console.log(`    ${r.id}: ${[...r.failures, ...r.tabs.flatMap((t) => t.failures.map((x) => `${t.tab}: ${x}`))].join('; ')}`);
}
console.log(`\nwrote ${out}${failed ? `, ${failed} failing` : ', no failures'}`);
