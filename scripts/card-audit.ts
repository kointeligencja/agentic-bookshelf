// Opens every concept card at each viewport and checks the fixed template:
//  - the page does not scroll, and every tab's content is inside its region (on every page of a paged tab);
//  - "With your agent" is never clipped: its box's scrollHeight is not more than its clientHeight, it is not masked, and it is inside the band;
//  - the band is 180px at least, 340px at most unless "With your agent" needs more, and holds the taller text;
//  - no page of a paged tab ends inside a sentence: every sentence (and every method step, quote and line, which are whole) is on one page;
//  - in reading mode the left quarter of the screen (the strip) is walnut backdrop all over, for every book (see stripCheck).
// Reports per viewport: the cards with a paged tab, the paged tabs, the cards whose pages come from the band being taller than 240px
// (measured again with the band capped at 240px), the band-overflow (Idea) list and the longest line of running text, in characters.
// Writes /tmp/card-audit.json and prints a summary. No screenshots are kept.
// Usage: npx tsx scripts/card-audit.ts [baseUrl] [WxH,WxH,...]   (needs `npx vite --port 5181` running)
// Env: CHROME_BIN = a Chromium executable to use instead of Playwright's own; OUT = the JSON file;
// ONLY = comma-separated concept ids to audit (default all); QUICK=1 reads the band only (no tabs); NOSTRIP=1 skips the strip check.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import { readingPanel } from '../src/lib/panel.ts';
import type { Agentic } from '../src/types.ts';

const base = process.argv[2] ?? 'http://localhost:5181';
const sizes = (process.argv[3] ?? '1280x800,1440x900,2000x1150').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const out = process.env.OUT ?? '/tmp/card-audit.json';
const quick = process.env.QUICK === '1';
const noStrip = process.env.NOSTRIP === '1';
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const data = JSON.parse(await readFile('public/data/agentic.json', 'utf8')) as Agentic;
const library = JSON.parse(await readFile('public/data/books.json', 'utf8')) as { books: { id: string; title: string; dims: { w: number; h: number; t: number } }[] };
const BAND_CAP = 240;

