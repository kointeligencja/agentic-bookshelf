// Stage 2E audit: one grid, one type scale. At 1280x800 and 1440x900 it opens four states (home, theme 8 active, a search
// with results from a mocked API, a card open) and checks, in each: the page does not scroll; the left column's blocks share
// a left edge and a width and sit --s2 apart; every text node in our UI uses one of the four type sizes; every text node has
// at least 4.5:1 contrast against what is really behind it (measured from a screenshot taken with the text made transparent);
// theme entries stay on one line; the category nav is centred on the bookcase (or clamped); the board button is as tall as the
// nav; the bookcase's top and bottom against the search pill's top and the theme card's bottom.
// Usage: npx tsx scripts/layout-audit.ts [baseUrl]      (needs `npx vite --port 5181` running)
// Env: CHROME_BIN = a Chromium executable to use instead of Playwright's own; SHOTS_DIR (default /tmp/shots3d) and PREFIX
// (default 2e-after) for the screenshots; AUDIT=0 to take the screenshots only.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5181';
const shotsDir = process.env.SHOTS_DIR ?? '/tmp/shots3d';
const prefix = process.env.PREFIX ?? '2e-after';
const audit = process.env.AUDIT !== '0';
const sizes: [number, number][] = [
  [1280, 800],
  [1440, 900],
];
/** The four type sizes of our UI, px. */
const SIZES = [28, 20, 14, 12];
const AA = 4.5;

const MOCK = {
  gate: 0.82,
  ranked: [
    { id: 'commander-intent', p: 0.82 },
    { id: 'humble-inquiry', p: 0.61 },
    { id: 'fix-flex', p: 0.55 },
    { id: 'what-why-how', p: 0.44 },
    { id: 'conviction-consequence', p: 0.38 },
    { id: 'statement-of-work', p: 0.31 },
    { id: 'tosca', p: 0.3 },
  ],
};

async function mockSearch(page: Page) {
  await page.route('**/api/search', async (route) => {
    const stage = JSON.parse(route.request().postData() ?? '{}').stage as string;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stage === 'full' ? { ...MOCK, results: MOCK.ranked } : MOCK),
    });
  });
}

/** In the page: the text nodes of our UI, with what is needed to judge them. */
const TEXTS = `(() => {
  const out = [];
  const root = document.querySelector('.app');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const vis = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    }
    return true;
  };
  const opacity = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const rgba = (s) => { const m = s.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('.c-measure-wrap, canvas, script, style') || !vis(el) || el.closest('[aria-hidden="true"]:not(.loading)') && !el.closest('.book-panel')) continue;
    if (el.closest('.loading')) continue;
    if (el.disabled || el.closest('button:disabled')) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const rb = r.getBoundingClientRect();
    // Clipped by an ancestor with overflow hidden (an ellipsised line): only the visible part counts.
    let b = { left: rb.left, right: rb.right, top: rb.top, bottom: rb.bottom };
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a);
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
      const ab = a.getBoundingClientRect();
      b = { left: Math.max(b.left, ab.left), right: Math.min(b.right, ab.right), top: Math.max(b.top, ab.top), bottom: Math.min(b.bottom, ab.bottom) };
    }
    b.width = b.right - b.left; b.height = b.bottom - b.top;
    if (b.width < 1 || b.height < 1 || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    const c = rgba(cs.color);
    out.push({
      text: n.textContent.trim().slice(0, 28),
      cls: (el.className && el.className.toString ? el.className.toString() : '') || el.tagName.toLowerCase(),
      size: parseFloat(cs.fontSize),
      family: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      color: c, alpha: c.a * opacity(el),
      rect: { x: b.left, y: b.top, w: b.width, h: b.height },
    });
  }
  for (const input of document.querySelectorAll('.app input')) {
    const b = input.getBoundingClientRect();
    if (!b.width || getComputedStyle(input).visibility === 'hidden' || input.closest('.pane.off')) continue;
    const cs = getComputedStyle(input, '::placeholder');
    const c = rgba(cs.color);
    out.push({ text: '(placeholder)', cls: 'search input', size: parseFloat(getComputedStyle(input).fontSize), family: getComputedStyle(input).fontFamily.split(',')[0].replace(/["']/g, ''), color: c, alpha: c.a, rect: { x: b.left + 14, y: b.top + 8, w: 120, h: b.height - 16 } });
  }
  return out;
})()`;

