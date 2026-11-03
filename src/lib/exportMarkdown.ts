import type { Agentic, AgenticCard, AgenticConcept, AgenticThesis, Book } from '../types.ts';

const STATUS_TEXT: Record<string, string> = {
  '✓': 'Checked against the book',
  '⚠': 'Checked; some details corrected',
  '?': 'Not yet checked',
};

/** Convert a string to a safe kebab-case slug for filenames and markdown anchors. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'card';
}

/** Formats a single concept card into structured Markdown (1-to-1 lossless content). */
export function cardToMarkdown(
  concept: AgenticConcept,
  card: AgenticCard | undefined,
  theses: AgenticThesis[],
  level: number = 1,
): string {
  const h1 = '#'.repeat(level);
  const h2 = '#'.repeat(level + 1);
  const h3 = '#'.repeat(level + 2);

  const title = card?.title || concept.name;
  const subtitle = card?.subtitle || concept.summary;

  const lines: string[] = [];

  // Title and subtitle
  lines.push(`${h1} ${title}`);
  if (subtitle) {
    lines.push(`> ${subtitle}`);
  }
  lines.push('');

  // Metadata
  const meta: string[] = [];

  // Related Topics
  if (concept.theses && concept.theses.length > 0) {
    const topicNames = concept.theses.map((k) => {
      const t = theses.find((th) => th.key === k);
      return t ? `${/^\d+$/.test(k) ? `${k}. ` : ''}${t.title}` : k;
    });
    meta.push(`- **Topics**: ${topicNames.join(' · ')}`);
  }

  // Sources
  if (card?.sources && card.sources.length > 0) {
    const sourceList = card.sources.map((s) => `*${s.book}* by ${s.authors}`);
    meta.push(`- **Sources**: ${sourceList.join('; ')}`);
  }

  // Status
  const statusLabel = STATUS_TEXT[concept.status] ?? concept.status;
  meta.push(`- **Status**: ${concept.status} ${statusLabel}`.trim());

  lines.push(meta.join('\n'));
  lines.push('');

  // With your agent (Practical application)
  if (card?.apply?.text) {
    lines.push(`${h2} With Your Agent`);
    if (card.apply.label) {
      lines.push(`*${card.apply.label}*`);
      lines.push('');
    }
    lines.push(card.apply.text);
    lines.push('');
  }

  // Core Idea
  if (card?.idea && card.idea.length > 0) {
    lines.push(`${h2} Core Idea`);
    lines.push(card.idea.join('\n\n'));
    lines.push('');
  }

  // Why it works
  if (card?.why && card.why.length > 0) {
    lines.push(`${h2} Why It Works`);
    lines.push(card.why.join('\n\n'));
    lines.push('');
  }

  // Method
  if (card?.method && (card.method.steps?.length || card.method.intro || card.method.source)) {
    lines.push(`${h2} Method`);
    if (card.method.source) {
      lines.push(`*Source: ${card.method.source}*`);
      lines.push('');
    }
    if (card.method.intro) {
      lines.push(card.method.intro);
      lines.push('');
    }
    if (card.method.steps && card.method.steps.length > 0) {
      card.method.steps.forEach((step, idx) => {
        lines.push(`${idx + 1}. ${step}`);
      });
      lines.push('');
    }
  }

  // Limits & Tension
  if ((card?.limits && card.limits.length > 0) || card?.tension) {
    lines.push(`${h2} Limits & Tension`);
    if (card?.limits && card.limits.length > 0) {
      lines.push(card.limits.join('\n\n'));
      lines.push('');
    }
    if (card?.tension) {
      lines.push(`**Tension:** ${card.tension}`);
      lines.push('');
    }
  }

  // Real stories & examples
  if (card?.stories && card.stories.length > 0) {
    lines.push(`${h2} Real Examples & Stories`);
    card.stories.forEach((s) => {
      lines.push(`${h3} ${s.source}`);
      lines.push('');
      lines.push(s.text);
      lines.push('');
    });
  }

  // Quotes from book
  if (card?.quotes && card.quotes.length > 0) {
    lines.push(`${h2} Quotes`);
    card.quotes.forEach((q) => {
      lines.push(`> "${q.text}"`);
      lines.push(`>`);
      lines.push(`> — *${q.source}*${q.verified ? '' : ' (unverified)'}`);
      lines.push('');
    });
  }

  // Conversation excerpts
  if (card?.conversation && card.conversation.length > 0) {
    lines.push(`${h2} From the Conversation`);
    card.conversation.forEach((c) => {
      lines.push(`> "${c.text}"`);
      lines.push(`>`);
      lines.push(`> — **${c.speaker}** (${c.at})`);
      lines.push('');
    });
  }

  return lines.join('\n').trim();
}

