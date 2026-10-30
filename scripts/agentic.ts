// Builds public/data/agentic.json for the client from data/agentic.json (the conversation, its themes
// and concepts) and data/agentic-ids.json (our slug → the 3D library's book id). The concept cards,
// which are big, go to public/data/agentic-cards.json for the book panel. The search function reads
// api/catalog.json: each concept's name, one-line summary and a longer description (data/descriptions.json).
// Usage: npm run data:agentic
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mapIds, type SourceConcept } from '../src/lib/agentic.ts';
import type { Agentic, AgenticThesis } from '../src/types.ts';

interface Source {
  video: { id: string; url: string; duration_s: number };
  theses: AgenticThesis[];
  books: { id: string; title: string; author: string }[];
  concepts: (SourceConcept & { card: unknown })[];
}

const read = async <T>(file: string) => JSON.parse(await readFile(file, 'utf8')) as T;
const src = await read<Source>('data/agentic.json');
const ids = await read<Record<string, string>>('data/agentic-ids.json');
const descriptions = await read<Record<string, string>>('data/descriptions.json');

const out: Agentic = {
  video: { id: src.video.id, url: src.video.url, duration: src.video.duration_s },
  theses: src.theses,
  books: src.books.map((b) => ({ id: mapIds(ids, [b.id], `book ${b.title}`)[0]!, slug: b.id, title: b.title, author: b.author })),
  concepts: src.concepts.map((c) => ({
    id: c.id,
    name: c.name,
    bookIds: mapIds(ids, c.book_ids, c.id),
    theses: c.theses,
    summary: c.concept,
    status: c.status,
  })),
};
const cards = Object.fromEntries(src.concepts.map((c) => [c.id, c.card]));

const catalog = src.concepts.map((c) => {
  const desc = descriptions[c.id];
  if (!desc) throw new Error(`No description for concept "${c.id}" in data/descriptions.json`);
  return { id: c.id, name: c.name, line: c.concept, desc };
});

await mkdir('public/data', { recursive: true });
await mkdir('api', { recursive: true });
await writeFile('public/data/agentic.json', JSON.stringify(out));
await writeFile('public/data/agentic-cards.json', JSON.stringify(cards));
await writeFile('api/catalog.json', JSON.stringify(catalog, null, 1));
console.log(`agentic: ${out.books.length} books, ${out.concepts.length} concepts, ${out.theses.length} themes`);
