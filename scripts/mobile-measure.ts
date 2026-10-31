// Shared by scripts/mobile-diagnose.ts and scripts/mobile-audit.ts: the measurements taken in the page on a phone or tablet.
// `MEASURE` is the source of a function `(mode) => result` (run with page.evaluate); the result is described by `Measure`.
// mode: 'home' (the shelf page, the book panel left out), 'card' (the open book panel) or 'board' (the board overlay).

export interface Offender {
  sel: string;
  left: number;
  right: number;
  width: number;
}
export interface Measure {
  mode: string;
  /** Layout viewport width, and the scroll widths of the document and of the main scroller (the book panel for a card), px. */
  vw: number;
  vh: number;
  docScrollW: number;
  scrollerScrollW: number;
  scrollerClientW: number;
  /** Document and scroller heights (scrollHeight), px. */
  docScrollH: number;
  scrollerScrollH: number;
  /** Topmost elements reaching past the viewport sides that no narrower scroll container clips. */
  offenders: Offender[];
  /** Elements that hide content: overflow hidden/clip with more content than room, line clamps, ellipsis. */
  clipped: { sel: string; why: string }[];
  /** Text lines cut by an ancestor that clips (overflow hidden/clip): the text, the ancestor and by how much. */
  cut: { text: string; by: string; px: number }[];
  /** Pairs of main blocks whose boxes intersect (neither inside the other). */
  overlaps: { a: string; b: string; w: number; h: number }[];
  /** Running text under 16px, grouped by selector and size. */
  small: { sel: string; size: number; n: number; sample: string }[];
  /** Interactive elements under 44x44px (inline links in running text are exempt). */
  targets: { sel: string; w: number; h: number; text: string }[];
  /** How many interactive elements were looked at. */
  targetCount: number;
  /** Boxes of the main blocks, px: [left, top, width, height] in the page (scroll position added). */
  blocks: Record<string, [number, number, number, number]>;
  /** The longest line of running text, in characters. */
  cpl: number;
  /** Elements that scroll on their own (overflow auto/scroll with more content than room). */
  scrollers: string[];
}

