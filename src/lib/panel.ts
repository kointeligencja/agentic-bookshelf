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

/** From this viewport width on, a pulled-out book switches the page to reading mode; below it the card is a full-width page that scrolls. */
export const READING_MIN = 900;
/** In reading mode the left quarter of the screen holds the pulled-out book; it is at least this wide, px. */
export const STRIP_MIN = 240;
export const STRIP_SHARE = 0.25;
/** The pulled-out book is this share of the strip wide. */
export const BOOK_SHARE = 0.7;

export const isReading = (viewport: number): boolean => viewport >= READING_MIN;

/** Width in CSS pixels of the walnut strip at the left edge where the pulled-out book is held in reading mode: a quarter of the screen, 240px at least. */
export function stripWidth(viewport: number): number {
  return Math.round(Math.max(STRIP_MIN, viewport * STRIP_SHARE));
}

/**
 * Reading mode's geometry: the strip runs from the left edge to `left`, the paper page from `left` to the right edge (`width`
 * px). The pulled-out book is `book` px wide on screen and centred in the strip (`bookCentre`).
 */
export function readingPanel(viewport: number): { strip: number; left: number; width: number; book: number; bookCentre: number } {
  const strip = stripWidth(viewport);
  return { strip, left: strip, width: viewport - strip, book: Math.round(Math.max(60, strip * BOOK_SHARE)), bookCentre: strip / 2 };
}
