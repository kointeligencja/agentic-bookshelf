import { useEffect, useRef, useState } from 'react';
import { exportBulkMarkdown, exportTopicMarkdown, exportBookMarkdown } from './download.ts';
import { useStore } from '../store.ts';
import type { Agentic, Library } from '../types.ts';

interface DownloadMenuProps {
  data: Agentic;
  library: Library;
}

export function DownloadMenu({ data, library }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const theme = useStore((s) => s.theme);
  const focused = useStore((s) => s.focused);
  const menuRef = useRef<HTMLDivElement>(null);

  // Default to currently active theme if one is selected, else the first theme
  const [topic, setTopic] = useState<string>(() => theme || data.theses[0]?.key || '1');

  // Keep topic in sync when active theme changes
  useEffect(() => {
    if (theme && data.theses.some((t) => t.key === theme)) {
      setTopic(theme);
    }
  }, [theme, data.theses]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const focusedBook = focused ? library.books.find((b) => b.id === focused.id) : undefined;
  const bookConcepts = focusedBook
    ? data.concepts.filter((c) => c.bookIds.includes(focusedBook.id))
    : [];

  const handleBulk = () => {
    void exportBulkMarkdown(data);
    setOpen(false);
  };

  const handleTopic = () => {
    void exportTopicMarkdown(topic, data);
    setOpen(false);
  };

  const handleBook = () => {
    if (focusedBook) {
      void exportBookMarkdown(focusedBook, data);
      setOpen(false);
    }
  };

  return (
    <div className="dl-menu-container" ref={menuRef}>
      <button
        type="button"
        className="board-btn dl-menu-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Download concept cards in Markdown format for AI agents"
      >
        <span>Download (.md)</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="dl-popover" role="dialog" aria-label="Download concept cards for AI agents">
          <div className="dl-pop-head">
            <h4 className="dl-pop-title">Download for AI Agents (.md)</h4>
            <p className="dl-pop-desc">
              Distilled mental models in Markdown format to feed into Claude, Cursor, ChatGPT, or your own agents.
            </p>
          </div>

          <div className="dl-section">
            <button type="button" className="dl-btn-action dl-bulk" onClick={handleBulk}>
              <span className="dl-icon" aria-hidden="true">⤓</span>
              <div className="dl-btn-body">
                <strong>All 120 Cards (Bulk)</strong>
                <small>Complete knowledge base in a single file</small>
              </div>
            </button>
          </div>

          {focusedBook && bookConcepts.length > 0 && (
            <div className="dl-section">
              <div className="dl-divider">
                <span>this open book</span>
              </div>
              <button type="button" className="dl-btn-action dl-book" onClick={handleBook}>
                <span className="dl-icon" aria-hidden="true">⤓</span>
                <div className="dl-btn-body">
                  <strong>{focusedBook.title.split(/:\s+/)[0] ?? focusedBook.title}</strong>
                  <small>
                    {bookConcepts.length} {bookConcepts.length === 1 ? 'concept' : 'concepts'} from this book
                  </small>
                </div>
              </button>
            </div>
          )}

          <div className="dl-section">
            <div className="dl-divider">
              <span>or by topic</span>
            </div>
            <div className="dl-topic-select-row">
              <select
                className="dl-select"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                aria-label="Select topic to download"
              >
                {data.theses.map((t) => {
                  const count = data.concepts.filter((c) => c.theses?.includes(t.key)).length;
                  const prefix = /^\d+$/.test(t.key) ? `${t.key}. ` : '';
                  return (
                    <option key={t.key} value={t.key}>
                      {prefix}{t.title} ({count} {count === 1 ? 'card' : 'cards'})
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className="dl-btn-topic"
                onClick={handleTopic}
                title="Download all cards under this topic"
              >
                ⤓ Download Topic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
