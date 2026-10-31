// Mobile audit. Phone emulation (touch, deviceScaleFactor 3), portrait.
//  - Every one of the 120 concept cards at 390x844, every tab opened once; per tab: no horizontal overflow (document, page, any element past the
//    sides), nothing clipped (the band and its boxes, the tab content, any element that hides content), no text cut by a box that clips it,
//    no overlap among the main blocks, running text at 16px or more, no line of running text over 75 characters, every control at least
//    44x44px, no ‹ › pager (the content flows), the cover strip at most 120px tall, one row of tabs, and ✕ in reach after scrolling to the
//    bottom of the page.
//  - Three sample cards (Socrates, commander-intent, escalation) also at 375, 430 and 768 (tablet).
//  - The home page at 375, 390, 430 and 768: the same checks, the page scrolls (not sideways), the shelf is 55 to 75% of the window high.
//    Stage 4B: order title, search, video, category nav, shelf, theme index, toggle, footer; no timeline; theme index and "also" entries one per row (>= 44px, titles whole);
//    the whole bookcase inside the canvas width (>= 4px margin each side); the nav's edge fades are on exactly where the row has more to scroll to.
//    Stage 4C: the shelf block is as high as the case needs (case margin above and below at most 16px at 375/390/430, the least that fits at 768);
//    search results (mocked API) right under the search pill and above the video, rows >= 44px, a tap opens the card, clearing removes the list,
//    the quiet "not connected" / "nothing fits" lines under the pill too; a theme tapped in the index (or "also") scrolls the shelf block to the top
//    of the window and lights the books, tapping it again does not scroll, a deep link (?t=8) does not scroll, reduced motion jumps; the block is
//    refitted when the window is resized or turned.
//  - Touch flow at 390: tap a book on the shelf, the card opens, the video's player stays the same element, ✕ puts the book back.
//  - The board with three pins at 390 (full-screen sheet).
// Prints a summary and exits 1 on any failure. Needs `npx vite --port 5181` running. Env: CHROME_BIN; ONLY=id,id limits the cards; QUICK=1 skips the sample widths.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { MEASURE, type Measure } from './mobile-measure.ts';
import { mockSearch, MOCK_IDS, type SearchMock } from './mobile-search-mock.ts';
import type { Agentic } from '../src/types.ts';

const base = process.argv[2] ?? 'http://localhost:5181';
const out = process.env.OUT ?? '/tmp/mobile-audit.json';
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const data = JSON.parse(await readFile('public/data/agentic.json', 'utf8')) as Agentic;
const MAX_CPL = 75;
const STRIP_MAX = 120;

const browser: Browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const failures: string[] = [];
const fail = (where: string, what: string) => failures.push(`${where}: ${what}`);

/** What the generic measurement found wrong, as sentences. */
function judge(where: string, m: Measure) {
  if (m.docScrollW > m.vw) fail(where, `the document is ${m.docScrollW}px wide in ${m.vw}px`);
  if (m.scrollerScrollW > m.scrollerClientW && m.mode !== 'home') fail(where, `the page scrolls sideways (${m.scrollerScrollW} in ${m.scrollerClientW}px)`);
  for (const o of m.offenders.slice(0, 3)) fail(where, `${o.sel} reaches past the screen (${o.left}..${o.right}px)`);
  for (const c of m.clipped.slice(0, 3)) fail(where, `clipped: ${c.sel} ${c.why}`);
  for (const c of m.cut.slice(0, 3)) fail(where, `text cut by ${c.by}: "${c.text}" (${c.px}px)`);
  for (const o of m.overlaps.slice(0, 3)) fail(where, `${o.a} overlaps ${o.b} (${o.w}x${o.h}px)`);
  for (const s of m.small.slice(0, 3)) fail(where, `running text at ${s.size}px: ${s.sel} "${s.sample}"`);
  for (const t of m.targets.slice(0, 4)) fail(where, `touch target ${t.w}x${t.h}px: ${t.sel} "${t.text}"`);
  if (m.cpl > MAX_CPL) fail(where, `a line of ${m.cpl} characters`);
}

