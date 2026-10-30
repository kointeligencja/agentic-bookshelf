// The corners of the paper page in reading mode. The page runs to the right and bottom edges of the window with square corners, over the
// canvas; nothing of what is behind it (the room, the walnut, the vignette's dark corners) may show along those two edges at any window size.
// For each size (and pixel ratio) a book is pulled out, the camera comes to rest, and the ring of pixels along the right and bottom edges
// (RING px wide, from the strip to the corner) is checked: every pixel is the paper's colour, and none is dark. Also checks that no element
// at the corner has a border radius and that the page's box ends exactly on the window's edges.
// Usage: CHROME_BIN=... npx tsx scripts/corner-audit.ts [WxHxDPR,...]   (needs `npx vite --port 5181` running)
import { chromium } from 'playwright';
import sharp from 'sharp';

const base = process.env.BASE ?? 'http://localhost:5181';
const RING = 16;
const PAPER = [0xf5, 0xef, 0xe4];
const cases = (process.argv[2] ?? '1280x800x1,1440x900x1,1600x900x1,1920x1080x1,2000x1150x1,2560x1440x1,1440x900x2,1536x864x1.25,1277x799x1,1601x901x1').split(',').map((s) => s.split('x').map(Number) as [number, number, number]);
const books: [string, string][] = [['900000043', 'commander-intent'], ['900000017', 'socratic-method']];
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const [w, h, dpr] of cases) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  for (const [book, concept] of books) {
    await page.goto(`${base}/#book/${book}/${concept}`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.book-panel.visible .card[data-tab]', { timeout: 30000 });
    await page.waitForTimeout(3500);
    const geo = (await page.evaluate(`(() => {
      const p = document.querySelector('.book-panel').getBoundingClientRect();
      const radii = [];
      for (let e = document.elementFromPoint(innerWidth - 2, innerHeight - 2); e; e = e.parentElement) radii.push(getComputedStyle(e).borderBottomRightRadius);
      return { left: p.left, right: p.right, bottom: p.bottom, top: p.top, iw: innerWidth, ih: innerHeight, radii };
    })()`)) as { left: number; right: number; bottom: number; top: number; iw: number; ih: number; radii: string[] };
    const { data, info } = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const at = (x: number, y: number) => [data[(y * W + x) * 3]!, data[(y * W + x) * 3 + 1]!, data[(y * W + x) * 3 + 2]!];
    const ring = Math.round(RING * dpr);
    const x0 = Math.round(geo.left * dpr) + ring;
    let dark = 0;
    let off = 0;
    let worst = '';
    const check = (x: number, y: number) => {
      const c = at(x, y);
      const l = 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
      if (l < 200) {
        dark++;
        worst ||= `dark (${x - W},${y - H}) = ${c.join(',')}`;
      } else if (c.some((v, i) => Math.abs(v - PAPER[i]!) > 6)) {
        off++;
        worst ||= `not paper (${x - W},${y - H}) = ${c.join(',')}`;
      }
    };
    for (let y = 0; y < H; y++) for (let x = W - ring; x < W; x++) check(x, y);
    for (let y = H - ring; y < H; y++) for (let x = x0; x < W - ring; x++) check(x, y);
    const issues: string[] = [];
    if (dark || off) issues.push(`${dark} dark and ${off} off-paper pixels in the ring: ${worst}`);
    if (Math.abs(geo.right - geo.iw) > 0.01 || Math.abs(geo.bottom - geo.ih) > 0.01 || geo.top !== 0) issues.push(`page box ends at (${geo.right}, ${geo.bottom}), window is ${geo.iw}x${geo.ih}`);
    if (geo.radii.some((r) => r !== '0px')) issues.push(`a layer at the corner has a radius: ${geo.radii.join(' | ')}`);
    failed += issues.length;
    console.log(`${w}x${h}@${dpr} ${concept}: ${issues.length ? `FAIL ${issues.join('; ')}` : 'ok'}`);
  }
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} failing` : 'no failures');
process.exit(failed ? 1 : 0);
