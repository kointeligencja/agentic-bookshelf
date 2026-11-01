// Hovers every shelf book in each view and checks the tooltip names it. Usage: npx tsx scripts/hover-audit.ts [baseUrl] [outDir]
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import type { Library } from '../src/types.ts';

const base = process.argv[2] ?? 'http://localhost:5317';
const out = path.resolve(process.argv[3] ?? 'screenshots');
await mkdir(out, { recursive: true });
const library = JSON.parse(await readFile('public/data/books.json', 'utf8')) as Library;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1512, height: 900 }, deviceScaleFactor: 1 });
const wait = (ms: number) => page.waitForTimeout(ms);
const clean = (t: string) => t.replace(/\s*\(.*?\)\s*$/, '');
let checked = 0;
const wrong: string[] = [];
const seen = new Set<string>();
for (const view of ['spines', 'covers'] as const) {
  await page.goto(`${base}/?view=${view}`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 30000 });
  await wait(3000);
  await page.screenshot({ path: path.join(out, `audit-${view}-overview.png`) });
  {
    // The camera is still and shows the whole case: every book is hovered where it stands.
    const books = library.books.filter((b) => b.shelf === 'read');
    for (const b of books) {
      const p = await page.evaluate((id) => (globalThis as any).__bookPos(id), b.id);
      if (!p || p.x < 20 || p.y < 60 || p.x > 1490 || p.y > 880) continue;
      // Let the previous book settle back first: while it is still tilted out it can cover this one.
      await page.mouse.move(5, 5);
      await wait(350);
      await page.mouse.move(p.x, p.y);
      await wait(150);
      const tt = await page.evaluate(() => (globalThis as any).document.querySelector('.tooltip.visible .tt-title')?.textContent ?? null);
      checked++;
      seen.add(`${view}:${b.id}`);
      if (tt !== clean(b.title)) wrong.push(`${view} ${b.id} expected "${clean(b.title)}" got "${tt}"`);
    }
    await page.mouse.move(5, 5);
  }
}
console.log(`checked ${checked} hovers (${seen.size} book/view pairs), ${wrong.length} wrong`);
for (const w of wrong) console.log('  ' + w);
await browser.close();