/** Checks made on a card in the page, beyond the generic ones. */
const CARD_CHECKS = `(() => {
  const q = (s) => document.querySelector(s);
  const r = (e) => e.getBoundingClientRect();
  const panel = q('.book-panel');
  const res = { why: [] };
  const strip = q('.c-by');
  if (!strip) res.why.push('no cover strip');
  else if (r(strip).height > ${STRIP_MAX} || r(strip).height < 40) res.why.push('cover strip is ' + Math.round(r(strip).height) + 'px high');
  if (q('.c-pager')) res.why.push('a ‹ › pager is shown');
  const card = q('.card');
  if (card && card.dataset.pages !== undefined) res.why.push('the card is paged (data-pages=' + card.dataset.pages + ')');
  const tabs = Array.from(document.querySelectorAll('.c-tabs [role="tab"]'));
  if (new Set(tabs.map((t) => Math.round(r(t).top))).size > 1) res.why.push('tabs are on more than one row');
  const list = q('.c-tabs [role="tablist"]');
  if (list && r(list).right > innerWidth + 0.5) res.why.push('the tab row sticks out of the screen');
  // The band: both boxes hold their text.
  for (const s of ['.b-idea', '.b-apply']) {
    const b = q(s);
    if (!b) continue;
    const p = b.querySelector('p');
    if (b.scrollHeight > b.clientHeight + 1) res.why.push(s + ' holds ' + b.scrollHeight + 'px in ' + b.clientHeight + 'px');
    if (p && r(p).bottom > r(b).bottom + 1) res.why.push(s + ' text ends ' + Math.round(r(p).bottom - r(b).bottom) + 'px below its box');
  }
  // The open tab's content is inside the card, and nothing in the panel is under the sticky controls once scrolled to the bottom.
  const tb = q('.c-panel .tb');
  if (tb && card && r(tb).bottom > r(card).bottom + 1) res.why.push('the tab content ends below the card');
  panel.scrollTop = panel.scrollHeight;
  const close = q('.page-close');
  if (close) {
    const b = r(close);
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!hit || !hit.closest('.page-close')) res.why.push('✕ is not reachable after scrolling to the bottom');
  }
  panel.scrollTop = 0;
  return res;
})()`;

/** Brings the element to the middle of the screen, lets the scroll land, then taps it (a tap sent in the same frame as an automatic scroll goes to where the element was). */
async function tap(page: Page, selector: string) {
  // The controls at the top of the card and the sheets over the page stay where they are.
  if (!/page-close|cnav|clist|board \.close/.test(selector)) {
    await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
    await page.waitForTimeout(200);
  }
  await page.tap(selector);
}

async function open(page: Page, hash: string, name: string) {
  await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await page.waitForFunction(`document.querySelector('.book-panel.visible .c-name')?.textContent === ${JSON.stringify(name)}`, undefined, { timeout: 30000 });
  await page.waitForTimeout(650);
}

async function newPhone(w: number, h: number, dsf = 3) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|youtube|googleapis|gstatic|ytimg/i.test(m.text()) && errors.push(m.text()));
  return { ctx, page, errors };
}

const report = { cards: 0, tabs: 0, targets: 0, home: [] as unknown[], samples: [] as unknown[], touch: '', search: [] as unknown[], themeScroll: [] as unknown[], resize: [] as unknown[] };

/** Every card (or the sample ones) at one width. */
async function cards(w: number, h: number, ids: string[]) {
  const { ctx, page, errors } = await newPhone(w, h);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(2500);
  let n = 0;
  for (const id of ids) {
    const c = data.concepts.find((x) => x.id === id)!;
    const bookId = c.bookIds[0]!;
    try {
      await open(page, `#book/${bookId}/${id}`, c.name);
    } catch {
      fail(`${w} ${id}`, 'the card did not open');
      continue;
    }
    const tabs = (await page.evaluate(`Array.from(document.querySelectorAll('.c-tabs [role="tab"]')).map((e) => e.dataset.tab)`)) as string[];
    if (!tabs.length) fail(`${w} ${id}`, 'no tabs');
    const opened: string[] = [];
    for (const t of tabs) {
      await tap(page, `.c-tabs [role="tab"][data-tab="${t}"]`);
      await page.waitForTimeout(120);
      const now = await page.getAttribute('.card', 'data-tab');
      if (now !== t) fail(`${w} ${id}/${t}`, `tapping the tab opened "${now}"`);
      opened.push(t);
      const where = `${w} ${id}/${t}`;
      const m = (await page.evaluate(`${MEASURE}('card')`)) as Measure;
      judge(where, m);
      report.targets += m.targetCount;
      const extra = (await page.evaluate(CARD_CHECKS)) as { why: string[] };
      extra.why.forEach((x) => fail(where, x));
      report.tabs++;
    }
    if (opened.length !== tabs.length) fail(`${w} ${id}`, 'not every tab was opened');
    n++;
    if (n % 20 === 0) console.log(`  ${w}: ${n}/${ids.length} cards, ${failures.length} failures`);
  }
  errors.slice(0, 3).forEach((e) => fail(`${w} cards`, `page error: ${e}`));
  await ctx.close();
  return n;
}

