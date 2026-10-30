// Opens every concept card at each viewport and checks that it is exactly one screen: the page does not scroll, the
// card's body does not overflow, the skeleton (lead, Idea, Why it works, With your agent) is never clamped. Records the
// clamp level each card ends up at. Then opens each of a card's "more" views once and checks those too (paging is
// allowed there). Writes /tmp/card-audit.json and prints a summary.
// Usage: npx tsx scripts/card-audit.ts [baseUrl] [WxH,WxH,...]   (needs `npx vite --port 5181` running)
// Env: CHROME_BIN = a Chromium executable to use instead of Playwright's own; CARD_W = a panel width in px to try
// in place of the one the app computes (what-if only, the camera does not follow); OUT = the JSON file.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { sectionBlocks, sectionsOf, type SectionId } from '../src/lib/card.ts';
import type { Agentic, AgenticCard } from '../src/types.ts';

const base = process.argv[2] ?? 'http://localhost:5181';
const sizes = (process.argv[3] ?? '1280x800,1440x900').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const out = process.env.OUT ?? '/tmp/card-audit.json';
const MORE_AT = '1280x800';
const doMore = process.env.MORE !== '0';

const data = JSON.parse(await readFile('public/data/agentic.json', 'utf8')) as Agentic;
const cards = JSON.parse(await readFile('public/data/agentic-cards.json', 'utf8')) as Record<string, AgenticCard>;

