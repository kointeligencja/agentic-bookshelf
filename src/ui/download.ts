import {
  bulkToMarkdown,
  bookToMarkdown,
  topicToMarkdown,
  slugify,
} from '../lib/exportMarkdown.ts';
import { useStore } from '../store.ts';
import type { Agentic, AgenticCard, Book } from '../types.ts';

/** Triggers a browser file download of a Markdown string. */
export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ensures cards are loaded from store or fetches them if not ready yet. */
export async function getOrFetchCards(): Promise<Record<string, AgenticCard>> {
  const current = useStore.getState().cards;
  if (current && Object.keys(current).length > 0) {
    return current;
  }
  try {
    const res = await fetch('/data/agentic-cards.json');
    const cards = (await res.json()) as Record<string, AgenticCard>;
    useStore.getState().setCards(cards);
    return cards;
  } catch (err) {
    console.error('Failed to fetch cards for export:', err);
    return {};
  }
}

/** High-level helper: download cards for a specific book. */
export async function exportBookMarkdown(book: Book, data: Agentic): Promise<void> {
  const cards = await getOrFetchCards();
  const md = bookToMarkdown(book, data, cards);
  const filename = `agentic-book-${slugify(book.title)}.md`;
  downloadMarkdownFile(filename, md);
}

/** High-level helper: download cards for a topic. */
export async function exportTopicMarkdown(thesisKey: string, data: Agentic): Promise<void> {
  const cards = await getOrFetchCards();
  const thesis = data.theses.find((t) => t.key === thesisKey);
  const md = topicToMarkdown(thesisKey, data, cards);
  const prefix = thesis ? `${thesis.key}-` : '';
  const title = thesis ? thesis.title : thesisKey;
  const filename = `agentic-topic-${prefix}${slugify(title)}.md`;
  downloadMarkdownFile(filename, md);
}

/** High-level helper: download all cards in bulk. */
export async function exportBulkMarkdown(data: Agentic): Promise<void> {
  const cards = await getOrFetchCards();
  const md = bulkToMarkdown(data, cards);
  downloadMarkdownFile('agentic-bookshelf-all-cards.md', md);
}
