// Search-first de-duplication for submissions (ADR 0015). Live search against
// the real catalog; matches shown as a persistent inline list (review, don't
// dismiss). ISBN-exact → a firm "already exists" banner. Once the user has
// searched, an all-clear CTA lets them proceed to the form.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@unbnd/ui";
import { api, type SearchHit } from "../lib/api";
import "./DuplicateCheck.css";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;

function normalizeIsbn(s: string): string | null {
  const digits = s.replace(/[^0-9Xx]/g, "");
  return digits.length === 13 || digits.length === 10 ? digits.toUpperCase() : null;
}

type Props = {
  onProceed: (prefill: { title: string }) => void;
};

export function DuplicateCheck({ onProceed }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setHits(null);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      api.search(q, { limit: 8 })
        .then((r) => {
          if (mine !== seq.current) return;
          setHits(r.hits);
          setLoading(false);
        })
        .catch(() => {
          if (mine !== seq.current) return;
          setHits([]); // search down → treat as no match (don't block)
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const isbn = normalizeIsbn(query);
  const isbnExact =
    isbn && hits ? hits.find((h) => h.isbn13 && normalizeIsbn(h.isbn13) === isbn) : undefined;
  const searched = hits !== null && query.trim().length >= MIN_CHARS;

  return (
    <section className="dc">
      <h2 className="dc-title">Is the book already on Unbnd?</h2>
      <p className="dc-sub">
        Search by title, author, or ISBN. Most books are already in the catalog.
      </p>
      <div className="dc-row">
        <input
          className="dc-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalog"
          aria-label="Search the catalog for an existing book"
        />
      </div>

      {loading && <p className="dc-status" role="status">Searching…</p>}

      {isbnExact && (
        <div className="dc-exact" role="alert">
          <span>This book is already on Unbnd.</span>
          <Link className="dc-exact-link" to={`/book/${isbnExact.slug}`}>
            Open {isbnExact.title} →
          </Link>
        </div>
      )}

      {searched && !loading && hits && hits.length > 0 && !isbnExact && (
        <>
          <p className="dc-matches-label">Possible matches — open one if it's your book:</p>
          <ul className="dc-matches">
            {hits.map((h) => (
              <li key={h.slug}>
                <Link className="dc-match" to={`/book/${h.slug}`}>
                  <span className="dc-match-title">{h.title}</span>
                  <span className="dc-match-author">{h.authorName}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="md"
            className="dc-proceed-quiet"
            type="button"
            onClick={() => onProceed({ title: query.trim() })}
          >
            Don't see your book? Add it anyway
          </Button>
        </>
      )}

      {searched && !loading && hits && hits.length === 0 && (
        <div className="dc-clear">
          <p className="dc-clear-note">No match found — this looks new.</p>
          <Button
            variant="ink"
            size="md"
            className="dc-proceed"
            type="button"
            onClick={() => onProceed({ title: query.trim() })}
          >
            Add this book
          </Button>
        </div>
      )}
    </section>
  );
}