/** Formats all concept cards for a specific book into Markdown. */
export function bookToMarkdown(
  book: Book,
  data: Agentic,
  cards: Record<string, AgenticCard>,
): string {
  const concepts = data.concepts.filter((c) => c.bookIds.includes(book.id));
  const lines: string[] = [];

  lines.push(`# ${book.title}`);
  lines.push(`> By ${book.author}`);
  lines.push('');
  lines.push(
    `This document contains ${concepts.length} concept ${
      concepts.length === 1 ? 'card' : 'cards'
    } distilled from *${book.title}* from [The Agentic Bookshelf](https://github.com/kointeligencja/agentic-bookshelf), formatted to feed into AI coding agents.`,
  );
  lines.push('');

  if (concepts.length > 0) {
    lines.push('## Table of Contents');
    concepts.forEach((c, i) => {
      lines.push(`${i + 1}. [${c.name}](#${slugify(c.name)}) — ${c.summary}`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');

    concepts.forEach((c, idx) => {
      lines.push(cardToMarkdown(c, cards[c.id], data.theses, 2));
      if (idx < concepts.length - 1) {
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    });
  } else {
    lines.push('*No concepts currently recorded for this book.*');
  }

  return lines.join('\n');
}

/** Formats all concept cards for a specific topic / thesis into Markdown. */
export function topicToMarkdown(
  thesisKey: string,
  data: Agentic,
  cards: Record<string, AgenticCard>,
): string {
  const thesis = data.theses.find((t) => t.key === thesisKey);
  const title = thesis ? `${/^\d+$/.test(thesis.key) ? `${thesis.key}. ` : ''}${thesis.title}` : `Topic ${thesisKey}`;
  const concepts = data.concepts.filter((c) => c.theses && c.theses.includes(thesisKey));

  const lines: string[] = [];

  lines.push(`# ${title}`);
  if (thesis?.line) {
    lines.push(`> "${thesis.line}"`);
  }
  lines.push('');
  lines.push(
    `Distilled knowledge and actionable frameworks from ${concepts.length} concept ${
      concepts.length === 1 ? 'card' : 'cards'
    } under this topic from [The Agentic Bookshelf](https://github.com/kointeligencja/agentic-bookshelf).`,
  );
  lines.push('');

  if (concepts.length > 0) {
    lines.push('## Table of Contents');
    concepts.forEach((c, i) => {
      lines.push(`${i + 1}. [${c.name}](#${slugify(c.name)}) — ${c.summary}`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');

    concepts.forEach((c, idx) => {
      lines.push(cardToMarkdown(c, cards[c.id], data.theses, 2));
      if (idx < concepts.length - 1) {
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    });
  }

  return lines.join('\n');
}

/** Formats all 120 concept cards in bulk into a single master Markdown document. */
export function bulkToMarkdown(
  data: Agentic,
  cards: Record<string, AgenticCard>,
): string {
  const lines: string[] = [];

  lines.push('# The Agentic Bookshelf: Complete Knowledge Base');
  lines.push(
    '> 120 mental models and tactical frameworks distilled from 48 books and the conversation between Matt Pocock and Lauren Tan on working with coding agents.',
  );
  lines.push('');
  lines.push('## Topics Overview');

  data.theses.forEach((t) => {
    const matching = data.concepts.filter((c) => c.theses && c.theses.includes(t.key));
    const label = `${/^\d+$/.test(t.key) ? `${t.key}. ` : ''}${t.title}`;
    lines.push(`- [${label} (${matching.length} concepts)](#${slugify(label)}) — ${t.line}`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');

  data.theses.forEach((t, tIdx) => {
    const label = `${/^\d+$/.test(t.key) ? `${t.key}. ` : ''}${t.title}`;
    const concepts = data.concepts.filter((c) => c.theses && c.theses.includes(t.key));

    lines.push(`## ${label}`);
    if (t.line) {
      lines.push(`> "${t.line}"`);
      lines.push('');
    }

    concepts.forEach((c) => {
      lines.push('');
      lines.push(cardToMarkdown(c, cards[c.id], data.theses, 3));
      lines.push('');
      lines.push('---');
    });

    if (tIdx < data.theses.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
}