/** The concept nav on a card of a book with several concepts: the list opens as a sheet that fits the screen, and a pick changes the card. */
async function conceptNav(w: number, h: number) {
  const { ctx, page } = await newPhone(w, h);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(2500);
  const c = data.concepts.find((x) => x.id === 'escalation')!;
  await open(page, `#book/${c.bookIds[0]}/escalation`, c.name);
  await tap(page, '.cnav .pick');
  await page.waitForSelector('.clist.pop');
  const box = (await page.evaluate(`(() => { const e = document.querySelector('.clist.pop'); const b = e.getBoundingClientRect(); const items = Array.from(e.querySelectorAll('button')).map((x) => x.getBoundingClientRect().height); return { l: b.left, r: b.right, t: b.top, b: b.bottom, min: Math.min(...items), n: items.length }; })()`)) as { l: number; r: number; t: number; b: number; min: number; n: number };
  if (box.l < 0 || box.r > w + 0.5 || box.t < 0 || box.b > h + 0.5) fail(`${w} concept list`, `the list is outside the screen: ${JSON.stringify(box)}`);
  if (box.min < 43.5) fail(`${w} concept list`, `a row is ${box.min}px high`);
  // Next concept by touch.
  await tap(page, '.clist.pop button:not(.sel)');
  await page.waitForTimeout(500);
  const shown = await page.textContent('.c-name');
  if (shown === c.name) fail(`${w} concept list`, 'picking another concept did not change the card');
  await tap(page, '.cnav .step:not(:disabled)');
  await page.waitForTimeout(400);
  await ctx.close();
}

