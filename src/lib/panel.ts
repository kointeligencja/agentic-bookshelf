/** Width in CSS pixels of the left panel (video and themes) for a viewport this wide. */
export function panelWidth(viewport: number): number {
  return Math.round(Math.min(viewport * 0.45, Math.max(360, Math.min(500, viewport * 0.36))));
}

/** The narrowest the book panel gets on a desktop screen: wide enough for a card's two columns of 40 or more characters. */
const CARD_MIN = 600;
/** Space the book panel leaves between itself and the left panel, for the pulled-out book. */
const BOOK_ROOM = 200;

/**
 * Width in CSS pixels of the book panel: just over half the space right of the left panel, but at least CARD_MIN
 * where that leaves BOOK_ROOM for the book. On a laptop screen the card then has two columns.
 */
export function cardWidth(viewport: number): number {
  const space = viewport - panelWidth(viewport);
  return Math.round(Math.max(space * 0.55, Math.min(CARD_MIN, space - BOOK_ROOM)));
}

/** From this viewport width on, a pulled-out book switches the page to reading mode; below it the card stays a single scrolling column. */
export const READING_MIN = 900;
/** Space between the reading-mode card and the viewport's edges, and between the book strip and the card (`--s4`), px. */
export const READING_MARGIN = 24;
export const READING_GAP = 32;

export const isReading = (viewport: number): boolean => viewport >= READING_MIN;

/** Width in CSS pixels of the strip at the left edge where the pulled-out book is held in reading mode. */
export function stripWidth(viewport: number): number {
  return Math.round(Math.min(220, Math.max(180, viewport * 0.15)));
}

/** The pulled-out book is held this much smaller than the strip it is held in (a fifth). */
export const BOOK_SCALE = 0.8;

/**
 * Reading mode's geometry: the book strip runs from the margin to `left - READING_GAP`, its middle is `centre`; the card
 * starts at `left` and runs `width` px to the right margin. The pulled-out book is `book` px wide on screen (a fifth less
 * than the strip, less its 24px of air) and sits against the card: its right edge is READING_GAP from the card's left edge,
 * so its middle is `bookCentre`.
 */
export function readingPanel(viewport: number): { strip: number; centre: number; left: number; width: number; book: number; bookCentre: number } {
  const strip = stripWidth(viewport);
  const left = READING_MARGIN + strip + READING_GAP;
  const book = Math.round(Math.max(60, strip - 24) * BOOK_SCALE);
  return { strip, centre: READING_MARGIN + strip / 2, left, width: viewport - READING_MARGIN - left, book, bookCentre: left - READING_GAP - book / 2 };
}