interface TabRow {
  tab: string;
  pages: number;
  /** Pages when the band is capped at 240px (only measured for a paged tab on a card whose band is taller than that). */
  cappedPages?: number;
  failures: string[];
}
interface Row {
  id: string;
  name: string;
  bandOverflow: string;
  /** Height the band's two texts need, px, the band's height and the card's height. */
  need?: { idea: number; apply: number; band: number; page: number };
  tabs: TabRow[];
  failures: string[];
  /** The smallest height of the tab panel's region on this card, px. */
  region?: number;
  /** The longest line of running text on any tab, in characters, and where. */
  cpl?: { n: number; where: string };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

/** What the page says about the card on screen. Runs in the page. */
const READ = `(() => {
  // The longest line of running text on screen, in characters: each character's box is grouped into lines.
  const longest = () => {
    let best = { n: 0, where: '' };
    for (const el of document.querySelectorAll('.card .c-sum, .card .b-idea p, .card .b-apply p, .card .mc:not(.tb-measure) p, .card .m-intro, .card .m-step span, .card .q-quote p, .card .q-line p')) {
      if (el.closest('.tb-measure')) continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const boxes = [];
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const r = document.createRange();
        for (let i = 0; i < t.length; i++) {
          r.setStart(t, i); r.setEnd(t, i + 1);
          const b = r.getClientRects()[0];
          if (b && b.width > 0) boxes.push((b.top + b.bottom) / 2);
        }
      }
      let n = 0, y = -1e9;
      for (const c of boxes) {
        if (Math.abs(c - y) > 8) { n = 0; y = c; }
        n++;
        if (n > best.n) best = { n, where: el.className || el.tagName.toLowerCase() };
      }
    }
    return best;
  };
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
    // "With your agent": its box holds its text (scrollHeight <= clientHeight), is not masked, and ends inside the band.
    apply: q('.b-apply') ? { scroll: q('.b-apply').scrollHeight - q('.b-apply').clientHeight, masked: getComputedStyle(q('.b-apply')).maskImage !== 'none' && getComputedStyle(q('.b-apply')).maskImage !== '', below: Math.round(q('.b-apply').getBoundingClientRect().bottom - band.getBoundingClientRect().bottom), clipped: getComputedStyle(q('.b-apply')).overflow !== 'visible' } : null,
    // Sentences on the open tab that begin on one page and end on another (two columns to a page, in the flow of columns).
    broken: (() => {
      const mc = q('.c-panel .tb > .mc:not(.tb-measure)');
      if (!mc || card.dataset.pages === undefined) return [];
      const left = mc.getBoundingClientRect().left;
      const w = mc.parentElement.clientWidth;
      const step = (w - 24) / 2 + 24;
      const t = mc.style.transform.match(/translateX\\((-?[\\d.]+)px\\)/);
      const base = left - (t ? Number(t[1]) : 0);
      const col = (r) => Math.max(0, Math.floor((r.left - base + 1) / step));
      const out = [];
      for (const s of mc.querySelectorAll('p > span')) {
        const rs = s.getClientRects();
        if (!rs.length) continue;
        if (Math.floor(col(rs[0]) / 2) !== Math.floor(col(rs[rs.length - 1]) / 2)) out.push(s.textContent.trim().slice(0, 50));
      }
      return out;
    })(),
    tabs: Array.from(document.querySelectorAll('.c-tabs [role=tab]')).map((t) => t.dataset.tab),
    cpl: longest(),
    bandBox: band ? [Math.round(band.getBoundingClientRect().height), Math.round(q('.b-apply') ? q('.b-apply').getBoundingClientRect().height : 0)] : [0, 0],
    chips: Array.from(document.querySelectorAll('.c-chips .t')).every((t) => t.scrollWidth <= t.clientWidth + 1),
  };
})()`;

async function settle(page: Page) {
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await page.waitForTimeout(110);
}

/**
 * Is the left quarter of the screen (reading mode's strip) walnut backdrop all over? A screenshot of the strip is taken once the camera and
 * the book have come to rest (two screenshots 300ms apart are the same), and every pixel outside the book is checked:
 *  - it is dark and brown: luminance at most STRIP_MAX_LUMA, red >= green >= blue (the room's floor, wall and skirting are light, the shelves
 *    and the glow of the case would break the smooth backdrop);
 *  - it is smooth: no pixel differs from its right and lower neighbour by more than STRIP_MAX_STEP levels in luminance (the backdrop is a soft
 *    glow; the edge of a shelf, the floor or the case is a step).
 * The book's box (its width on screen from readingPanel, its height from its proportions, centred in the strip) plus a margin is skipped,
 * since its cover can be any colour. Reports the worst pixel, so a failure says where.
 */
const STRIP_MAX_LUMA = 70;
const STRIP_MAX_STEP = 3;
async function stripCheck(page: Page, w: number, h: number, bookId: string): Promise<{ failures: string[]; maxLuma: number; maxStep: number }> {
  const shoot = async () => (await sharp(await page.screenshot({ clip: { x: 0, y: 0, width: readingPanel(w).strip, height: h } })).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
  let a = await shoot();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    const b = await shoot();
    let diff = 0;
    for (let k = 0; k < b.data.length; k++) diff = Math.max(diff, Math.abs(b.data[k]! - a.data[k]!));
    a = b;
    if (diff <= 2) break;
  }
  const { data: px, info } = a;
  const W = info.width;
  const H = info.height;
  const book = library.books.find((x) => x.id === bookId)!;
  const bw = readingPanel(w).book;
  const bh = (bw * book.dims.h) / book.dims.w;
  const hx = (bw / 2) * 1.3 + 12;
  const hy = (bh / 2) * 1.3 + 20;
  const inBook = (x: number, y: number) => Math.abs(x - W / 2) <= hx && Math.abs(y - H / 2) <= hy;
  const luma = (x: number, y: number) => 0.299 * px[(y * W + x) * 3]! + 0.587 * px[(y * W + x) * 3 + 1]! + 0.114 * px[(y * W + x) * 3 + 2]!;
  let maxLuma = 0;
  let maxStep = 0;
  let badBrown = 0;
  let worst = { x: 0, y: 0, why: '' };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      if (inBook(x, y) || inBook(x + 1, y) || inBook(x, y + 1)) continue;
      const i = (y * W + x) * 3;
      const l = luma(x, y);
      if (l > maxLuma) {
        maxLuma = l;
        if (l > STRIP_MAX_LUMA) worst = { x, y, why: `luma ${Math.round(l)} at (${x},${y})` };
      }
      if (!(px[i]! >= px[i + 1]! && px[i + 1]! >= px[i + 2]!)) badBrown++;
      const step = Math.max(Math.abs(l - luma(x + 1, y)), Math.abs(l - luma(x, y + 1)));
      if (step > maxStep) {
        maxStep = step;
        if (step > STRIP_MAX_STEP) worst = { x, y, why: `step ${step.toFixed(1)} at (${x},${y})` };
      }
    }
  }
  const failures: string[] = [];
  if (maxLuma > STRIP_MAX_LUMA) failures.push(`strip is not all walnut: ${worst.why}`);
  if (badBrown > 0) failures.push(`${badBrown} strip pixels are not brown`);
  if (maxStep > STRIP_MAX_STEP) failures.push(`strip is not smooth: ${worst.why}`);
  return { failures, maxLuma: Math.round(maxLuma), maxStep: Math.round(maxStep * 10) / 10 };
}

