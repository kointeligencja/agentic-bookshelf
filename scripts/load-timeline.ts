// First-load timeline of the shelf on a production build: cold browser (new profile each run), with no throttling and with "Fast 4G".
// Marks come from src/lib/marks.ts (User Timing), fetches from Playwright's request timings (workers included).
// Usage: npx vite build && npx vite preview --port 5183   then   npx tsx scripts/load-timeline.ts <out.json> [runs=2] [baseUrl]   Env: CHROME_BIN
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const out = process.argv[2] ?? '/tmp/load-timeline.json';
const runs = Number(process.argv[3] ?? 2);
const base = process.argv[4] ?? 'http://localhost:5183';
const NETS: Record<string, { down: number; up: number; latency: number } | null> = {
  none: null,
  fast4g: { down: (9 * 1024 * 1024) / 8, up: (1.5 * 1024 * 1024) / 8, latency: 150 },
};
const FILES: [string, RegExp][] = [
  ['js', /\/assets\/index-.*\.js$/],
  ['css', /\/assets\/index-.*\.css$/],
  ['books.json', /books\.json/],
  ['agentic.json', /\/agentic\.json/],
  ['cards.json', /agentic-cards\.json/],
  ['spines atlas', /spines-0.*\.ktx2/],
  ['covers atlas', /covers-0.*\.ktx2/],
  ['transcoder js', /basis_transcoder\.js/],
  ['transcoder wasm', /basis_transcoder\.wasm/],
];

async function once(net: string) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--headless=new', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cfg = NETS[net];
  if (cfg) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: cfg.down, uploadThroughput: cfg.up, latency: cfg.latency });
  }
  const fetched: { url: string; start: number; end: number; size: number }[] = [];
  page.on('requestfinished', async (r) => {
    const t = r.timing();
    const size = await r.sizes().then((s) => s.responseBodySize).catch(() => 0);
    fetched.push({ url: r.url(), start: t.startTime, end: t.startTime + t.responseEnd, size });
  });
  await page.addInitScript(`window.__long = [];
    new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => [Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });`);
  await page.goto(base + '/', { waitUntil: 'commit' });
  await page.waitForFunction(`performance.getEntriesByName('bs:intro-done').length > 0 || document.querySelector('.app.ready') && performance.now() > 40000`, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  const cs = await ctx.newCDPSession(page);
  await cs.send('Performance.enable');
  const cdpm = await cs.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const cpu: Record<string, number> = {};
  for (const m of (cdpm as { metrics: { name: string; value: number }[] }).metrics) if (['ThreadTime', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'].includes(m.name)) cpu[m.name] = Math.round(m.value * 1000);
  const data = (await page.evaluate(`(() => {
    const marks = {};
    for (const m of performance.getEntriesByType('mark')) if (m.name.startsWith('bs:')) marks[m.name.slice(3)] = m.startTime;
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime ?? null;
    const nav = performance.getEntriesByType('navigation')[0];
    return { marks, fcp, origin: performance.timeOrigin, costs: window.__costs || {}, long: window.__long, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
  })()`)) as { marks: Record<string, number>; fcp: number | null; origin: number; costs: Record<string, number>; long: number[][]; domContentLoaded: number; load: number };
  await browser.close();
  const files: Record<string, { end: number; start: number; kb: number }> = {};
  for (const [name, re] of FILES) {
    const f = fetched.find((x) => re.test(x.url));
    if (f) files[name] = { start: Math.round(f.start - data.origin), end: Math.round(f.end - data.origin), kb: Math.round(f.size / 1024) };
  }
  return { ...data, files, cpu };
}

const result: Record<string, unknown[]> = {};
for (const net of Object.keys(NETS)) {
  result[net] = [];
  for (let i = 0; i < runs; i++) {
    const r = await once(net);
    result[net]!.push(r);
    const m = r.marks;
    const f = (k: string) => (r.files[k] ? r.files[k]!.end : '-');
    console.log(net, i, 'fcp', Math.round(r.fcp ?? 0), 'ui', Math.round(m['ui-painted'] ?? 0), 'js', f('js'), 'jsEval', Math.round(m['js-evaluated'] ?? 0), 'books', f('books.json'), 'spAtlas', f('spines atlas'), 'cvAtlas', f('covers atlas'), 'wasm', f('transcoder wasm'),
      'atlasReady', Math.round(m['atlas-ready'] ?? 0), 'shaders', Math.round(m['shaders-compiled'] ?? 0), 'books', Math.round(m['books-mounted'] ?? 0), 'room', Math.round(m['room-mounted'] ?? 0), 'sceneReady', Math.round(m['scene-ready'] ?? 0), 'frame1', Math.round(m['first-frame-drawn'] ?? 0), 'intro', Math.round(m['intro-done'] ?? 0), 'tex', Math.round(r.costs['texture'] ?? 0), 'long', JSON.stringify(r.long));
  }
}
await writeFile(out, JSON.stringify(result, null, 1));
