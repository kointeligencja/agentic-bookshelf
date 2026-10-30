// Shared schema between the build-time pipeline and the client.

export type ExclusiveShelf = 'read' | 'currently-reading' | 'to-read';

export type BindingClass = 'hardcover' | 'paperback' | 'massMarket' | 'ebook' | 'unknown';

/** Millimetres. h = height, w = front-to-back depth on the shelf, t = spine thickness. */
export interface Dims {
  h: number;
  w: number;
  t: number;
}

export interface Palette {
  /** Dominant colour, used for the spine background and boards. */
  dominant: string;
  /** Accent colour, used for spine bands and type. */
  accent: string;
  /** Readable text colour on top of `dominant`. */
  text: string;
}

export interface SpineAtlasRef {
  sheet: number;
  /** Normalised [u, v, width, height], v measured from the top of the sheet. */
  uv: [number, number, number, number];
}

export interface BookLinks {
  goodreads: string;
  amazon: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  shelf: ExclusiveShelf;
  favourite: boolean;
  /** 0 = unrated. */
  rating: number;
  avgRating: number;
  /** ISO date (YYYY-MM-DD) or null. */
  dateRead: string | null;
  dateAdded: string | null;
  year: number | null;
  publisher: string | null;
  pages: number;
  pagesEstimated: boolean;
  binding: BindingClass;
  dims: Dims;
  palette: Palette;
  category: string;
  secondaryCategory: string | null;
  coverUrl: string;
  /** URL of a tiny blurred placeholder image. */
  coverPlaceholder: string;
  coverAspect: number;
  spineAtlas: SpineAtlasRef;
  /** Cover thumbnail in the face-out atlas. */
  coverAtlas: SpineAtlasRef;
  links: BookLinks;
  /** Only present when SHOW_REVIEWS is enabled at build time. */
  review?: string;
}

export interface Category {
  slug: string;
  name: string;
  /** A shorter name for the category nav, where space is tight. */
  short?: string;
  description: string;
}

export interface AtlasSheet {
  url: string;
  width: number;
  height: number;
}

export interface Library {
  generatedAt: string;
  categories: Category[];
  atlas: AtlasSheet[];
  coverAtlas: AtlasSheet[];
  books: Book[];
}

// The Agentic Bookshelf: the conversation and how its ideas map onto the books.
// Built by scripts/agentic.ts into public/data/agentic.json.

export interface AgenticClip {
  /** Seconds into the video. */
  start: number;
  end: number;
  label: string;
}

/** One idea from the conversation, with the stretches of the video where it is discussed. */
export interface AgenticThesis {
  key: string;
  title: string;
  line: string;
  clips: AgenticClip[];
}

export interface AgenticBook {
  /** Id of the book in the 3D library (`Book.id`). */
  id: string;
  /** Our own slug, kept for the concept cards. */
  slug: string;
  title: string;
  author: string;
}

export interface AgenticConcept {
  id: string;
  name: string;
  /** 3D library ids of the books that carry this concept. */
  bookIds: string[];
  /** Keys of the theses it extends. */
  theses: string[];
  /** The idea in one line, for lists, the board and search. */
  summary: string;
  /** How far the card was checked against the books: ✓ checked, ⚠ checked and corrected, ? not yet. */
  status: string;
  /** A concept to read first on its theme (start_here in the source). */
  startHere?: boolean;
}

/** A line of the conversation that bears on a concept, with where to find it in the video. */
export interface AgenticConversationLine {
  speaker: string;
  /** `m:ss` as shown. */
  at: string;
  /** Seconds into the video. */
  at_s: number;
  text: string;
}

/** The card for a concept (public/data/agentic-cards.json, keyed by concept id). */
export interface AgenticCard {
  title: string;
  sources: { book: string; authors: string }[];
  idea?: string[];
  why?: string[];
  stories?: { source: string; text: string }[];
  method?: { source?: string; intro?: string; steps?: string[] };
  limits?: string[];
  tension?: string;
  quotes?: { text: string; source: string; verified: boolean }[];
  conversation?: AgenticConversationLine[];
  /** Our own suggestion, labelled as such. */
  apply?: { label: string; text: string };
  depth?: string;
}

export interface Agentic {
  video: { id: string; url: string; duration: number };
  theses: AgenticThesis[];
  books: AgenticBook[];
  concepts: AgenticConcept[];
}
