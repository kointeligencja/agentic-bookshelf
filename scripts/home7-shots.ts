// Desktop home composition (stage 7): a screenshot at each size (dpr 2) and the measured gaps. Needs `npx vite --port 5181` (dev probes).
// Usage: npx tsx scripts/home7-shots.ts <out dir> [baseUrl]   Env: CHROME_BIN
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const dir = process.argv[2] ?? '/tmp/home7';
const base = process.argv[3] ?? 'http://localhost:5181';
const SIZES: [number, number][] = [[1280, 800], [1440, 900], [1920, 1080], [2000, 1150], [2560, 1440]];
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

const MEASURE = `(() => {
  const q = (s) => document.querySelector(s);
  const r = (s) => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const c = window.__case;
  const pts = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => window.__project(x, y, c.depth));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const cs = { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
  const col = r('.wall'), kids = ['.wall-head', '.search-wrap', '.frame', '.timeline', '.plaque'].map((s) => [s, r(s)]);
  const colRight = Math.max(...kids.map(([, b]) => b.r));
  const colLeft = Math.min(...kids.map(([, b]) => b.l));
  const nav = r('.chips'), board = r('.board-btn'), tog = r('.view-toggle'), foot = r('.credit'), plaque = r('.plaque');
  const footEl = q('.credit');
  return {
    vw, vh,
    column: { left: colLeft, right: colRight, width: colRight - colLeft },
    case: cs, caseW: cs.r - cs.l, caseH: cs.b - cs.t,
    gapColumnToCase: cs.l - colRight,
    leftMargin: colLeft, rightMargin: vw - cs.r,
    groupCentreOffset: (colLeft + cs.r) / 2 - vw / 2,
    navCentreMinusCaseCentre: nav.l + nav.w / 2 - (cs.l + cs.r) / 2, nav, board,
    boardRightToGroupRight: cs.r - board.r, toggleRightToGroupRight: cs.r - tog.r,
    footerLeftToGroupLeft: foot.l - colLeft, footerClipped: footEl.scrollWidth > footEl.clientWidth + 1,
    navOverlapsBoard: nav.r > board.l, navClipped: q('.chips').scrollWidth > q('.chips').clientWidth + 1,
    plaqueBottom: plaque.b, plaqueHeight: plaque.b - plaque.t, columnBottomRoom: vh - plaque.b,
    scroll: { x: document.documentElement.scrollWidth - vw, y: document.documentElement.scrollHeight - vh },
  };
})()`;

const out: Record<string, unknown> = {};
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('.app.ready', { timeout: 60000 });
  await page.evaluate('document.fonts.ready');
  await page.waitForTimeout(3500);
  out[`${w}x${h}`] = await page.evaluate(MEASURE);
  await page.screenshot({ path: `${dir}/home-${w}x${h}.png` });
  await ctx.close();
}
await browser.close();
await writeFile(`${dir}/measure.json`, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out) as [string, any][])
  console.log(k, 'col', v.column.width.toFixed(0), 'gap', v.gapColumnToCase.toFixed(1), 'L', v.leftMargin.toFixed(1), 'R', v.rightMargin.toFixed(1), 'case', v.caseW.toFixed(0), 'x', v.caseH.toFixed(0), 'top', v.case.t.toFixed(0), 'bot', (v.vh - v.case.b).toFixed(0), 'navOff', v.navCentreMinusCaseCentre.toFixed(1), 'navOverBoard', v.navOverlapsBoard, 'navClip', v.navClipped, 'footClip', v.footerClipped, 'plaqueRoom', v.columnBottomRoom.toFixed(0), 'scroll', v.scroll.x, v.scroll.y);