/** In the page: contrast of each text node against the screenshot (base64 PNG) taken with the text transparent. */
const CONTRAST = (png: string) => `(async () => {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/png;base64,${png}'; });
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const items = window.__texts;
  return items.map((t) => {
    let worst = 99, at = null;
    const x0 = Math.max(0, Math.floor(t.rect.x)), y0 = Math.max(0, Math.floor(t.rect.y));
    const x1 = Math.min(img.width - 1, Math.ceil(t.rect.x + t.rect.w)), y1 = Math.min(img.height - 1, Math.ceil(t.rect.y + t.rect.h));
    const nx = Math.max(1, Math.min(14, x1 - x0)), ny = Math.max(1, Math.min(3, y1 - y0));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = Math.round(x0 + ((i + 0.5) / nx) * (x1 - x0)), y = Math.round(y0 + ((j + 0.5) / ny) * (y1 - y0));
      const d = g.getImageData(x, y, 1, 1).data;
      const bg = { r: d[0], g: d[1], b: d[2] };
      const a = t.alpha;
      const fg = { r: t.color.r * a + bg.r * (1 - a), g: t.color.g * a + bg.g * (1 - a), b: t.color.b * a + bg.b * (1 - a) };
      const l1 = lum(fg), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < worst) { worst = ratio; at = { bg: [d[0], d[1], d[2]] }; }
    }
    return { text: t.text, cls: t.cls, size: t.size, ratio: Math.round(worst * 100) / 100, bg: at && at.bg };
  });
})()`;

/** In the page: geometry of the left column, the nav, the board button, the theme entries and the bookcase. */
const GEOMETRY = `(() => {
  const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const wall = R('.wall');
  const col = ['.wall-head', '.search', '.frame', '.timeline', '.plaque'].map((s) => ({ s, ...R(s) }));
  const doc = document.documentElement;
  const idx = [...document.querySelectorAll('.idx')].map((e) => {
    const t = e.querySelector('.t'); const b = e.getBoundingClientRect(); const tb = t.getBoundingClientRect();
    return { h: b.height, wrapped: tb.height > parseFloat(getComputedStyle(t).lineHeight) * 1.5, cut: t.scrollWidth > t.clientWidth + 0.5 || e.scrollWidth > e.clientWidth + 0.5, top: b.top };
  });
  const cs = (document.querySelector('.card') || null);
  const cp = window.__case ? [window.__project(window.__case.width / 2, window.__case.height, window.__case.depth), window.__project(window.__case.width / 2, 0, window.__case.depth)] : null;
  return {
    scroll: Math.max(doc.scrollHeight - innerHeight, document.body.scrollHeight - innerHeight, doc.scrollWidth - innerWidth),
    wall, col, idx, nav: R('.chips'), board: R('.board-btn'), search: R('.search'), plaque: R('.plaque'), credit: R('.credit'), toggle: R('.view-toggle'),
    caseTop: cp && cp[0].y, caseBottom: cp && cp[1].y, caseCx: cp && cp[0].x,
    navCx: (() => { const n = document.querySelector('.chips'); if (!n) return null; const b = n.getBoundingClientRect(); return (b.left + b.right) / 2; })(),
    resultsHeight: (document.querySelector('.results') || {}).clientHeight || null,
    ts: [...document.querySelectorAll('.ts')].map((e) => e.getBoundingClientRect().height),
  };
})()`;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
await mkdir(shotsDir, { recursive: true });
const failures: string[] = [];
const summary: string[] = [];
const report: Record<string, unknown> = {};
const fail = (vp: string, state: string, msg: string) => failures.push(`${vp} ${state}: ${msg}`);