export const MEASURE = `((mode) => {
  const doc = document.documentElement;
  const W = doc.clientWidth;
  const q = (s) => document.querySelector(s);
  const scroller = mode === 'card' ? q('.book-panel') : mode === 'board' ? q('.overlay.show') : doc;
  const root = mode === 'card' ? q('.book-panel') : mode === 'board' ? q('.overlay.show') : q('.app');
  const sel = (e) => {
    let s = e.tagName.toLowerCase();
    const c = typeof e.className === 'string' ? e.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3).join('.') : '';
    if (c) s += '.' + c;
    if (s === 'div' || s === 'span') { const p = e.parentElement; if (p) s = sel(p) + ' > ' + s; }
    return s;
  };
  const transparent = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) { if (getComputedStyle(a).opacity === '0') return true; } return false; };
  const skip = (e) => !!e.closest('.tb-measure, .tooltip, .loading, [inert], [aria-hidden="true"]') || e.tagName === 'SCRIPT' || e.tagName === 'STYLE';
  const inScope = (e) => {
    if (!root || skip(e)) return false;
    if (mode === 'home' && e.closest('.book-panel, .overlay')) return false;
    return true;
  };
  const all = root ? Array.from(root.querySelectorAll('*')).filter(inScope) : [];
  const shown = (e) => { const r = e.getBoundingClientRect(); return (r.width > 0 || r.height > 0) && getComputedStyle(e).visibility !== 'hidden' && !transparent(e); };
  const els = all.filter(shown);
  // Cards are measured from the top of the page: the controls stay put while it scrolls, over whatever passes under them.
  if (mode === 'card' && scroller) scroller.scrollTop = 0;
  const sx = window.scrollX, sy = scroller === doc ? window.scrollY : scroller ? scroller.scrollTop : 0;

  // 1. Horizontal overflow: topmost elements past the sides that no narrower overflow container clips.
  const out = new Set();
  const offenders = [];
  for (const e of els) {
    if (e.tagName === 'CANVAS') continue;
    const r = e.getBoundingClientRect();
    if (r.right <= W + 0.5 && r.left >= -0.5) continue;
    let clipped = false;
    for (let a = e.parentElement; a && a !== document.body && a !== doc; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible') { const ar = a.getBoundingClientRect(); if (ar.right <= W + 0.5 && ar.left >= -0.5) { clipped = true; break; } }
    }
    if (clipped) continue;
    out.add(e);
    if (e.parentElement && out.has(e.parentElement)) continue;
    offenders.push({ sel: sel(e), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }

  // 2. Hidden content.
  const clipped = [];
  const scrollers = [];
  for (const e of els) {
    if (e === root) continue;
    const cs = getComputedStyle(e);
    const hid = (o) => o === 'hidden' || o === 'clip';
    if (hid(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) clipped.push({ sel: sel(e), why: 'holds ' + e.scrollHeight + 'px in ' + e.clientHeight + 'px' });
    else if (hid(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && cs.textOverflow !== 'ellipsis') clipped.push({ sel: sel(e), why: 'holds ' + e.scrollWidth + 'px across in ' + e.clientWidth + 'px' });
    if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) clipped.push({ sel: sel(e), why: 'ellipsis: ' + e.scrollWidth + 'px of text in ' + e.clientWidth + 'px' });
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 1) clipped.push({ sel: sel(e), why: 'line clamp ' + cs.webkitLineClamp + ' cuts ' + (e.scrollHeight - e.clientHeight) + 'px' });
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1) scrollers.push(sel(e) + ' (x: ' + e.scrollWidth + ' in ' + e.clientWidth + ')');
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1) scrollers.push(sel(e) + ' (y: ' + e.scrollHeight + ' in ' + e.clientHeight + ')');
    // The category nav's edge fade is intended (it marks a row that scrolls); the home audit checks that it is on exactly when the row scrolls.
    if (cs.maskImage && cs.maskImage !== 'none' && !e.matches('.chips.fade-l, .chips.fade-r')) clipped.push({ sel: sel(e), why: 'masked' });
  }
  // Text cut by an ancestor that clips it.
  const cut = [];
  const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const p = t.parentElement;
    if (!p || !t.nodeValue.trim() || !inScope(p) || !shown(p)) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    const r = range.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    for (let a = p; a && a !== root && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const hid = (o) => o === 'hidden' || o === 'clip';
      if (!hid(cs.overflowX) && !hid(cs.overflowY)) continue;
      const ar = a.getBoundingClientRect();
      const over = Math.max(hid(cs.overflowY) ? Math.max(r.bottom - ar.bottom, ar.top - r.top) : 0, hid(cs.overflowX) ? Math.max(r.right - ar.right, ar.left - r.left) : 0);
      if (over > 1) { cut.push({ text: t.nodeValue.trim().slice(0, 40), by: sel(a), px: Math.round(over) }); break; }
    }
  }

  // 3. Overlaps among the main blocks.
  const blockSel = mode === 'card'
    ? ['.c-ctl', '.c-by', '.c-name', '.c-sum', '.c-chips', '.band .b-idea', '.band .b-apply', '.c-tabs', '.c-panel', '.c-foot']
    : mode === 'board'
      ? ['.board', '.board .close', '.notes', '.board-pager']
      : ['.wall-head', '.search', '.frame', '.timeline', '.plaque', '.chips', '.board-btn', '.view-toggle', '.credit', '[data-stage]'];
  const blocks = {};
  const items = [];
  for (const s of blockSel) {
    const list = Array.from(document.querySelectorAll(s)).filter((e) => inScope(e) && shown(e));
    list.forEach((e, i) => {
      const r = e.getBoundingClientRect();
      const name = s + (list.length > 1 ? '[' + i + ']' : '');
      blocks[name] = [Math.round(r.left + sx), Math.round(r.top + sy), Math.round(r.width), Math.round(r.height)];
      items.push({ name, e, r });
    });
  }
  const overlaps = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 2 && h > 2) overlaps.push({ a: a.name, b: b.name, w: Math.round(w), h: Math.round(h) });
  }

  // 4. Running text under 16px: an element with 25 or more characters of its own text, or a paragraph.
  const smallMap = new Map();
  let cpl = 0;
  for (const e of els) {
    let own = '';
    for (const n of e.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = own.trim();
    if (own.length < 25 && e.tagName !== 'P') continue;
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 15.99) {
      const key = sel(e) + '|' + fs;
      const cur = smallMap.get(key) || { sel: sel(e), size: fs, n: 0, sample: own.slice(0, 40) };
      cur.n++;
      smallMap.set(key, cur);
    }
  }
  // The longest line of running text, in characters (each character's box is grouped into lines).
  for (const e of root ? root.querySelectorAll('.c-sum, .b-idea p, .b-apply p, .mc p, .m-intro, .m-step span, .q-quote p, .q-line p') : []) {
    if (!inScope(e) || !shown(e)) continue;
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    let n = 0, y = -1e9, px = -1e9;
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const r = document.createRange();
      for (let i = 0; i < t.length; i++) {
        r.setStart(t, i); r.setEnd(t, i + 1);
        const b = r.getClientRects()[0];
        if (!b || !b.width) continue;
        const c = (b.top + b.bottom) / 2;
        if (Math.abs(c - y) > 8 || b.left < px - 1) { n = 0; y = c; }
        px = b.left; n++;
        if (n > cpl) cpl = n;
      }
    }
  }

  // 5. Touch targets.
  const targets = [];
  let targetCount = 0;
  for (const e of els) {
    const tag = e.tagName;
    const interactive = tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY' || (tag === 'A' && e.hasAttribute('href')) || e.getAttribute('role') === 'button' || e.getAttribute('role') === 'tab' || e.getAttribute('role') === 'option';
    if (!interactive) continue;
    const cs = getComputedStyle(e);
    if (cs.pointerEvents === 'none') continue;
    if (tag === 'A' && cs.display === 'inline') continue; // an inline link in running text
    targetCount++;
    const r = e.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) targets.push({ sel: sel(e), w: Math.round(r.width), h: Math.round(r.height), text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30) });
  }

  return {
    mode, vw: W, vh: innerHeight,
    docScrollW: doc.scrollWidth, scrollerScrollW: scroller ? scroller.scrollWidth : 0, scrollerClientW: scroller ? scroller.clientWidth : 0,
    docScrollH: doc.scrollHeight, scrollerScrollH: scroller ? scroller.scrollHeight : 0,
    offenders, clipped, cut, overlaps, small: Array.from(smallMap.values()), targets, targetCount, blocks, cpl, scrollers,
  };
})`;
