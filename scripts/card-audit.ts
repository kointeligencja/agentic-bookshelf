// Opens every concept card at each viewport and checks the fixed template:
//  - the page does not scroll, and every tab's content is inside its region (on every page of a paged tab);
//  - nothing on the card is clipped or faded: no element with overflow other than visible has more content than room (scrollHeight <=
//    clientHeight), no element is masked, every line of text on screen is inside every box that clips it (the band, both its boxes, the tab
//    panel on each page, the page itself), and the card itself holds its parts;
//  - paging is as tight as the measured heights allow: for every page of a paged tab the first item of the next page would not have fitted
//    on this one (a method step in either column of the page, whichever way the page is split; a quote or a line under the last one in its
//    column; a paragraph, with its heading, or the first sentence of a cut paragraph, in what is left of the last column of a text page),
//    and a method that fits one page with the tight gap between steps is not paged; the steps on screen are as tall as they were measured;
//  - no page of a paged tab ends inside a sentence: every sentence (and every method step, quote and line, which are whole) is on one page;
//  - in reading mode the left quarter of the screen (the strip) is walnut backdrop all over, for every book (see stripCheck).
// Reports per viewport: the cards with a paged tab and the paged tabs (by kind), the cards whose tab panel is under 150px (with the numbers
// that make it: page, header, band, tabs and footer heights; those are reported, not failures: the text is shortened in the data) and the
// longest line of running text, in characters. Writes /tmp/card-audit.json and prints a summary. No screenshots are kept.
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
/** The smallest tab panel the template aims for; a card whose panel is under it is reported. */
const PANEL_MIN = 150;
/** The tight gap between method steps, px. */
const TIGHT_GAP = 16;

