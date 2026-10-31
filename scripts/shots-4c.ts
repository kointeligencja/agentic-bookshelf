// Stage 4C screenshots at 390x844 (needs `npx vite --port 5181` running): the home page (full page), the viewport with mocked search results under the
// search pill, and the viewport right after tapping theme 8 in the index (the shelf scrolled into view, the books lit).
// Usage: npx tsx scripts/shots-4c.ts <out dir> [baseUrl]   Env: CHROME_BIN.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { mockSearch } from './mobile-search-mock.ts';

const dir = process.argv[2] ?? '/tmp/shots-4c';
const base = process.argv[3] ?? 'http://localhost:5181';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(search = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  if (search) await mockSearch(page, 'results');
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForTimeout(3500);
  return { ctx, page };
}

{
  const { ctx, page } = await open();
  await page.screenshot({ path: `${dir}/home-390-full.png`, fullPage: true });
  // Right after the tap on theme 8: the page scrolls by itself; the shot is taken once the scroll and the glow have settled.
  await page.evaluate(`document.querySelector('.idx:nth-child(8)').scrollIntoView({ block: 'center' })`);
  await page.waitForTimeout(400);
  await page.tap('.idx:nth-child(8)');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${dir}/theme8-390-viewport.png`, fullPage: false });
  await ctx.close();
}
{
  const { ctx, page } = await open(true);
  await page.tap('.search input');
  await page.fill('.search input', 'my agent keeps drifting');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.results.stacked .res');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/search-390-viewport.png`, fullPage: false });
  await ctx.close();
}
await browser.close();
