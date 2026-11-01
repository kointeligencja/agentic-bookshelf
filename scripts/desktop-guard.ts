// Desktop guard: records the layout of the home page and of the Socrates and escalation cards (every tab) at desktop sizes
// (bounding boxes of the main blocks, computed font sizes) as JSON, and compares two recordings (+-1px). Needs `npx vite --port 5181` running.
// Usage: npx tsx scripts/desktop-guard.ts record <out.json> [baseUrl]
//        npx tsx scripts/desktop-guard.ts compare <before.json> <after.json>
// Env: CHROME_BIN = a Chromium executable to use instead of Playwright's own.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';

const SIZES: [number, number][] = [
  [1280, 800],
  [1440, 900],
  [2000, 1150],
];
const CARDS = [
  { id: 'socratic-method', book: '900000017' },
  { id: 'escalation', book: '900000028' },
];
/** Blocks whose boxes are recorded, by selector (every match, in document order). */
const HOME_BLOCKS = ['.wall', '.wall-head', '.wall h1', '.wall .sub', '.search input', '.frame', '.video', '.timeline', '.plaque', '.idx', '.also', '.now', '.chips', '.chip', '.board-btn', '.view-toggle', '.view-toggle button', '.credit', 'canvas'];
const CARD_BLOCKS = [
  '.book-panel', '.card', '.c-head', '.c-by', '.c-name', '.c-sum', '.c-chips', '.theme.mini', '.c-ctl', '.cnav', '.cnav button', '.page-close', '.band', '.b-idea', '.b-idea p', '.b-apply', '.b-apply p',
  '.c-tabs', '.c-tabs [role="tab"]', '.c-pager', '.c-panel', '.c-panel .tb', '.c-panel .tb > .mc:not(.tb-measure)', '.m-head', '.m-cols', '.m-col', '.m-step', '.q-cols', '.q-col', '.q-quote', '.q-line', '.ts', '.c-foot', '.status', '.pin',
];
/** Elements whose computed font is recorded. */
const FONTS = ['.wall h1', '.wall .sub', '.search input', '.idx', '.now h2', '.now p', '.chip', '.board-btn', '.view-toggle button', '.credit', '.c-by', '.c-name', '.c-sum', '.theme.mini', '.label', '.b-idea p', '.b-apply p', '.c-tabs [role="tab"]', '.mc p', '.m-intro', '.m-step span', '.m-step b', '.q-quote p', '.q-line p', '.q-quote small', '.ts', '.status', '.pin', '.cnav .pick'];

type Box = [number, number, number, number];
type Shot = { boxes: Record<string, Box[]>; fonts: Record<string, string[]> };
type Rec = Record<string, Shot>;

const read = (blocks: string[], fonts: string[]) => `((blocks, fonts) => {
  const boxes = {}, fs = {};
  const vis = (e) => !e.closest('.tb-measure') && e.getClientRects().length > 0;
  for (const s of blocks) {
    boxes[s] = Array.from(document.querySelectorAll(s)).filter(vis).map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10); });
  }
  for (const s of fonts) {
    fs[s] = Array.from(document.querySelectorAll(s)).filter(vis).map((e) => { const c = getComputedStyle(e); return c.fontSize + '/' + c.lineHeight + '/' + c.fontWeight + '/' + c.fontFamily.split(',')[0]; });
  }
  return { boxes, fonts: fs };
})(${JSON.stringify(blocks)}, ${JSON.stringify(fonts)})`;

async function shoot(page: Page, blocks: string[], fonts: string[]): Promise<Shot> {
  return (await page.evaluate(read(blocks, fonts))) as Shot;
}

async function record(out: string, base: string) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const rec: Rec = {};
  for (const [w, h] of SIZES) {
    const open = async (hash: string) => {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.goto(`${base}/${hash}`, { waitUntil: 'load' });
      await page.waitForSelector('.app.ready', { timeout: 60000 });
      return page;
    };
    const home = await open('');
    await home.waitForTimeout(3000);
    rec[`home@${w}x${h}`] = await shoot(home, HOME_BLOCKS, FONTS);
    await home.close();
    for (const c of CARDS) {
      const page = await open(`#book/${c.book}/${c.id}`);
      await page.waitForSelector('.book-panel.visible .card[data-tab]', { timeout: 30000 });
      await page.waitForTimeout(3500);
      const tabs = (await page.evaluate(`Array.from(document.querySelectorAll('.c-tabs [role="tab"]')).map((e) => e.dataset.tab)`)) as string[];
      for (const t of tabs) {
        await page.click(`.c-tabs [role="tab"][data-tab="${t}"]`);
        await page.waitForTimeout(500);
        rec[`${c.id}/${t}@${w}x${h}`] = await shoot(page, CARD_BLOCKS, FONTS);
      }
      await page.close();
    }
  }
  await browser.close();
  await writeFile(out, JSON.stringify(rec, null, 1));
  console.log(`recorded ${Object.keys(rec).length} layouts to ${out}`);
}

async function compare(a: string, b: string) {
  const A = JSON.parse(await readFile(a, 'utf8')) as Rec;
  const B = JSON.parse(await readFile(b, 'utf8')) as Rec;
  const diffs: string[] = [];
  let compared = 0;
  for (const key of Object.keys(A)) {
    const x = A[key]!;
    const y = B[key];
    if (!y) {
      diffs.push(`${key}: missing in after`);
      continue;
    }
    for (const sel of Object.keys(x.boxes)) {
      const p = x.boxes[sel]!;
      const q = y.boxes[sel] ?? [];
      if (p.length !== q.length) {
        diffs.push(`${key} ${sel}: ${p.length} boxes before, ${q.length} after`);
        continue;
      }
      p.forEach((bp, i) => {
        compared++;
        const bq = q[i]!;
        if (bp.some((n, k) => Math.abs(n - bq[k]!) > 1)) diffs.push(`${key} ${sel}[${i}]: ${bp.join(',')} -> ${bq.join(',')}`);
      });
    }
    for (const sel of Object.keys(x.fonts)) {
      const p = x.fonts[sel]!;
      const q = y.fonts[sel] ?? [];
      compared++;
      if (p.length !== q.length || p.some((f, i) => f !== q[i])) diffs.push(`${key} font ${sel}: ${p[0] ?? '-'} (${p.length}) -> ${q[0] ?? '-'} (${q.length})`);
    }
  }
  console.log(`desktop guard: ${Object.keys(A).length} layouts, ${compared} comparisons, ${diffs.length} differences`);
  diffs.slice(0, 60).forEach((d) => console.log('  ' + d));
  process.exit(diffs.length ? 1 : 0);
}

const [cmd, one, two] = process.argv.slice(2);
if (cmd === 'record' && one) await record(one, two ?? 'http://localhost:5181');
else if (cmd === 'compare' && one && two) await compare(one, two);
else throw new Error('usage: desktop-guard.ts record <out.json> [baseUrl] | compare <before.json> <after.json>');
