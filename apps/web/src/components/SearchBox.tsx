// Catalog search box (ADR 0013): debounced as-you-type dropdown of top hits +
// Enter / "See all" → /search results page. Talks only to /api/search.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SearchHit } from "../lib/api";
import { Button, Icon } from "@unbnd/ui";
import "./SearchBox.css";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const DROPDOWN_LIMIT = 6;

export function SearchBox({
  placeholder = "Search by title, author, or ISBN",
  autoFocus = false,
  compact = false,
}: {
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  // Debounced lookup; ignore responses that arrive out of order.
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_CHARS) {
      setHits([]);
      setOpen(false);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      api.search(query, { limit: DROPDOWN_LIMIT })
        .then((r) => {
          if (mine === seq.current) {
            setHits(r.hits);
            setOpen(true);
          }
        })
        .catch(() => {
          if (mine === seq.current) {
            setHits([]);
            setOpen(true);
          }
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function goToResults() {
    const query = q.trim();
    if (query.length < MIN_CHARS) return;
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    goToResults();
  }

  return (
    <div className={compact ? "searchbox searchbox-compact" : "searchbox"} ref={root}>
      <form className="searchbox-form" onSubmit={onSubmit} role="search">
        <span className="searchbox-icon" aria-hidden="true">
          <Icon name="search" />
        </span>
        <input
          type="text"
          className="searchbox-input"
          placeholder={placeholder}
          aria-label="Search the catalog"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (hits.length > 0) setOpen(true);
          }}
        />
      </form>
      {open && (
        <div className="searchbox-menu" role="listbox">
          {hits.length === 0 ? (
            <p className="searchbox-empty">No matches.</p>
          ) : (
            <>
              {hits.map((h) => (
                <button
                  key={h.slug}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="searchbox-hit"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    navigate(`/book/${h.slug}`);
                  }}
                >
                  <span className="searchbox-hit-title">{h.title}</span>
                  <span className="searchbox-hit-author">{h.authorName}</span>
                </button>
              ))}
              <Button
                variant="ghost"
                block
                className="searchbox-seeall"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  goToResults();
                }}
              >
                See all results for “{q.trim()}”
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