for (const [w, h] of sizes) {
  const vp = `${w}x${h}`;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.addInitScript('window.__name = (f) => f');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockSearch(page);

  const states: { name: string; open: (p: Page) => Promise<void>; url: string }[] = [
    { name: 'home', url: base, open: async () => {} },
    { name: 'theme8', url: `${base}/?t=8`, open: async () => {} },
    {
      name: 'search',
      url: base,
      open: async (p) => {
        await p.fill('.search input', 'my agent keeps ignoring the plan');
        await p.keyboard.press('Enter');
        await p.waitForSelector('.res', { timeout: 8000 });
        await p.waitForTimeout(600);
      },
    },
    {
      name: 'card',
      url: `${base}/#book/900000043/commander-intent`,
      open: async (p) => {
        await p.waitForSelector('.card[data-level]', { timeout: 20000 });
        await p.waitForTimeout(4500);
      },
    },
  ];

  for (const st of states) {
    await page.goto('about:blank');
    await page.goto(st.url, { waitUntil: 'load' });
    await page.waitForSelector('.app.ready', { timeout: 60000 });
    await page.waitForTimeout(st.name === 'card' ? 1500 : 3200);
    await st.open(page);
    await page.screenshot({ path: path.join(shotsDir, `${prefix}-${st.name}-${w}.png`) });
    if (!audit) continue;
    const tag = `${vp} ${st.name}`;
    const g = (await page.evaluate(GEOMETRY)) as any;
    report[tag] = g;
    if (g.scroll > 0) fail(vp, st.name, `page scrolls by ${g.scroll}px`);

    if (st.name !== 'card') {
      // Left column: shared left edge and width, --s2 apart.
      const wall = g.wall;
      let prev: any = null;
      for (const c of g.col) {
        if (!c.w) continue;
        if (Math.abs(c.l - wall.l) > 1) fail(vp, st.name, `${c.s} left edge ${c.l.toFixed(1)} vs ${wall.l.toFixed(1)}`);
        if (Math.abs(c.w - wall.w) > 1) fail(vp, st.name, `${c.s} width ${c.w.toFixed(1)} vs ${wall.w.toFixed(1)}`);
        if (prev && Math.abs(c.t - prev.b - 16) > 1) fail(vp, st.name, `gap above ${c.s} is ${(c.t - prev.b).toFixed(1)}px`);
        prev = c;
      }
      if (Math.abs(wall.l - 24) > 1 || Math.abs(g.nav.t - 24) > 1 || Math.abs(g.board.t - 24) > 1 || Math.abs(g.board.r - (w - 24)) > 1) fail(vp, st.name, 'outer margin is not 24px');
      if (g.credit && Math.abs(h - g.credit.b - 24) > 1.5) fail(vp, st.name, `footer bottom margin ${(h - g.credit.b).toFixed(1)}px`);
      if (g.credit && Math.abs(g.credit.l - 24) > 1) fail(vp, st.name, `footer left margin ${g.credit.l.toFixed(1)}px`);
      if (g.plaque && g.credit && g.credit.t - g.plaque.b < 7.5) fail(vp, st.name, 'plaque is too close to the footer');
      if (Math.abs(g.nav.h - g.board.h) > 0.5) fail(vp, st.name, `board button ${g.board.h}px high, nav ${g.nav.h}px`);
      if (g.caseCx !== null) {
        const lo = g.wall.r + 16 + g.nav.w / 2;
        const hi = g.board.l - 16 - g.nav.w / 2;
        const want = Math.min(hi, Math.max(lo, g.caseCx));
        if (Math.abs(g.navCx - want) > 2) fail(vp, st.name, `nav centre ${g.navCx.toFixed(0)} vs bookcase centre ${g.caseCx.toFixed(0)} (clamped ${want.toFixed(0)})`);
      }
      if (g.nav.l < g.wall.r || g.nav.r > g.board.l) fail(vp, st.name, 'nav overlaps the left column or the board button');
      const bad = g.idx.filter((i: any) => i.wrapped || i.cut);
      if (g.idx.length && st.name === 'home' && bad.length) fail(vp, st.name, `${bad.length} theme entries wrap or are cut`);
      if (g.idx.length) {
        const hs = new Set(g.idx.map((i: any) => Math.round(i.h * 10)));
        if (hs.size > 1) fail(vp, st.name, 'theme entries differ in height');
      }
      for (const t of g.ts) if (t < 24) fail(vp, st.name, `timestamp link ${t}px high`);
    }

    // Type sizes and contrast.
    const texts = (await page.evaluate(TEXTS)) as { text: string; cls: string; size: number; family: string }[];
    for (const t of texts) if (!SIZES.includes(t.size)) fail(vp, st.name, `font size ${t.size}px: "${t.text}" (${t.cls})`);
    const serif = texts.filter((t) => /garamond/i.test(t.family)).map((t) => `${t.text} (${t.cls})`);
    report[`${tag} serif`] = serif;
    await page.evaluate(`window.__texts = ${JSON.stringify(texts)}`);
    await page.addStyleTag({ content: '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; transition: none !important; } ::placeholder { color: transparent !important; }' });
    await page.waitForTimeout(250);
    const png = (await page.screenshot()).toString('base64');
    const rows = (await page.evaluate(CONTRAST(png))) as { text: string; cls: string; size: number; ratio: number; bg: number[] }[];
    for (const r of rows) if (r.ratio < AA) fail(vp, st.name, `contrast ${r.ratio}: "${r.text}" (${r.cls}) on rgb(${r.bg})`);
    const worst = rows.reduce((a, b) => (b.ratio < a.ratio ? b : a), rows[0]!);
    summary.push(`${tag}: ${texts.length} text nodes, sizes {${[...new Set(texts.map((t) => t.size))].sort((a, b) => b - a).join(', ')}}, lowest contrast ${worst.ratio} ("${worst.text}")${serif.length ? `, serif: ${[...new Set(serif)].slice(0, 6).join('; ')}` : ''}`);

    if (st.name === 'home') {
      const c = g;
      summary.push(
        `${tag}: left column x=${c.wall.l.toFixed(0)} w=${c.wall.w.toFixed(0)} (widths ${c.col.map((x: any) => x.w.toFixed(0)).join('/')}, left edges ${c.col.map((x: any) => x.l.toFixed(0)).join('/')}), ` +
          `nav centre ${c.navCx?.toFixed(0)} vs bookcase centre ${c.caseCx?.toFixed(0)}, nav h ${c.nav.h}, board h ${c.board.h}`,
      );
      if (c.caseTop !== null) summary.push(`${tag}: bookcase top ${c.caseTop.toFixed(1)} vs search pill top ${c.search.t.toFixed(1)} (${(c.caseTop - c.search.t).toFixed(1)}px); bottom ${c.caseBottom.toFixed(1)} vs theme card bottom ${c.plaque.b.toFixed(1)} (${(c.caseBottom - c.plaque.b).toFixed(1)}px)`);
    }
    if (st.name === 'search') summary.push(`${tag}: results area ${g.resultsHeight}px high, ${await page.locator('.res').count()} rows`);
  }
  if (errors.length) failures.push(`${vp}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  await page.close();
}
await browser.close();
await writeFile('/tmp/layout-audit.json', JSON.stringify(report, null, 1));
console.log(summary.join('\n'));
console.log(`\n${failures.length} failure(s)`);
for (const f of failures.slice(0, 60)) console.log('  ' + f);
console.log('wrote /tmp/layout-audit.json');