async function homeAt(w: number, h: number, dsf: number) {
  const { ctx, page, errors } = await newPhone(w, h, dsf);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(3000);
  const where = `home ${w}`;
  const m = (await page.evaluate(`${MEASURE}('home')`)) as Measure;
  judge(where, m);
  report.targets += m.targetCount;
  if (m.docScrollH <= m.vh) fail(where, 'the page does not scroll');
  const stage = m.blocks['[data-stage]'];
  if (!stage) fail(where, 'no shelf block');
  else if (stage[2] !== m.vw) fail(where, `the shelf is ${stage[2]}px wide in ${m.vw}px`);
  // Stage 4B: the order down the page is title, search, video, category nav, shelf, theme index, then the view toggle and the footer; nothing sticks out.
  const order = (await page.evaluate(`(() => {
    const names = [['.wall-head', 'title'], ['.search-wrap', 'search'], ['.frame', 'video'], ['.chips', 'nav'], ['[data-stage]', 'shelf'], ['.plaque', 'themes'], ['.view-toggle', 'toggle'], ['.credit', 'footer']];
    return names.map(([s, n]) => { const b = document.querySelector(s).getBoundingClientRect(); return { n, top: b.top + scrollY, bottom: b.bottom + scrollY, left: b.left, right: b.right }; });
  })()`)) as { n: string; top: number; bottom: number; left: number; right: number }[];
  for (let i = 1; i < order.length; i++) if (order[i]!.top < order[i - 1]!.bottom - 0.5) fail(where, `${order[i]!.n} is not below ${order[i - 1]!.n}`);
  for (const o of order) if (o.right > w + 0.5 || o.left < -0.5) fail(where, `${o.n} sticks out (${Math.round(o.left)}..${Math.round(o.right)}px)`);
  const navTop = order.find((o) => o.n === 'nav')!;
  const shelfTop = order.find((o) => o.n === 'shelf')!;
  if (shelfTop.top - navTop.bottom > 24) fail(where, `the category nav is ${Math.round(shelfTop.top - navTop.bottom)}px above the shelf`);
  // The timeline under the video is gone.
  if (await page.evaluate(`getComputedStyle(document.querySelector('.timeline')).display !== 'none'`)) fail(where, 'the timeline is shown');
  // The theme index: one column, one theme per row, at least 44px, no cut title; "also" rows likewise.
  const rows = (await page.evaluate(`(() => {
    const rect = (e) => e.getBoundingClientRect();
    const idx = Array.from(document.querySelectorAll('.idx'));
    const also = Array.from(document.querySelectorAll('.also button'));
    const cut = idx.filter((e) => { const t = e.querySelector('.t'); return t.scrollWidth > t.clientWidth + 1 || getComputedStyle(t).textOverflow === 'ellipsis' && t.scrollWidth > t.clientWidth; }).length;
    return {
      idxN: idx.length, idxLefts: new Set(idx.map((e) => Math.round(rect(e).left))).size, idxTops: new Set(idx.map((e) => Math.round(rect(e).top))).size, idxMin: Math.min(...idx.map((e) => rect(e).height)),
      idxLines: idx.map((e) => { const t = e.querySelector('.t'); return Math.round(rect(t).height / parseFloat(getComputedStyle(t).lineHeight)); }), cut,
      alsoN: also.length, alsoLefts: new Set(also.map((e) => Math.round(rect(e).left))).size, alsoTops: new Set(also.map((e) => Math.round(rect(e).top))).size, alsoMin: Math.min(...also.map((e) => rect(e).height)),
    };
  })()`)) as { idxN: number; idxLefts: number; idxTops: number; idxMin: number; idxLines: number[]; cut: number; alsoN: number; alsoLefts: number; alsoTops: number; alsoMin: number };
  if (rows.idxN !== 10 || rows.idxLefts !== 1 || rows.idxTops !== rows.idxN) fail(where, `the theme index is not one column of one theme per row: ${JSON.stringify(rows)}`);
  if (rows.idxMin < 43.5) fail(where, `an index row is ${rows.idxMin}px high`);
  if (rows.cut) fail(where, `${rows.cut} index titles are cut`);
  if (rows.alsoN < 1 || rows.alsoLefts !== 1 || rows.alsoTops !== rows.alsoN) fail(where, `"Also in the conversation" is not one entry per row: ${JSON.stringify(rows)}`);
  if (rows.alsoMin < 43.5) fail(where, `an "also" entry is ${rows.alsoMin}px high`);
  // The whole bookcase is inside the canvas width (front face projected), both sides, with a small margin.
  const cm = (await page.evaluate(`(() => { const cv = document.querySelector('canvas').getBoundingClientRect(); const c = window.__case;
    const p = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => window.__project(x, y, c.depth));
    const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
    return { left: Math.min(...xs), right: cv.width - Math.max(...xs), top: Math.min(...ys), bottom: cv.height - Math.max(...ys) }; })()`)) as Record<string, number>;
  if (cm.left! < 4 || cm.right! < 4 || cm.top! < 0 || cm.bottom! < 0) fail(where, `the bookcase is cut: margins ${JSON.stringify(cm)}`);
  // Stage 4C: the block is fitted to the case: at most 16px of wall above and 16px of floor below (the case fills the width on phones;
  // on the tablet the block is at its height limit and the case is as high as the block allows).
  if (cm.top! > 16.5 || cm.bottom! > 16.5) fail(where, `empty wall/floor around the bookcase: margins ${JSON.stringify(cm)}`);
  // The category nav scrolls inside its own row; the edges with more chips fade (none when everything fits).
  const chips = (await page.evaluate(`(() => { const e = document.querySelector('.chips'); const f = (e.className.match(/fade-[lr]/g) || []).sort().join(' '); return [e.scrollWidth, e.clientWidth, e.getBoundingClientRect().right, f]; })()`)) as [number, number, number, string];
  if (chips[2] > w + 0.5) fail(where, 'the category nav sticks out');
  const want = chips[0] > chips[1] + 2 ? 'fade-r' : '';
  if (chips[3] !== want) fail(where, `the nav fade at the start is "${chips[3]}", expected "${want}"`);
  if (chips[0] > chips[1] + 2) {
    const fades: string[] = [];
    for (const pos of [(chips[0] - chips[1]) / 2, chips[0]]) {
      await page.evaluate(`document.querySelector('.chips').scrollLeft = ${pos}`);
      // The class follows the scroll event: wait for it to settle (a loaded machine can take longer than a fixed pause).
      await page.waitForFunction(`document.querySelector('.chips').className.includes('fade-l')`, undefined, { timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(250);
      fades.push((await page.evaluate(`(document.querySelector('.chips').className.match(/fade-[lr]/g) || []).sort().join(' ')`)) as string);
    }
    if (fades[0] !== 'fade-l fade-r') fail(where, `the nav fade in the middle is "${fades[0]}"`);
    if (fades[1] !== 'fade-l') fail(where, `the nav fade at the end is "${fades[1]}"`);
    await page.evaluate(`document.querySelector('.chips').scrollLeft = 0`);
    await page.waitForTimeout(250);
    if ((await page.evaluate(`(document.querySelector('.chips').className.match(/fade-[lr]/g) || []).join('')`)) !== 'fade-r') fail(where, 'the nav fade did not come back at the start');
  }
  errors.slice(0, 3).forEach((e) => fail(where, `page error: ${e}`));
  report.home.push({ w, docScrollH: m.docScrollH, shelf: stage, chips: chips.slice(0, 2), caseMargins: cm, index: rows, targets: m.targetCount });
  await ctx.close();
}

/** The case's front face on screen, relative to the canvas: the margins on the four sides, px. */
const CASE_MARGINS = `(() => { const cv = document.querySelector('canvas').getBoundingClientRect(); const c = window.__case;
  const p = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => window.__project(x, y, c.depth));
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  return { left: Math.min(...xs), right: cv.width - Math.max(...xs), top: Math.min(...ys), bottom: cv.height - Math.max(...ys), h: cv.height }; })()`;

/** Stage 4C: the results of a search (mocked) under the search pill; and the quiet lines. */
async function searchAt(w: number, h: number) {
  const where = `search ${w}`;
  const box = (sel: string) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY, left: b.left, right: b.right, h: b.height }; })()`;
  type Box = { top: number; bottom: number; left: number; right: number; h: number } | null;

  // 1. Results.
  {
    const { ctx, page, errors } = await newPhone(w, h);
    await mockSearch(page, 'results');
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForSelector('.app.ready', { timeout: 60000 });
    await page.waitForTimeout(2500);
    const frameBefore = (await page.evaluate(box('.frame'))) as Box;
    await tap(page, '.search input');
    await page.fill('.search input', 'agent drift');
    await page.keyboard.press('Enter');
    try {
      await page.waitForSelector('.search-wrap .results.stacked .res', { timeout: 8000 });
    } catch {
      fail(where, 'no results under the search box');
      await ctx.close();
      return;
    }
    await page.waitForTimeout(600);
    const pill = (await page.evaluate(box('.search'))) as Box;
    const list = (await page.evaluate(box('.results.stacked'))) as Box;
    const frame = (await page.evaluate(box('.frame'))) as Box;
    const rows = (await page.evaluate(`Array.from(document.querySelectorAll('.results.stacked .res')).map((e) => { const b = e.getBoundingClientRect(); return { h: b.height, l: b.left, r: b.right }; })`)) as { h: number; l: number; r: number }[];
    if (!pill || !list || !frame || !frameBefore) return fail(where, 'missing boxes');
    if (list.top < pill.bottom - 0.5 || list.top - pill.bottom > 24) fail(where, `the list starts ${Math.round(list.top - pill.bottom)}px below the search pill`);
    if (frame.top < list.bottom - 0.5) fail(where, 'the video is not below the list');
    if (frame.top - frameBefore.top < list.h - 2) fail(where, `the list did not push the video down (${Math.round(frame.top - frameBefore.top)}px for ${Math.round(list.h)}px)`);
    if (rows.length !== 4) fail(where, `${rows.length} result rows, expected the 4 above the 30% bar`);
    if (rows.some((r) => r.h < 44)) fail(where, `a result row is ${Math.min(...rows.map((r) => r.h))}px high`);
    if (rows.some((r) => r.l < -0.5 || r.r > w + 0.5)) fail(where, 'a result row sticks out of the screen');
    if (await page.$('.plaque .results')) fail(where, 'the results are also in the theme card');
    if (!(await page.$('.plaque .pane:not(.off) .index'))) fail(where, 'the theme index is not shown while the results are under the search box');
    if (!(await page.$('.app.dim'))) fail(where, 'the books do not glow while the list is shown');
    const m = (await page.evaluate(`${MEASURE}('home')`)) as Measure;
    judge(`${where} (results)`, m);
    report.search.push({ w, pill, list, frameBefore: frameBefore.top, frame: frame.top, rows: rows.map((r) => r.h) });
    // A tap on a row opens the card, in the right concept.
    await page.tap('.results.stacked .res:nth-child(2)');
    try {
      await page.waitForFunction(`document.querySelector('.book-panel.visible .c-name')?.textContent !== undefined && document.querySelector('.book-panel.visible .c-name').textContent.length > 0`, undefined, { timeout: 15000 });
    } catch {
      fail(where, 'tapping a result did not open the card');
    }
    const name = await page.textContent('.book-panel.visible .c-name').catch(() => null);
    const want = data.concepts.find((c) => c.id === MOCK_IDS[1])!.name;
    if (name !== want) fail(where, `tapping the second result opened "${name}", expected "${want}"`);
    await page.waitForTimeout(700);
    await tap(page, '.page-close');
    await page.waitForFunction(`!document.querySelector('.book-panel.visible')`, undefined, { timeout: 10000 }).catch(() => fail(where, '✕ did not close the card'));
    await page.waitForTimeout(1200);
    if (!(await page.$('.results.stacked .res'))) fail(where, 'the list is gone after the card was closed');
    // Clearing removes it, and the video is back where it was.
    await page.evaluate(`window.scrollTo(0, 0)`);
    await page.waitForTimeout(200);
    await page.tap('.search .x');
    await page.waitForTimeout(500);
    if (await page.$('.results')) fail(where, 'clearing the search left the list');
    const frameAfter = (await page.evaluate(box('.frame'))) as Box;
    if (frameAfter && Math.abs(frameAfter.top - frameBefore.top) > 1) fail(where, `the video did not return after clearing (${frameBefore.top} -> ${frameAfter.top})`);
    if (await page.$('.app.dim')) fail(where, 'the books still glow after clearing');
    errors.slice(0, 3).forEach((e) => fail(where, `page error: ${e}`));
    await ctx.close();
  }

  // 2. The quiet lines: "nothing fits" (in the list's place) and "not connected" (under the pill, as before), both above the video.
  for (const [mode, text] of [['nothing', 'Nothing here fits'], ['no_key', 'not connected']] as [SearchMock, string][]) {
    const { ctx, page } = await newPhone(w, h);
    await mockSearch(page, mode);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForSelector('.app.ready', { timeout: 60000 });
    await page.waitForTimeout(2500);
    await tap(page, '.search input');
    await page.fill('.search input', 'something unrelated to anything');
    await page.keyboard.press('Enter');
    try {
      await page.waitForFunction(`document.querySelector('.search-wrap .qnote')?.textContent.includes(${JSON.stringify(text)})`, undefined, { timeout: 8000 });
    } catch {
      fail(`${where} ${mode}`, `no "${text}" line under the search box`);
      await ctx.close();
      continue;
    }
    const pill = (await page.evaluate(box('.search'))) as Box;
    const note = (await page.evaluate(box('.search-wrap .qnote'))) as Box;
    const frame = (await page.evaluate(box('.frame'))) as Box;
    if (!pill || !note || !frame) fail(`${where} ${mode}`, 'missing boxes');
    else {
      if (note.top < pill.bottom - 0.5 || note.top - pill.bottom > 24) fail(`${where} ${mode}`, `the line is ${Math.round(note.top - pill.bottom)}px below the pill`);
      if (frame.top < note.bottom) fail(`${where} ${mode}`, 'the video is not below the line');
      if (note.right > w + 0.5) fail(`${where} ${mode}`, 'the line sticks out of the screen');
    }
    await ctx.close();
  }
}

/** Stage 4C: picking a theme scrolls the shelf block to the top of the window. */
async function themeScrollAt(w: number, h: number) {
  const where = `theme scroll ${w}`;
  const stageTop = `document.querySelector('[data-stage]').getBoundingClientRect().top`;
  const idx = (k: string) => `.idx:nth-child(${k})`;
  const run = async (reduced: boolean) => {
    const tag = reduced ? `${where} (reduced motion)` : where;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForSelector('.app.ready', { timeout: 60000 });
    await page.waitForTimeout(2500);
    // From the theme index, which is below the shelf.
    await page.evaluate(`document.querySelector('${idx('8')}').scrollIntoView({ block: 'center' })`);
    await page.waitForTimeout(300);
    const y0 = (await page.evaluate(`scrollY`)) as number;
    await page.tap(idx('8'));
    if (reduced) {
      await page.waitForTimeout(120);
      const top = (await page.evaluate(stageTop)) as number;
      if (Math.abs(top - 8) > 2) fail(tag, `with reduced motion the shelf block is ${Math.round(top)}px from the top right after the tap (expected a jump to 8)`);
    } else {
      await page.waitForTimeout(60);
      const mid = (await page.evaluate(`scrollY`)) as number;
      if (Math.abs(mid - y0) < 1) fail(tag, 'the page did not start to scroll');
      await page.waitForTimeout(1600);
    }
    const top = (await page.evaluate(stageTop)) as number;
    const y1 = (await page.evaluate(`scrollY`)) as number;
    if (top < 0 || top > 16) fail(tag, `after the tap the shelf block's top is ${Math.round(top)}px from the top of the window`);
    if (y1 >= y0) fail(tag, `the page did not scroll up to the shelf (${y0} -> ${y1})`);
    const on = await page.getAttribute(idx('8'), 'aria-pressed');
    if (on !== 'true') fail(tag, 'theme 8 is not selected');
    if (!(await page.$('.app.dim'))) fail(tag, 'the books are not lit after the tap');
    const stage = (await page.evaluate(`(() => { const b = document.querySelector('[data-stage]').getBoundingClientRect(); return [b.top, b.bottom, innerHeight]; })()`)) as number[];
    if (stage[1]! > stage[2]! + 0.5) fail(tag, `the shelf block does not fit in the window (${Math.round(stage[1]!)} > ${stage[2]})`);
    if (!reduced) report.themeScroll.push({ w, from: y0, to: y1, stageTop: Math.round(top * 10) / 10 });
    // Tapping the active theme again turns it off and does not scroll.
    await page.evaluate(`document.querySelector('${idx('8')}').scrollIntoView({ block: 'center' })`);
    await page.waitForTimeout(400);
    const y2 = (await page.evaluate(`scrollY`)) as number;
    await page.tap(idx('8'));
    await page.waitForTimeout(1200);
    const y3 = (await page.evaluate(`scrollY`)) as number;
    if (Math.abs(y3 - y2) > 1) fail(tag, `turning the theme off scrolled the page (${y2} -> ${y3})`);
    if ((await page.getAttribute(idx('8'), 'aria-pressed')) !== 'false') fail(tag, 'the second tap did not turn the theme off');
    // A theme under "Also in the conversation" scrolls too.
    if (!reduced) {
      await page.evaluate(`document.querySelector('.also .row button').scrollIntoView({ block: 'center' })`);
      await page.waitForTimeout(400);
      const y4 = (await page.evaluate(`scrollY`)) as number;
      await page.tap('.also .row button');
      await page.waitForTimeout(1800);
      const top2 = (await page.evaluate(stageTop)) as number;
      if (top2 < 0 || top2 > 16) fail(tag, `"also": the shelf block's top is ${Math.round(top2)}px from the top of the window after the tap`);
      if (((await page.evaluate(`scrollY`)) as number) >= y4) fail(tag, '"also": the page did not scroll up');
    }
    await ctx.close();
  };
  await run(false);
  await run(true);
  // A theme set without a tap (the deep link here; the video's follow loop calls the same setter and not the tap handler) does not scroll.
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${base}/?t=8`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(3000);
  if ((await page.evaluate(`scrollY`)) !== 0) fail(where, 'a theme set from the link scrolled the page');
  if (!(await page.$('.app.dim'))) fail(where, 'the link theme does not light the books');
  await ctx.close();
}

/** Stage 4C: the block is refitted when the window is resized or turned. */
async function resizeAt() {
  const { ctx, page } = await newPhone(390, 844);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(2500);
  const seen: unknown[] = [];
  for (const [w, h, name] of [[390, 844, 'portrait 390'], [430, 932, 'resized to 430'], [375, 812, 'resized to 375'], [844, 390, 'turned: landscape 844x390'], [390, 844, 'turned back']] as [number, number, string][]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(2500);
    const cm = (await page.evaluate(CASE_MARGINS)) as Record<string, number>;
    seen.push({ name, ...Object.fromEntries(Object.entries(cm).map(([k, v]) => [k, Math.round(v * 10) / 10])) });
    if (cm.left! < 4 || cm.right! < 4 || cm.top! < 0 || cm.bottom! < 0) fail(`resize ${name}`, `the bookcase is cut: ${JSON.stringify(cm)}`);
    if (w < 500 && h > w && (cm.top! > 16.5 || cm.bottom! > 16.5)) fail(`resize ${name}`, `empty wall/floor after the resize: ${JSON.stringify(cm)}`);
    if (w > h && (cm.top! > 16.5 || cm.bottom! > 16.5)) fail(`resize ${name}`, `empty wall/floor: ${JSON.stringify(cm)}`);
  }
  report.resize = seen;
  await ctx.close();
}

/** Tap a book on the shelf; the card opens; the player stays; ✕ closes. */
async function touchFlow(w: number, h: number) {
  const { ctx, page, errors } = await newPhone(w, h);
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(3500);
  const where = `touch ${w}`;
  await page.evaluate(`(() => { const f = document.querySelector('.wall iframe'); if (f) f.__keep = true; document.querySelector('[data-stage]').scrollIntoView({ block: 'center' }); })()`);
  await page.waitForTimeout(500);
  // A book near the middle of the shelf block, tapped where it is on screen.
  const spot = (await page.evaluate(`(() => {
    const id = window.__centreBook();
    const p = window.__bookPos(id);
    const b = document.querySelector('canvas').getBoundingClientRect();
    return { id, x: b.left + p.x, y: b.top + p.y };
  })()`)) as { id: string; x: number; y: number };
  await page.touchscreen.tap(spot.x, spot.y);
  try {
    await page.waitForSelector('.book-panel.visible .card', { timeout: 15000 });
  } catch {
    fail(where, `tapping book ${spot.id} at (${Math.round(spot.x)}, ${Math.round(spot.y)}) did not open a card`);
    await ctx.close();
    return;
  }
  await page.waitForTimeout(800);
  const locked = await page.evaluate(`getComputedStyle(document.body).overflowY`);
  if (locked !== 'hidden') fail(where, `the page behind the card can scroll (body overflow ${locked})`);
  // The player is still the same element, and there is only one.
  const kept = (await page.evaluate(`(() => { const f = document.querySelectorAll('.wall iframe'); return [f.length, f[0] ? !!f[0].__keep : null]; })()`)) as [number, boolean | null];
  if (kept[0] !== 1 || kept[1] === false) fail(where, `the video player was replaced (${JSON.stringify(kept)})`);
  await tap(page, '.page-close');
  await page.waitForFunction(`!document.querySelector('.book-panel.visible')`, undefined, { timeout: 10000 }).catch(() => fail(where, '✕ did not close the card'));
  await page.waitForTimeout(1500);
  const after = (await page.evaluate(`(() => { const f = document.querySelectorAll('.wall iframe'); return [f.length, f[0] ? !!f[0].__keep : null, getComputedStyle(document.body).overflowY]; })()`)) as [number, boolean | null, string];
  if (after[0] !== 1 || after[1] === false) fail(where, `the video player was replaced after closing (${JSON.stringify(after)})`);
  if (after[2] === 'hidden') fail(where, 'the page is still locked after closing');
  errors.slice(0, 3).forEach((e) => fail(where, `page error: ${e}`));
  report.touch = `tapped ${spot.id}: card opened, player kept, closed`;
  await ctx.close();
}

/** The board with three pins. */
async function board(w: number, h: number) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pins = data.concepts.slice(0, 3).map((c) => c.id);
  await ctx.addInitScript(`localStorage.setItem('agentic-board', ${JSON.stringify(JSON.stringify(pins))})`);
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(2500);
  await tap(page, '.board-btn');
  await page.waitForSelector('.overlay.show .note');
  await page.waitForTimeout(400);
  const where = `board ${w}`;
  const m = (await page.evaluate(`${MEASURE}('board')`)) as Measure;
  judge(where, m);
  report.targets += m.targetCount;
  await tap(page, '.board .close');
  await page.waitForTimeout(300);
  if (await page.$('.overlay.show')) fail(where, '✕ did not close the board');
  await ctx.close();
}

const all = data.concepts.map((c) => c.id).filter((id) => !only || only.has(id));
const t0 = Date.now();
report.cards = await cards(390, 844, all);
console.log(`cards at 390: ${report.cards} cards, ${report.tabs} tabs, ${failures.length} failures (${Math.round((Date.now() - t0) / 1000)}s)`);
if (!process.env.QUICK) {
  for (const [w, h] of [[375, 812], [430, 932], [768, 1024]] as [number, number][]) {
    const n = await cards(w, h, ['socratic-method', 'commander-intent', 'escalation']);
    report.samples.push({ w, cards: n });
  }
}
await conceptNav(390, 844);
await conceptNav(375, 812);
for (const [w, h, d] of [[375, 812, 3], [390, 844, 3], [430, 932, 3], [768, 1024, 2]] as [number, number, number][]) await homeAt(w, h, d);
await searchAt(390, 844);
await searchAt(375, 812);
await themeScrollAt(390, 844);
await themeScrollAt(375, 812);
await themeScrollAt(768, 1024);
await resizeAt();
await touchFlow(390, 844);
await board(390, 844);
await board(768, 1024);
await browser.close();

await writeFile(out, JSON.stringify({ report, failures }, null, 1));
console.log(`\nmobile audit: ${report.cards} cards at 390x844 (${report.tabs} tabs opened in all runs), ${report.targets} controls checked, home at 4 widths, touch flow: ${report.touch || 'FAILED'}`);
console.log(failures.length ? `${failures.length} FAILURES` : '0 failures');
failures.slice(0, 80).forEach((f) => console.log('  ' + f));
process.exit(failures.length ? 1 : 0);