const result: { viewport: string; cards: Row[]; strips: { book: string; title: string; maxLuma: number; maxStep: number; failures: string[] }[] }[] = [];
for (const [w, h] of sizes) {
  const vp = `${w}x${h}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const open = async (bookId: string, c: { id: string; name: string }) => {
    await page.evaluate(`window.location.hash = ${JSON.stringify(`#book/${bookId}/${c.id}`)}`);
    await page.waitForFunction(`(() => { const e = document.querySelector('.book-panel.visible .c-name'); return !!e && e.textContent === ${JSON.stringify(c.name)} && !!document.querySelector('.card[data-tab]'); })()`, undefined, { timeout: 20000 });
  };
  const rows: Row[] = [];
  for (const c of data.concepts.filter((x) => !only || only.has(x.id))) {
    const failures: string[] = [];
    try {
      await open(c.bookIds[0]!, c);
    } catch (e) {
      rows.push({ id: c.id, name: c.name, bandOverflow: '', tabs: [], failures: [`did not open: ${String(e).slice(0, 80)}`] });
      continue;
    }
    await settle(page);
    const first = (await page.evaluate(READ)) as any;
    const tabs: TabRow[] = [];
    let cpl = first.cpl as { n: number; where: string };
    let region = 1e9;
    for (const t of quick ? [] : (first.tabs as string[])) {
      const f: string[] = [];
      await page.click(`.c-tabs [role=tab][data-tab="${t}"]`);
      await settle(page);
      let r = (await page.evaluate(READ)) as any;
      const pages = r.pages as number;
      region = Math.min(region, r.region as number);
      if (r.broken.length) f.push(`${r.broken.length} sentence(s) run over two pages: "${r.broken[0]}"`);
      for (let p = 0; p < pages; p++) {
        if (r.cpl.n > cpl.n) cpl = { n: r.cpl.n, where: `${t}: ${r.cpl.where}` };
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
    if (first.band < 179) failures.push(`band is ${first.band}px, under 180`);
    if (first.band > 341 && first.band < first.need.apply - 1) failures.push(`band is ${first.band}px, over 340 and not for "With your agent" (needs ${first.need.apply})`);
    if (first.band < first.need.apply - 1) failures.push(`band is ${first.band}px but "With your agent" needs ${first.need.apply}`);
    if (first.apply) {
      if (first.apply.scroll > 0) failures.push(`"With your agent" is clipped: scrollHeight exceeds clientHeight by ${first.apply.scroll}px`);
      if (first.apply.masked) failures.push('"With your agent" is faded');
      if (first.apply.clipped) failures.push('"With your agent" box clips its overflow');
      if (first.apply.below > 1) failures.push(`"With your agent" ends ${first.apply.below}px below the band`);
    }
    if (first.bandOverflow.includes('apply')) failures.push('band-overflow names apply');
    // Pages again with the band capped at 240px, for the tabs that are paged now on a card whose band is taller.
    if (!quick && first.band > BAND_CAP && tabs.some((t) => t.pages > 1)) {
      await page.addStyleTag({ content: `.band { max-height: ${BAND_CAP}px !important; }` }).then(async (tag) => {
        await settle(page);
        for (const t of tabs.filter((x) => x.pages > 1)) {
          await page.click(`.c-tabs [role=tab][data-tab="${t.tab}"]`);
          await settle(page);
          t.cappedPages = (((await page.evaluate(READ)) as any).pages as number) ?? 1;
        }
        await tag.evaluate((el) => el.remove());
        await settle(page);
      });
    }
    rows.push({ id: c.id, name: c.name, bandOverflow: first.bandOverflow, need: { ...first.need, band: first.band }, tabs, failures, cpl, region: region === 1e9 ? undefined : region });
  }
  const strips: (typeof result)[number]['strips'] = [];
  if (!noStrip) {
    for (const b of data.books.filter((x) => !only || data.concepts.some((c) => only.has(c.id) && c.bookIds.includes(x.id)))) {
      const c = data.concepts.find((x) => x.bookIds.includes(b.id) && (!only || only.has(x.id)));
      if (!c) continue;
      try {
        await open(b.id, c);
      } catch (e) {
        strips.push({ book: b.id, title: b.title, maxLuma: 0, maxStep: 0, failures: [`did not open: ${String(e).slice(0, 80)}`] });
        continue;
      }
      await page.waitForTimeout(900);
      const r = await stripCheck(page, w, h, b.id);
      strips.push({ book: b.id, title: b.title, ...r });
    }
  }
  if (errors.length) rows.push({ id: '(page errors)', name: errors.slice(0, 3).join(' | '), bandOverflow: '', tabs: [], failures: errors.slice(0, 3) });
  result.push({ viewport: vp, cards: rows, strips });
  await page.close();
}
await browser.close();
await writeFile(out, JSON.stringify({ base, result }, null, 1));

let failed = 0;
for (const { viewport, cards: rows, strips } of result) {
  const over = rows.filter((r) => r.bandOverflow);
  const pagedRows = rows.filter((r) => r.tabs.some((t) => t.pages > 1));
  const paged = rows.flatMap((r) => r.tabs.filter((t) => t.pages > 1).map((t) => `${r.id}/${t.tab}(${t.pages})`));
  // A card whose pages come from a band taller than 240px: paged now, and not paged with the band capped there.
  const forced = pagedRows.filter((r) => r.tabs.some((t) => t.cappedPages !== undefined) && r.tabs.every((t) => (t.cappedPages ?? t.pages) <= 1));
  const forcedByApply = forced.filter((r) => (r.need?.apply ?? 0) > BAND_CAP);
  const forcedTabs = rows.flatMap((r) => r.tabs.filter((t) => t.pages > 1 && t.cappedPages !== undefined && t.cappedPages <= 1));
  const bad = rows.filter((r) => r.failures.length || r.tabs.some((t) => t.failures.length));
  const badStrips = strips.filter((x) => x.failures.length);
  failed += bad.length + badStrips.length;
  const regions = rows.flatMap((r) => (r.region === undefined ? [] : [{ id: r.id, region: r.region, apply: r.need?.apply ?? 0 }]));
  const smallest = regions.reduce((a, r) => (r.region < a.region ? r : a), { id: '', region: 1e9, apply: 0 });
  const taller = rows.filter((r) => (r.need?.band ?? 0) > BAND_CAP);
  console.log(`\n${viewport} (${rows.length} cards, ${strips.length} books)`);
  console.log(`  cards with a paged tab: ${pagedRows.length}; paged tabs: ${paged.length}`);
  console.log(`  paged: ${paged.join(', ') || 'none'}`);
  console.log(`  band taller than ${BAND_CAP}px: ${taller.length} cards (${taller.filter((r) => (r.need?.apply ?? 0) > BAND_CAP).length} because "With your agent" needs more than ${BAND_CAP}px; ${taller.filter((r) => (r.need?.band ?? 0) > 340).length} over 340px)`);
  console.log(`  cards paged only because of the band over ${BAND_CAP}px: ${forced.length} (${forcedTabs.length} tabs; ${forcedByApply.length} of these cards have "With your agent" over ${BAND_CAP}px): ${forced.map((r) => r.id).join(', ') || 'none'}`);
  console.log(`  smallest tab panel: ${smallest.region}px (${smallest.id}; "With your agent" needs ${smallest.apply}px); under 150px: ${regions.filter((r) => r.region < 149).map((r) => r.id).join(', ') || 'none'}`);
  console.log(`  data-band-overflow, Idea cut (${over.length}): ${over.map((r) => `${r.id}[${r.bandOverflow}]`).join(', ') || 'none'}`);
  const need = rows.flatMap((r) => (r.need ? [r.need.idea, r.need.apply] : []));
  const top = rows.reduce((a, r) => (r.cpl && r.cpl.n > a.n ? { n: r.cpl.n, id: r.id, where: r.cpl.where } : a), { n: 0, id: '', where: '' });
  console.log(`  longest line: ${top.n} characters (${top.id}, ${top.where}); cards over 75: ${rows.filter((r) => (r.cpl?.n ?? 0) > 75).length}; band text needs up to ${Math.max(0, ...need)}px; bands ${Math.min(...rows.map((r) => r.need?.band ?? 1e9))} to ${Math.max(0, ...rows.map((r) => r.need?.band ?? 0))}px`);
  if (strips.length) console.log(`  walnut strip: ${strips.length - badStrips.length}/${strips.length} books pass; brightest pixel ${Math.max(0, ...strips.map((x) => x.maxLuma))} (limit ${STRIP_MAX_LUMA}), largest step ${Math.max(0, ...strips.map((x) => x.maxStep))} (limit ${STRIP_MAX_STEP})`);
  for (const x of badStrips.slice(0, 20)) console.log(`    strip ${x.book} ${x.title}: ${x.failures.join('; ')}`);
  console.log(`  failures: ${bad.length} cards`);
  for (const r of bad.slice(0, 30)) console.log(`    ${r.id}: ${[...r.failures, ...r.tabs.flatMap((t) => t.failures.map((x) => `${t.tab}: ${x}`))].join('; ')}`);
}
console.log(`\nwrote ${out}${failed ? `, ${failed} failing` : ', no failures'}`);