interface Row {
  id: string;
  name: string;
  level: number;
  overflow: boolean;
  cols: number;
  lead: string | null;
  next: number;
  /** Space left at the bottom of the columns, px. */
  free: number;
  /** For a card marked data-overflow: how far its columns run over, px. */
  over: number;
  failures: string[];
}
interface MoreRow {
  id: string;
  sec: string;
  pages: number;
  failures: string[];
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

/** What the page says about the card on screen, as one object. Runs in the page. */
const READ = `(() => {
  const q = (s) => document.querySelector(s);
  const over = (e) => (e ? e.scrollHeight - e.clientHeight : 0);
  const card = q('.card');
  const body = q('.c-body');
  const cols = q('.c-cols');
  const panel = q('.book-panel');
  const doc = document.documentElement;
  const colEls = [...document.querySelectorAll('.c-body .c-col')];
  // Every visible block ends inside its column.
  const cb = cols ? cols.getBoundingClientRect() : null;
  const spill = [...document.querySelectorAll('.c-body .c-col .blk')].filter((b) => cb && b.getBoundingClientRect().bottom > cb.bottom + 0.5).length;
  const last = colEls.map((c) => { const k = c.lastElementChild; return k ? k.getBoundingClientRect().bottom : 0; });
  return {
    view: card && card.dataset.view,
    level: card && card.dataset.level,
    overflow: !!card && card.dataset.overflow !== undefined,
    cols: card && card.dataset.cols,
    name: (q('.c-name') || {}).textContent,
    docScroll: Math.max(doc.scrollHeight - innerHeight, document.body.scrollHeight - innerHeight, doc.scrollWidth - innerWidth),
    over: { card: over(card), body: over(body), cols: over(cols), panel: over(panel), col: Math.max(0, ...colEls.map(over)) },
    spill,
    clampedSkeleton: document.querySelectorAll('.c-body .c-col [data-sk][data-clamped]').length,
    skeletonBlocks: document.querySelectorAll('.c-body .c-col [data-sk]').length,
    lead: q('.c-lead') ? (q('.c-lead').className.includes('quote') ? 'quote' : 'summary') : null,
    leadText: q('.c-lead p') ? q('.c-lead p').textContent.trim().length : 0,
    next: document.querySelectorAll('.c-body > .c-next .c-nrow').length,
    free: cb ? Math.round(cb.bottom - Math.max(0, ...last)) : 0,
    links: [...document.querySelectorAll('.c-body [data-more]')].map((l) => l.getAttribute('data-more')),
    chips: [...document.querySelectorAll('.c-chips .t')].map((t) => t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1),
    ready: !!(card && body && (card.dataset.level !== undefined || card.dataset.view === 'section')),
  };
})()`;

async function open(page: Page, bookId: string, conceptId: string, name: string) {
  await page.evaluate(`window.location.hash = ${JSON.stringify(`#book/${bookId}/${conceptId}`)}`);
  await page.waitForFunction(
    `(() => {
      const c = document.querySelector('.card[data-level]');
      return !!c && document.querySelector('.c-name').textContent === ${JSON.stringify(name)} && c.dataset.view === 'card';
    })()`,
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(90);
}

const result: { viewport: string; cards: Row[]; more: MoreRow[]; clicks: { id: string; failures: string[] }[] }[] = [];
const origin = process.env.CARD_W ? `with the panel at ${process.env.CARD_W}px` : '';

for (const [w, h] of sizes) {
  const vp = `${w}x${h}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.addInitScript('window.__name = (f) => f');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(1500);
  if (process.env.CARD_W) await page.evaluate(`document.documentElement.style.setProperty('--card-w', '${Number(process.env.CARD_W)}px')`);
  const rows: Row[] = [];
  const more: MoreRow[] = [];
  const clicks: { id: string; failures: string[] }[] = [];

  for (const c of data.concepts) {
    const failures: string[] = [];
    const bookId = c.bookIds[0]!;
    try {
      await open(page, bookId, c.id, c.name);
    } catch (e) {
      rows.push({ id: c.id, name: c.name, level: -1, overflow: false, cols: 0, lead: null, next: 0, free: 0, over: 0, failures: [`did not open: ${String(e).slice(0, 80)}`] });
      continue;
    }
    // Again once the fonts and the panel have settled: the level must not move.
    const r = (await page.evaluate(READ)) as any;
    if (r.docScroll > 0) failures.push(`page scrolls by ${r.docScroll}px`);
    // A card marked data-overflow is clipped on purpose: its skeleton does not fit, and it is listed for shortening.
    if (!r.overflow) {
      for (const [k, v] of Object.entries(r.over as Record<string, number>)) if (v > 0) failures.push(`${k} overflows by ${v}px`);
      if (r.spill) failures.push(`${r.spill} block(s) end below the columns`);
    }
    if (r.clampedSkeleton) failures.push('a skeleton block is clamped');
    if (!r.lead || !r.leadText) failures.push('no lead');
    if (!r.skeletonBlocks) failures.push('no skeleton blocks');
    if (r.chips.some((ok: boolean) => !ok)) failures.push('a theme chip is truncated');
    if (r.overflow && r.level !== '6') failures.push(`overflow at level ${r.level}, not 6`);
    rows.push({ id: c.id, name: c.name, level: Number(r.level), overflow: r.overflow, cols: Number(r.cols), lead: r.lead, next: r.next, free: r.free, over: r.overflow ? Math.max(r.over.col, r.over.cols) : 0, failures });

    if (vp !== MORE_AT || !doMore) continue;
    // Each section's view, whole, opened through the dev hook.
    for (const sec of sectionsOf(cards[c.id]) as SectionId[]) {
      const f: string[] = [];
      await page.evaluate(`window.__more(${JSON.stringify(sec)})`);
      try {
        await page.waitForFunction(`document.querySelector('.c-section[data-section="${sec}"] .c-col .blk') !== null`, undefined, { timeout: 8000 });
      } catch {
        f.push('section view did not render');
      }
      await page.waitForTimeout(60);
      const pager = (await page.evaluate(`(document.querySelector('.c-section .c-pager') || {}).textContent || ''`)) as string;
      const pages = Number(/\/\s*(\d+)/.exec(pager)?.[1] ?? 1);
      // Every page fits, and every block of the section is on some page, once.
      const want = sectionBlocks(cards[c.id], sec, Number(r.level) >= 7).length;
      let seen = 0;
      for (let p = 0; p < pages; p++) {
        const m = (await page.evaluate(READ)) as any;
        seen += Number(await page.evaluate(`document.querySelectorAll('.c-section .c-col .blk').length`));
        if (m.docScroll > 0) f.push(`page ${p + 1} scrolls by ${m.docScroll}px`);
        for (const [k, v] of Object.entries(m.over as Record<string, number>)) if (v > 0) f.push(`page ${p + 1}: ${k} overflows by ${v}px`);
        if (m.spill) f.push(`page ${p + 1}: ${m.spill} block(s) end below the columns`);
        if (p < pages - 1) {
          await page.click('.c-section .c-pager button[aria-label="Next page"]');
          await page.waitForTimeout(40);
        }
      }
      if (seen !== want) f.push(`${seen} of ${want} blocks shown across ${pages} page(s)`);
      more.push({ id: c.id, sec, pages, failures: f });
      await page.evaluate('window.__more(null)');
      await page.waitForSelector('.card[data-view="card"] .c-cols', { timeout: 8000 }).catch(() => f.push('did not come back to the card'));
    }

    // The keyboard path through a real link: Enter opens, focus lands on the heading, Esc goes back to the link.
    const link = (await page.evaluate(`(document.querySelector('.c-body [data-more]') || { getAttribute: () => null }).getAttribute('data-more')`)) as string | null;
    if (link) {
      const f: string[] = [];
      await page.focus(`.c-body [data-more="${link}"]`);
      await page.keyboard.press('Enter');
      await page.waitForSelector(`.c-section[data-section="${link}"]`, { timeout: 5000 }).catch(() => f.push('Enter did not open the section'));
      await page.waitForTimeout(80);
      if (!(await page.evaluate(`!!document.activeElement && document.activeElement.matches('.c-xhead h4')`))) f.push('focus is not on the heading');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.card[data-view="card"] .c-cols', { timeout: 5000 }).catch(() => f.push('Esc did not go back'));
      await page.waitForTimeout(80);
      if (!(await page.evaluate(`document.querySelector('.book-panel.visible') !== null`))) f.push('Esc closed the book panel');
      if (!(await page.evaluate(`!!document.activeElement && document.activeElement.getAttribute('data-more') === ${JSON.stringify(link)}`))) f.push('focus did not return to the link');
      clicks.push({ id: c.id, failures: f });
    }
  }
  if (errors.length) rows.push({ id: '(page errors)', name: errors.slice(0, 3).join(' | '), level: -1, overflow: false, cols: 0, lead: null, next: 0, free: 0, over: 0, failures: errors.slice(0, 3) });
  result.push({ viewport: vp, cards: rows, more, clicks });
  await page.close();
}
await browser.close();
await writeFile(out, JSON.stringify({ base, panel: origin || 'as the app sets it', result }, null, 1));

// Summary
let failed = 0;
for (const { viewport, cards: rows, more, clicks } of result) {
  const count: Record<string, number> = {};
  for (const r of rows) count[`L${r.level}`] = (count[`L${r.level}`] ?? 0) + 1;
  const over = rows.filter((r) => r.overflow);
  const bad = rows.filter((r) => r.failures.length);
  const badMore = more.filter((m) => m.failures.length);
  const badClicks = clicks.filter((m) => m.failures.length);
  failed += bad.length + badMore.length + badClicks.length;
  const cols = [...new Set(rows.map((r) => r.cols))].join('/');
  console.log(`\n${viewport} ${origin} (${rows.length} cards, columns: ${cols})`);
  console.log('  clamp levels: ' + Object.entries(count).sort().map(([k, v]) => `${k}=${v}`).join('  '));
  const px = over.map((r) => r.over).sort((a, b) => a - b);
  console.log(`  data-overflow (${over.length}): ${over.map((r) => r.id).join(', ') || 'none'}`);
  if (px.length) console.log(`  ...by how much, px: median ${px[Math.floor(px.length / 2)]}, max ${px.at(-1)}, under 60: ${px.filter((x) => x < 60).length}`);
  console.log(`  read next shown on ${rows.filter((r) => r.next > 0).length} cards`);
  if (more.length) console.log(`  more views opened: ${more.length}, paged: ${more.filter((m) => m.pages > 1).length}, key path checked on ${clicks.length} cards`);
  console.log(`  failures: ${bad.length} cards${more.length ? `, ${badMore.length} more views, ${badClicks.length} key paths` : ''}`);
  for (const r of bad.slice(0, 20)) console.log(`    ${r.id}: ${r.failures.join('; ')}`);
  for (const m of badMore.slice(0, 20)) console.log(`    ${m.id} / ${m.sec}: ${m.failures.join('; ')}`);
  for (const m of badClicks.slice(0, 20)) console.log(`    ${m.id} (key path): ${m.failures.join('; ')}`);
}
console.log(`\nwrote ${out}${failed ? `, ${failed} failing` : ', no failures'}`);
