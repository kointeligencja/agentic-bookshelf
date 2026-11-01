// Screenshots of one concept card in the real app, per tab and viewport. Needs `npx vite --port 5181` running.
// Usage: CHROME_BIN=... npx tsx scripts/card-shots.ts <bookId> <conceptId> <tab,tab,...> <WxH,WxH,...> [outDir] [prefix]
// Writes <outDir>/<prefix>-<tab>-<w>.png (default /tmp/shots3d, 3a-<conceptId>).
import { chromium } from 'playwright';

const [bookId, conceptId, tabArg = 'default', sizeArg = '1440x900', outDir = '/tmp/shots3d', prefix = `3a-${conceptId}`] = process.argv.slice(2);
if (!bookId || !conceptId) throw new Error('usage: card-shots.ts <bookId> <conceptId> <tabs> <sizes> [outDir] [prefix]');
const base = process.env.BASE ?? 'http://localhost:5181';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const size of sizeArg.split(',')) {
  const [w, h] = size.split('x').map(Number) as [number, number];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/#book/${bookId}/${conceptId}`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.waitForSelector('.book-panel.visible .card[data-tab]', { timeout: 30000 });
  // The book flies out and the camera settles.
  await page.waitForTimeout(3500);
  for (const tab of tabArg.split(',')) {
    if (tab !== 'default') {
      await page.click(`.c-tabs [role="tab"][data-tab="${tab}"]`);
      await page.waitForTimeout(400);
    }
    const open = await page.getAttribute('.card', 'data-tab');
    await page.screenshot({ path: `${outDir}/${prefix}-${tab === 'default' ? open : tab}-${w}.png` });
    console.log(`${w}x${h} ${tab === 'default' ? `default(${open})` : tab}: ${outDir}/${prefix}-${tab === 'default' ? open : tab}-${w}.png`);
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  await page.close();
}
await browser.close();