interface TabRow {
  tab: string;
  pages: number;
  failures: string[];
}
interface Row {
  id: string;
  name: string;
  /** Heights, px: what the band's two texts need, the band, the page (card), header, tabs, footer and the tab panel's region. */
  need?: { idea: number; apply: number; band: number; page: number; head: number; tabs: number; foot: number; region: number };
  tabs: TabRow[];
  failures: string[];
  /** The smallest height of the tab panel's region on this card, px. */
  region?: number;
  /** The longest line of running text on any tab, in characters, and where. */
  cpl?: { n: number; where: string };
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

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
          if (b && b.width > 0) boxes.push([b.left, (b.top + b.bottom) / 2]);
        }
      }
      let n = 0, y = -1e9;
      let px = -1e9;
      for (const [x, c] of boxes) {
        // A new line when the height changes, or the box jumps sideways to the next column.
        if (Math.abs(c - y) > 8 || x < px - 1 || x > px + 120) { n = 0; y = c; }
        px = x;
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
    docScroll: Math.max(doc.scrollHeight - innerHeight, doc.scrollWidth - innerWidth, 0),
    panelOver: panel ? panel.scrollHeight - panel.clientHeight : 0,
    region: tbr ? Math.round(tbr.height) : 0,
    below: tbr ? Math.round(Math.max(0, bottom('.m-cols') - tbr.bottom, bottom('.q-cols') - tbr.bottom, ...Array.from(document.querySelectorAll('.q-col, .m-col')).map((c) => (c.lastElementChild ? c.lastElementChild.getBoundingClientRect().bottom : 0) - tbr.bottom))) : 0,
    flowOver: mc ? [mc.scrollHeight - mc.clientHeight, card.dataset.pages ? 0 : mc.scrollWidth - mc.clientWidth] : [0, 0],
    band: band ? Math.round(band.getBoundingClientRect().height) : 0,
    need: { idea: q('.b-idea p') ? Math.round(q('.b-idea p').getBoundingClientRect().bottom - q('.b-idea').getBoundingClientRect().top) : 0, apply: q('.b-apply p') ? Math.round(q('.b-apply p').getBoundingClientRect().bottom - q('.b-apply').getBoundingClientRect().top + 16) : 0, page: card ? Math.round(card.getBoundingClientRect().height) : 0, head: Math.round(bottom('.c-head') - (q('.c-head') ? q('.c-head').getBoundingClientRect().top : 0)), tabs: q('.c-tabs') ? Math.round(q('.c-tabs').getBoundingClientRect().height) : 0, foot: q('.c-foot') ? Math.round(q('.c-foot').getBoundingClientRect().height) : 0 },
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
    // Anything clipped or faded on the card.
    clipped: (() => {
      const out = [];
      const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
      const panelBox = panel.getBoundingClientRect();
      if (card.scrollHeight > card.clientHeight + 1) out.push('card holds ' + card.scrollHeight + 'px in ' + card.clientHeight + 'px');
      if (card.getBoundingClientRect().bottom > panelBox.bottom + 1) out.push('card ends ' + Math.round(card.getBoundingClientRect().bottom - panelBox.bottom) + 'px below the page');
      for (const el of card.querySelectorAll('*')) {
        if (el.closest('.tb-measure')) continue;
        const cs = getComputedStyle(el);
        if (cs.maskImage && cs.maskImage !== 'none') out.push('faded: ' + name(el));
        if (cs.overflowY !== 'visible' && !el.classList.contains('tb') && el.scrollHeight > el.clientHeight + 1) out.push(name(el) + ' holds ' + el.scrollHeight + 'px in ' + el.clientHeight + 'px');
      }
      // Every line of text is inside every box that clips it (the tab panel's other pages are beside it, not under it).
      const clippers = [panel, ...card.querySelectorAll('*')].filter((e) => !e.closest('.tb-measure') && getComputedStyle(e).overflowY !== 'visible');
      const w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!t.textContent.trim() || t.parentElement.closest('.tb-measure')) continue;
        const r = document.createRange();
        r.selectNodeContents(t);
        const pb = t.parentElement.getBoundingClientRect();
        for (const raw of r.getClientRects()) {
          if (raw.width < 1) continue;
          // The glyphs sit in their line box; a large numeral's font box is taller than its line (line-height 1), so only its line box counts.
          const b = { left: raw.left, right: raw.right, top: Math.max(raw.top, pb.top), bottom: Math.min(raw.bottom, pb.bottom) };
          for (const c of clippers) {
            if (!c.contains(t)) continue;
            const cb = c.getBoundingClientRect();
            if (b.right <= cb.left + 1 || b.left >= cb.right - 1) continue;
            if (b.top < cb.top - 1 || b.bottom > cb.bottom + 1) { out.push('text "' + t.textContent.trim().slice(0, 30) + '" is outside ' + name(c) + ' by ' + Math.round(Math.max(cb.top - b.top, b.bottom - cb.bottom)) + 'px'); break; }
          }
        }
      }
      return [...new Set(out)].slice(0, 6);
    })(),
    // What the paging of the open tab is made of, to check that no page ends with room for the next item.
    paging: (() => {
      const tb = q('.c-panel .tb');
      if (!tb || !card.dataset.tab) return null;
      const t = tb.getBoundingClientRect();
      const h = (e) => e.getBoundingClientRect().height;
      const gapOf = (e) => (e ? parseFloat(getComputedStyle(e).rowGap) || 0 : 0);
      if (card.dataset.tab === 'method') {
        const cols = tb.querySelector('.m-cols');
        const shown = Array.from(tb.querySelectorAll('.m-col > li')).map((li) => ({ i: Number(li.querySelector('b').textContent) - 1, h: h(li) }));
        return {
          kind: 'method', room: t.height - (cols ? cols.getBoundingClientRect().top - t.top : 0), roomAll: t.height, gap: gapOf(tb.querySelector('.m-col')), tight: tb.classList.contains('tight'),
          one: !!(cols && cols.classList.contains('one')), items: shown.map((x) => x.i), shown: shown.map((x) => x.h),
          meas: Array.from(tb.querySelectorAll('.tb-measure .m-steps > li')).map(h), first: !tb.querySelector('.m-head') ? 0 : 1,
          headRoom: t.height - (tb.querySelector('.m-head') ? tb.querySelector('.m-head').getBoundingClientRect().height + gapOf(tb) : 0),
        };
      }
      if (card.dataset.tab === 'quotes') {
        return {
          kind: 'quotes',
          cols: Array.from(tb.querySelectorAll('.q-col')).map((c, k) => {
            const list = c.querySelector('.q-list');
            const lt = list.getBoundingClientRect().top;
            return {
              room: t.height - (lt - t.top), gap: gapOf(list), items: Array.from(list.children).map((li) => Number(li.dataset.i)),
              used: list.lastElementChild ? list.lastElementChild.getBoundingClientRect().bottom - lt : 0,
              meas: Array.from(tb.querySelectorAll('.tb-measure ' + (k === 0 ? '.q-quotes' : '.q-lines') + ' > li')).map(h),
              shown: Array.from(list.children).map(h),
            };
          }),
        };
      }
      // Running text, paged two columns to a page: where each piece sits, and what is left under the last one on each page.
      const mc = tb.querySelector(':scope > .mc:not(.tb-measure)');
      if (!mc || card.dataset.pages === undefined) return { kind: 'flow', faults: [] };
      const m = mc.style.transform.match(/translateX\\((-?[\\d.]+)px\\)/);
      const base = mc.getBoundingClientRect().left - (m ? Number(m[1]) : 0);
      const step = (tb.clientWidth - 24) / 2 + 24;
      const col = (r) => Math.max(0, Math.floor((r.left - base + 1) / step));
      const top = mc.getBoundingClientRect().top;
      // The pieces on screen, in order, and which sentence of its paragraph each starts with (from the measured copy, which has the same pieces).
      const firsts = Array.from(tb.querySelectorAll('.tb-measure [data-piece]')).map((e) => Number(e.dataset.first));
      const lh = parseFloat(getComputedStyle(mc.querySelector('p')).lineHeight);
      const pieces = Array.from(mc.children).filter((e) => !e.classList.contains('pgfill')).map((e, i) => {
        const rs = Array.from(e.getClientRects());
        const sents = e.tagName === 'P' ? Array.from(e.querySelectorAll(':scope > span')).map((s) => s.getClientRects().length) : [];
        return { label: e.classList.contains('label'), p0: Math.floor(col(rs[0]) / 2), p1: Math.floor(col(rs[rs.length - 1]) / 2), c1: col(rs[rs.length - 1]), bottom: rs[rs.length - 1].bottom - top, h: rs.length * (e.classList.contains('label') ? 24 : lh), first: sents[0] ? sents[0] * lh : 0, cont: (firsts[i] || 0) > 0 };
      });
      const pages = Math.max(...pieces.map((x) => x.p1)) + 1;
      const faults = [];
      for (let n = 0; n < pages - 1; n++) {
        const here = pieces.filter((x) => x.p1 === n);
        const next = pieces.findIndex((x) => x.p0 === n + 1);
        // A paragraph that runs on from this page to the next fills the page to its last line (it is cut between two sentences): nothing is left over.
        if (!here.length || next < 0 || pieces.some((x) => x.p0 <= n && x.p1 > n)) continue;
        const tail = here[here.length - 1];
        const x = pieces[next];
        // Room under the last text of the page, in the last column of the page: under it in its own column when that is the second (a new paragraph
        // needs the 16px between paragraphs), else the whole second column.
        const free = tail.c1 % 2 === 1 ? tb.clientHeight - tail.bottom : tb.clientHeight;
        const tailInColumn = tail.c1 % 2 === 1;
        // The next thing to go on: the first sentence (which carries on its paragraph when the piece is the rest of one), or the heading and the first sentence under it.
        const head = x.label ? 16 + 28 : 0;
        const second = x.label ? pieces[next + 1] : x;
        const need = head + (x.label || !x.cont ? (tailInColumn ? 16 : 0) : 0) + (second ? second.first || lh : 0);
        if (need <= free + 0.5) faults.push('page ' + (n + 1) + ' ends with ' + Math.round(free) + 'px free, the next ' + (x.label ? 'heading and sentence' : 'sentence') + ' needs ' + Math.round(need) + 'px');
      }
      return { kind: 'flow', faults, pages };
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
  // Above and beside the book the margin is wide; under it only a few pixels, since the dark blocks and the halo that depth of field used to
  // draw along the book's bottom edge (see Effects.tsx) were right there: below the book the backdrop is smooth and dark again.
  const hyBelow = (bh / 2) * 1.12 + 8;
  const inBook = (x: number, y: number) => Math.abs(x - W / 2) <= hx && y - H / 2 <= hyBelow && H / 2 - y <= hy;
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

/** Do `items` (consecutive) go in two columns, split anywhere, each column within `room`? Heights are `h` by index. */
function fitsTwoColumns(h: number[], items: number[], gap: number, room: number): boolean {
  const stack = (xs: number[]) => xs.reduce((a, i, k) => a + (h[i] ?? 0) + (k ? gap : 0), 0);
  for (let s = 0; s <= items.length; s++) if (stack(items.slice(0, s)) <= room + 0.01 && stack(items.slice(s)) <= room + 0.01) return true;
  return false;
}

/** What is wrong with the paging of the page just read (page `p` of `pages`, from 0): see the header of this file. */
function pagingFaults(g: any, p: number, pages: number): string[] {
  const out: string[] = [];
  if (!g) return out;
  if (g.kind === 'flow') return p === 0 ? g.faults : [];
  if (g.kind === 'method') {
    const last = Math.max(-1, ...g.items);
    // The steps on screen are as tall as they were measured (a single step may be set wider than it was measured).
    if (!g.one) g.items.forEach((i: number, k: number) => Math.abs(g.shown[k] - g.meas[i]) > 1 && out.push(`step ${i + 1} is ${g.shown[k].toFixed(1)}px, measured ${g.meas[i].toFixed(1)}px`));
    if (pages > 1 && last + 1 < g.meas.length && g.items.length) {
      const room = p === 0 ? g.room : g.roomAll;
      if (fitsTwoColumns(g.meas, [...g.items, last + 1], g.gap, room)) out.push(`step ${last + 2} would have fitted on this page (room ${Math.round(room)}px)`);
    }
    // All of it on one page with the tight gap: then it should not be paged.
    if (p === 0 && pages > 1 && g.first !== undefined) {
      const all = g.meas.map((_: number, i: number) => i);
      if (fitsTwoColumns(g.meas, all, TIGHT_GAP, g.headRoom)) out.push('all the steps fit one page with the tight gap, but the method is paged');
    }
  } else if (g.kind === 'quotes') {
    g.cols.forEach((c: any, k: number) => {
      if (!c.items.length) return;
      const last = Math.max(...c.items);
      if (c.items.length && last + 1 < c.meas.length && c.used + c.gap + c.meas[last + 1] <= c.room + 0.01) out.push(`${k ? 'line' : 'quote'} ${last + 2} would have fitted under the last one (room ${Math.round(c.room - c.used - c.gap)}px, needs ${Math.round(c.meas[last + 1])}px)`);
      c.items.forEach((i: number, n: number) => Math.abs(c.shown[n] - c.meas[i]) > 1 && out.push(`${k ? 'line' : 'quote'} ${i + 1} is ${c.shown[n].toFixed(1)}px, measured ${c.meas[i].toFixed(1)}px`));
    });
  }
  return out;
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
      rows.push({ id: c.id, name: c.name, tabs: [], failures: [`did not open: ${String(e).slice(0, 80)}`] });
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
        for (const x of r.clipped as string[]) f.push(`page ${p + 1}: ${x}`);
        f.push(...pagingFaults(r.paging, p, pages).map((x) => `page ${p + 1}: ${x}`));
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
    if (first.band < first.need.idea - 1) failures.push(`band is ${first.band}px but Idea needs ${first.need.idea}`);
    if (first.band < first.need.apply - 1) failures.push(`band is ${first.band}px but "With your agent" needs ${first.need.apply}`);
    if (first.apply) {
      if (first.apply.scroll > 0) failures.push(`"With your agent" is clipped: scrollHeight exceeds clientHeight by ${first.apply.scroll}px`);
      if (first.apply.masked) failures.push('"With your agent" is faded');
      if (first.apply.clipped) failures.push('"With your agent" box clips its overflow');
      if (first.apply.below > 1) failures.push(`"With your agent" ends ${first.apply.below}px below the band`);
    }
    for (const x of first.clipped as string[]) failures.push(`band/head: ${x}`);
    rows.push({ id: c.id, name: c.name, need: { ...first.need, band: first.band, region: first.region }, tabs, failures, cpl, region: region === 1e9 ? undefined : region });
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
  if (errors.length) rows.push({ id: '(page errors)', name: errors.slice(0, 3).join(' | '), tabs: [], failures: errors.slice(0, 3) });
  result.push({ viewport: vp, cards: rows, strips });
  await page.close();
}
await browser.close();
await writeFile(out, JSON.stringify({ base, result }, null, 1));

let failed = 0;
for (const { viewport, cards: rows, strips } of result) {
  const pagedRows = rows.filter((r) => r.tabs.some((t) => t.pages > 1));
  const paged = rows.flatMap((r) => r.tabs.filter((t) => t.pages > 1).map((t) => `${r.id}/${t.tab}(${t.pages})`));
  const byKind = Object.fromEntries(['why', 'story', 'method', 'limits', 'quotes'].map((k) => [k, rows.filter((r) => r.tabs.some((t) => t.tab === k && t.pages > 1)).length]));
  // A card whose tab panel is under 150px is reported, not failed: what does not fit its panel is listed with the numbers (the text is shortened in the data).
  const isShort = (r: Row) => r.region !== undefined && r.region < PANEL_MIN;
  const noRoom = (x: string) => /below its region|is outside|overflow|holds \d+px/.test(x);
  const bad = rows.filter((r) => r.failures.length || r.tabs.some((t) => t.failures.some((x) => !(isShort(r) && noRoom(x)))));
  const badStrips = strips.filter((x) => x.failures.length);
  failed += bad.length + badStrips.length;
  const regions = rows.flatMap((r) => (r.region === undefined || !r.need ? [] : [{ id: r.id, region: r.region, need: r.need }]));
  const smallest = regions.reduce((a, r) => (r.region < a.region ? r : a), { id: '', region: 1e9, need: undefined as Row['need'] });
  const short = regions.filter((r) => r.region < PANEL_MIN);
  console.log(`\n${viewport} (${rows.length} cards, ${strips.length} books)`);
  console.log(`  cards with a paged tab: ${pagedRows.length}; paged tabs: ${paged.length} (${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')} cards)`);
  console.log(`  paged: ${paged.join(', ') || 'none'}`);
  console.log(`  smallest tab panel: ${smallest.region}px (${smallest.id}); under ${PANEL_MIN}px: ${short.length} cards`);
  for (const r of short) {
    const cut = rows.find((x) => x.id === r.id)!.tabs.filter((t) => t.failures.length).map((t) => `${t.tab} (${t.failures.filter(noRoom).length} cut)`);
    console.log(`    ${r.id}: panel ${r.region}px = page ${r.need!.page} - header ${r.need!.head} - band ${r.need!.band} (Idea ${r.need!.idea}, With your agent ${r.need!.apply}) - tabs ${r.need!.tabs} - footer ${r.need!.foot} - gaps; does not fit its panel: ${cut.join(', ') || 'nothing'}`);
  }
  const need = rows.flatMap((r) => (r.need ? [r.need.idea, r.need.apply] : []));
  const top = rows.reduce((a, r) => (r.cpl && r.cpl.n > a.n ? { n: r.cpl.n, id: r.id, where: r.cpl.where } : a), { n: 0, id: '', where: '' });
  console.log(`  longest line: ${top.n} characters (${top.id}, ${top.where}); cards over 75: ${rows.filter((r) => (r.cpl?.n ?? 0) > 75).length}; band text needs up to ${Math.max(0, ...need)}px; bands ${Math.min(...rows.map((r) => r.need?.band ?? 1e9))} to ${Math.max(0, ...rows.map((r) => r.need?.band ?? 0))}px`);
  if (strips.length) console.log(`  walnut strip: ${strips.length - badStrips.length}/${strips.length} books pass; brightest pixel ${Math.max(0, ...strips.map((x) => x.maxLuma))} (limit ${STRIP_MAX_LUMA}), largest step ${Math.max(0, ...strips.map((x) => x.maxStep))} (limit ${STRIP_MAX_STEP})`);
  for (const x of badStrips.slice(0, 20)) console.log(`    strip ${x.book} ${x.title}: ${x.failures.join('; ')}`);
  console.log(`  failures: ${bad.length} cards`);
  for (const r of bad.slice(0, 30)) console.log(`    ${r.id} (panel ${r.region}px): ${[...r.failures, ...r.tabs.flatMap((t) => t.failures.filter((x) => !(isShort(r) && noRoom(x))).map((x) => `${t.tab}: ${x}`))].join('; ').slice(0, 400)}`);
}
console.log(`\nwrote ${out}${failed ? `, ${failed} failing` : ', no failures'}`);
