// Stage 6 screenshots: home, theme on, category on, a pulled-out book (2000x1150 at dpr 2), home at 1440x900, and a 390x844 phone at dpr 3.
// Headless only (Playwright with --headless=new on the real GPU). Usage: npx tsx scripts/static-shots.ts <baseUrl> <outDir> [prefix]
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5181/';
const out = process.argv[3] ?? 'shots';
const prefix = process.argv[4] ?? '';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });

async function open(w: number, h: number, dpr: number, extra = '', mobile = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const sep = base.includes('?') ? '&' : '?';
  await page.goto(`${base}${extra ? sep + extra : ''}`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 40000 });
  await page.waitForTimeout(8000);
  return { ctx, page };
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${out}/${prefix}${name}.png` });

{
  const { ctx, page } = await open(2000, 1150, 2);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1500);
  await shot(page, 'home');
  console.log('gpu', await page.evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); })()`));
  await page.click('.idx >> nth=2');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(3500);
  await shot(page, 'theme');
  await page.click('.idx >> nth=2');
  await page.waitForTimeout(1500);
  await ctx.close();
}
{
  const { ctx, page } = await open(2000, 1150, 2);
  const chip = page.locator('.chip').nth(2);
  await chip.click().catch(() => undefined);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(3500);
  await shot(page, 'category');
  await ctx.close();
}
{
  const { ctx, page } = await open(2000, 1150, 2);
  const visible = () => page.evaluate(`!!document.querySelector('.book-panel.visible')`) as Promise<boolean>;
  for (const [fx, fy] of [[0.65, 0.52], [0.6, 0.45], [0.7, 0.6], [0.55, 0.55], [0.75, 0.45], [0.5, 0.4]] as [number, number][]) {
    await page.mouse.move(2000 * fx, 1150 * fy);
    await page.waitForTimeout(300);
    await page.mouse.click(2000 * fx, 1150 * fy);
    await page.waitForTimeout(1500);
    if (await visible()) break;
  }
  await page.mouse.move(5, 5);
  await page.waitForTimeout(3500);
  await shot(page, 'book');
  await ctx.close();
}
{
  const { ctx, page } = await open(1440, 900, 2);
  await page.mouse.move(5, 5);
  await shot(page, 'home-1440x900');
  await ctx.close();
}
{
  const { ctx, page } = await open(390, 844, 3, '', true);
  await shot(page, 'home-390x844');
  await ctx.close();
}
await browser.close();
